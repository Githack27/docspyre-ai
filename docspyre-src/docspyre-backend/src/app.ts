import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config';
import { apiRouter } from './routes';
import {
  errorHandler,
  globalRateLimiter,
  notFound,
} from './middleware';

/**
 * Builds the Express application. Kept separate from the HTTP server so it can
 * be imported directly by integration tests without binding a port.
 */
export const createApp = (): Express => {
  const app = express();

  // Trust the first proxy hop so `req.ip` and secure cookies behave correctly
  // behind a reverse proxy / load balancer.
  app.set('trust proxy', 1);

  // Security headers.
  app.use(helmet());

  // CORS: explicit allow-list, credentials enabled for the refresh cookie.
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );

  // Body & cookie parsing with sane payload limits.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Baseline rate limiting.
  app.use(globalRateLimiter);

  // API surface.
  app.use('/api/v1', apiRouter);

  // 404 + centralised error handling (must be last).
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
