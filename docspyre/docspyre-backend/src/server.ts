import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './db/prisma';
import { ensureUploadDir } from './modules/documents/document.storage';
import { documentService } from './modules/documents/document.service';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Removes Trash items older than the retention window; logs the outcome. */
const runPurge = async (): Promise<void> => {
  try {
    const removed = await documentService.purgeExpired(env.TRASH_RETENTION_DAYS);
    if (removed > 0) {
      logger.info(`Purged ${removed} expired trashed document(s)`);
    }
  } catch (error) {
    logger.error('Trash purge failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Composition root: verify dependencies, start listening, and wire graceful
 * shutdown so in-flight requests drain and the DB pool closes cleanly.
 */
const bootstrap = async (): Promise<void> => {
  await connectDatabase();
  logger.info('Database connection established');

  await ensureUploadDir();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`Docspyre API listening on http://localhost:${env.PORT}`, {
      env: env.NODE_ENV,
    });
  });

  // Auto-purge Trash on boot and daily thereafter.
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
