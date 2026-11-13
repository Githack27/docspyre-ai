import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { timingSafeEqual } from 'node:crypto';
import { env } from './core/config/index.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, globalRateLimiter, notFound } from './core/middleware/index.js';

export interface CreateAppOptions {
  desktopToken?: string;
  isDesktop?: boolean;
}

export const createApp = (options?: CreateAppOptions): Express => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());

  if (options?.isDesktop) {
    app.use(cors({ origin: true, credentials: true }));
  } else {
    app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser() as any);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (options?.desktopToken) {
    const expected = Buffer.from(options.desktopToken);
    app.use((req, res, next) => {
      if (req.method === 'OPTIONS') {
        return next();
      }
      const headerVal = req.headers['x-docspyre-desktop-token'];
      const supplied = Buffer.from(String(headerVal ?? ''));
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return res.status(401).json({ message: 'Unauthorized desktop request' });
      }
      next();
    });
  }

  app.use('/api/v1', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
