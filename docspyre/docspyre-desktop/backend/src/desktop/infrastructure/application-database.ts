import { Pool } from 'pg';
import { runMigrations } from '../../db/migrate.js';
import {
  APPLICATION_DATABASE_PHASES,
  APPLICATION_DATABASE_STARTUP_SETTINGS,
  DOCKER_PROTOCOLS,
  DOCKER_VALIDATION,
} from '../../constants/dockerConstants.js';
import { LOOPBACK_HOST, PRIVATE_PORT_RANGE } from '../../constants/networkConstants.js';
import { DesktopInfrastructureError } from './infrastructure-error.js';

export interface ApplicationDatabaseOptions {
  /** The managed container URL. Never pass or rewrite the user's legacy DATABASE_URL. */
  databaseUrl: string;
  signal: AbortSignal;
  report: (detail: string) => void;
}

function assertManagedDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DesktopInfrastructureError('The managed application database address is invalid.');
  }
  const port = Number(url.port);
  if (
    !(DOCKER_PROTOCOLS.database as readonly string[]).includes(url.protocol) ||
    url.hostname !== LOOPBACK_HOST ||
    !Number.isInteger(port) ||
    port < PRIVATE_PORT_RANGE.minimum ||
    port > PRIVATE_PORT_RANGE.maximum ||
    !url.username ||
    !url.password ||
    !DOCKER_VALIDATION.databasePath.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new DesktopInfrastructureError(
      'The application database must use its authenticated, private managed PostgreSQL endpoint.',
    );
  }
}

function assertStartupActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DesktopInfrastructureError('Desktop application database startup was cancelled.');
  }
}

export async function prepareApplicationDatabase(options: ApplicationDatabaseOptions): Promise<void> {
  assertManagedDatabaseUrl(options.databaseUrl);
  assertStartupActive(options.signal);

  const pool = new Pool({
    connectionString: options.databaseUrl,
    max: APPLICATION_DATABASE_STARTUP_SETTINGS.poolMaximum,
    idleTimeoutMillis: APPLICATION_DATABASE_STARTUP_SETTINGS.idleTimeoutSeconds * 1000,
    connectionTimeoutMillis: APPLICATION_DATABASE_STARTUP_SETTINGS.connectTimeoutSeconds * 1000,
  });

  let phase: (typeof APPLICATION_DATABASE_PHASES)[keyof typeof APPLICATION_DATABASE_PHASES] =
    APPLICATION_DATABASE_PHASES.connect;

  try {
    options.report('Verifying access to the managed application PostgreSQL database...');
    const client = await pool.connect();
    client.release();
    assertStartupActive(options.signal);

    phase = APPLICATION_DATABASE_PHASES.migrate;
    options.report('Deploying application database schema...');
    await runMigrations(options.databaseUrl);
    assertStartupActive(options.signal);

    phase = APPLICATION_DATABASE_PHASES.verify;
    options.report("Verifying the managed application's database readiness...");
    const verifyClient = await pool.connect();
    try {
      const { rows } = await verifyClient.query("SELECT to_regclass('users') AS users_table");
      if (!rows[0]?.users_table) {
        throw new Error('Core application tables are not present');
      }
    } finally {
      verifyClient.release();
    }
    assertStartupActive(options.signal);
  } catch (error) {
    if (error instanceof DesktopInfrastructureError) throw error;
    const messages = {
      connect:
        'The managed application database rejected its authenticated startup check. Check the application database container and its saved private credentials.',
      migrate:
        'The managed application database could not apply its migrations. Check its availability and committed migration history; the database has not been reset.',
      seed:
        'The managed application database could not prepare application reference data. Check its availability and restart the application.',
      verify:
        'The managed application database migration history could not be verified. Restore the committed migration files before restarting the application.',
    };
    const causeMsg = error instanceof Error ? `: ${error.message}` : '';
    throw new DesktopInfrastructureError(
      options.signal.aborted
        ? 'Desktop application database startup was cancelled.'
        : `${messages[phase]}${causeMsg}`,
      { cause: error },
    );
  } finally {
    await pool.end();
  }
}

