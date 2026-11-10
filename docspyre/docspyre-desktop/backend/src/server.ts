import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './core/config';
import { logger } from './core/utils/logger';
import { connectDatabase, disconnectDatabase } from '@docspyre/database';
import { ensureUploadDir } from './modules/documents/document.storage';
import { documentService } from './modules/documents/document.service';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const runPurge = async (): Promise<void> => {
  try {
    const removed = await documentService.purgeExpired(env.TRASH_RETENTION_DAYS);
    if (removed > 0) logger.info(`Purged ${removed} expired trashed document(s)`);
  } catch (error) {
    logger.error('Trash purge failed', { error: error instanceof Error ? error.message : String(error) });
  }
};

const bootstrap = async (): Promise<void> => {
  await connectDatabase();
  logger.info('Database connection established');

  await ensureUploadDir();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`Docspyre API listening on http://localhost:${env.PORT}`, { env: env.NODE_ENV });
  });

  void runPurge();
  const purgeTimer = setInterval(() => void runPurge(), PURGE_INTERVAL_MS);
  purgeTimer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    clearInterval(purgeTimer);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

