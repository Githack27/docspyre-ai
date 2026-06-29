import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './db/prisma';

/**
 * Composition root: verify dependencies, start listening, and wire graceful
 * shutdown so in-flight requests drain and the DB pool closes cleanly.
 */
const bootstrap = async (): Promise<void> => {
  await connectDatabase();
  logger.info('Database connection established');

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`Docspyre API listening on http://localhost:${env.PORT}`, {
      env: env.NODE_ENV,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

bootstrap().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
