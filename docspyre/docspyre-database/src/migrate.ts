import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';

/**
 * Simple file-based migration runner.
 *
 * Reads SQL files from the `migrations/` directory in alphabetical order,
 * tracks which have already been applied in a `_migrations` table, and
 * executes any new ones inside a transaction.
 *
 * Usage:
 *   npm run db:migrate        (from the database project)
 *   npx tsx src/migrate.ts    (directly)
 */

const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = '_migrations';

const createPool = (): Pool =>
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

const ensureTrackingTable = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "id" serial PRIMARY KEY,
      "name" varchar(255) NOT NULL UNIQUE,
      "applied_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
};

const getApplied = async (pool: Pool): Promise<Set<string>> => {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT "name" FROM "${MIGRATIONS_TABLE}" ORDER BY "id"`,
  );
  return new Set(rows.map((row) => row.name));
};

const getPending = (applied: Set<string>): string[] => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return files.filter((file) => !applied.has(file));
};

const run = async (): Promise<void> => {
  const pool = createPool();

  try {
    console.log('Connecting to database...');
    await ensureTrackingTable(pool);

    const applied = await getApplied(pool);
    const pending = getPending(applied);

    if (!pending.length) {
      console.log('All migrations are up to date.');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):\n`);

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

      console.log(`  ▸ Applying: ${file}`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1)`,
          [file],
        );
        await client.query('COMMIT');
        console.log(`    ✓ Done`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`    ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`\n✓ ${pending.length} migration(s) applied successfully.`);
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
