import { PrismaClient } from '@prisma/client';

/**
 * Single, shared PrismaClient instance.
 *
 * PrismaClient holds a database connection pool, so instantiating it more than
 * once (e.g. on every hot-reload in development) exhausts connections. We cache
 * the instance on `globalThis` to survive module reloads during local dev.
 */
declare global {
  // eslint-disable-next-line no-var
  var __docspyrePrisma: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    log: ['warn', 'error'],
  });

export const prisma: PrismaClient = globalThis.__docspyrePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__docspyrePrisma = prisma;
}

/** Verifies connectivity. Call on application boot to fail fast. */
export const connectDatabase = async (): Promise<void> => {
  await prisma.$connect();
};

/** Gracefully closes the pool. Call on application shutdown. */
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
