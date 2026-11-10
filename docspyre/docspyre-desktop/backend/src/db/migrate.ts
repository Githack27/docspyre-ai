import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'migrations');
const MIGRATIONS_TABLE = '_migrations';

export const runMigrations = async (databaseUrl: string, migrationsFolder = MIGRATIONS_DIR): Promise<void> => {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        "id" serial PRIMARY KEY,
        "name" varchar(255) NOT NULL UNIQUE,
        "applied_at" timestamp with time zone NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await pool.query<{ name: string }>(
      `SELECT "name" FROM "${MIGRATIONS_TABLE}" ORDER BY "id"`,
    );
    const applied = new Set(rows.map((r) => r.name));

    const files = readdirSync(migrationsFolder)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const pending = files.filter((file) => !applied.has(file));

    for (const file of pending) {
      const sql = readFileSync(join(migrationsFolder, file), 'utf-8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES ($1)`,
          [file],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
};

