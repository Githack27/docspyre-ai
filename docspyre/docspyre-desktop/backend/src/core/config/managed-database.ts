import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DESKTOP_APP_IDENTIFIER,
  DESKTOP_ENVIRONMENT_KEYS,
  DESKTOP_FILESYSTEM_ERROR_CODES,
  DESKTOP_PLATFORM,
  DESKTOP_RUNTIME_DIRECTORY_NAME,
} from '../../constants/desktopConstants.js';
import { DOCKER_ASSET_FILES, DOCKER_PORT_FILE_VERSION } from '../../constants/dockerConstants.js';
import { LOOPBACK_HOST, POSTGRESQL_PROTOCOLS, PRIVATE_PORT_RANGE } from '../../constants/networkConstants.js';

/** Tauri's app config directory for this identifier, where the desktop app keeps its private runtime. */
function defaultRuntimeDirectory(): string {
  const home = homedir();
  const configRoot =
    process.platform === DESKTOP_PLATFORM.windows
      ? (process.env.APPDATA ?? join(home, 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(home, 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME ?? join(home, '.config'));
  return join(configRoot, DESKTOP_APP_IDENTIFIER, DESKTOP_RUNTIME_DIRECTORY_NAME);
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === DESKTOP_FILESYSTEM_ERROR_CODES.notFound) return null;
    throw new Error(`Managed database settings at ${path} could not be read: ${(error as Error).message}`);
  }
}

const isPrivatePort = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= PRIVATE_PORT_RANGE.minimum &&
  value <= PRIVATE_PORT_RANGE.maximum;

/**
 * Builds the application database URL from the credentials and port assignment the desktop app persisted
 * when it provisioned the managed `docspyre-app-db` container. These files are the single source of truth:
 * the desktop app regenerates nothing once they exist, and records any port change in `ports.json`.
 * Returns null when the desktop app has not provisioned the database on this machine yet.
 */
export function resolveManagedDatabaseUrl(): string | null {
  const runtimeDirectory = process.env[DESKTOP_ENVIRONMENT_KEYS.runtimeDirectory] || defaultRuntimeDirectory();
  const directory = join(runtimeDirectory, DOCKER_ASSET_FILES.directory);
  const credentials = readJson(join(directory, DOCKER_ASSET_FILES.credentials));
  const ports = readJson(join(directory, DOCKER_ASSET_FILES.ports));
  if (!credentials || !ports) return null;

  const { appPostgresUsername, appPostgresPassword, appPostgresDatabase } = credentials;
  const port = ports.applicationDatabase;
  if (
    typeof appPostgresUsername !== 'string' ||
    typeof appPostgresPassword !== 'string' ||
    typeof appPostgresDatabase !== 'string' ||
    ports.version !== DOCKER_PORT_FILE_VERSION ||
    !isPrivatePort(port)
  ) {
    throw new Error(`Managed database settings in ${directory} are incomplete. Start the DocSpyre desktop app to repair them.`);
  }

  const url = new URL(`${POSTGRESQL_PROTOCOLS[1]}//${LOOPBACK_HOST}:${port}`);
  url.username = appPostgresUsername;
  url.password = appPostgresPassword;
  url.pathname = `/${appPostgresDatabase}`;
  return url.toString();
}
