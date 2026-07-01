import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@docspyre/database';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';
import { isProduction } from '../config';

/**
 * Single source of truth for error responses. Known/operational errors are
 * rendered as-is; Prisma and unexpected errors are normalised and never leak
 * internal details (stack traces, SQL) to clients in production.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    apiError =
      err.code === 'P2002'
        ? ApiError.conflict('A record with these details already exists')
        : ApiError.badRequest('Database request could not be completed');
  } else {
    logger.error('Unhandled error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong');
  }

  res.status(apiError.statusCode).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    },
  });
};
