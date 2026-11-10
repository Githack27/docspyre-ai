import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Single, shared connection pool and Drizzle instance.
 * Cached on globalThis to survive hot-reloads in development.
 */
declare global {
  // eslint-disable-next-line no-var
  var __docspyrePool: Pool | undefined;
}

const createPool = (): Pool =>
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

const pool: Pool = globalThis.__docspyrePool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__docspyrePool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/** Verifies connectivity. Call on application boot to fail fast. */
export const connectDatabase = async (): Promise<void> => {
  const client = await pool.connect();
  client.release();
};

/** Gracefully closes the pool. Call on application shutdown. */
export const disconnectDatabase = async (): Promise<void> => {
  await pool.end();
};
