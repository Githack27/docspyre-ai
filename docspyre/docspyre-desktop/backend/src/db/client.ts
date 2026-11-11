import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __docspyrePool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __docspyreDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

let activeUrl: string | undefined = undefined;

export const getPool = (connectionUrl?: string): Pool => {
  const targetUrl = connectionUrl || process.env.DATABASE_URL;
  if (!globalThis.__docspyrePool || (targetUrl && activeUrl !== targetUrl)) {
    if (globalThis.__docspyrePool) {
      globalThis.__docspyrePool.end().catch(() => {});
    }
    activeUrl = targetUrl;
    globalThis.__docspyrePool = new Pool({
      connectionString: targetUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    globalThis.__docspyreDb = drizzle(globalThis.__docspyrePool, { schema });
  }
  return globalThis.__docspyrePool;
};

const getDbInstance = (): ReturnType<typeof drizzle<typeof schema>> => {
  if (!globalThis.__docspyreDb) {
    getPool();
  }
  return globalThis.__docspyreDb!;
};

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDbInstance();
    const value = Reflect.get(instance as any, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/** Verifies connectivity. Call on application boot to fail fast. */
export const connectDatabase = async (connectionUrl?: string): Promise<void> => {
  const pool = getPool(connectionUrl);
  const client = await pool.connect();
  client.release();
};

/** Gracefully closes the pool. Call on application shutdown. */
export const disconnectDatabase = async (): Promise<void> => {
  if (globalThis.__docspyrePool) {
    await globalThis.__docspyrePool.end();
    globalThis.__docspyrePool = undefined;
    globalThis.__docspyreDb = undefined;
    activeUrl = undefined;
  }
};
