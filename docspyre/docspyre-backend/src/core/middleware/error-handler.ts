import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';
import { isProduction } from '../config';

/**
 * Centralised error handler. Known operational errors (ApiError) are rendered
 * as-is. PostgreSQL unique constraint violations (code 23505) become 409s.
 * Everything else becomes a masked 500.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (isPostgresUniqueViolation(err)) {
    apiError = ApiError.conflict('A record with these details already exists');
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

/** PostgreSQL SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = '23505';

/** Detects unique constraint violations surfaced by the pg driver. */
function isPostgresUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const candidate = err as { code?: unknown; cause?: unknown };
  if (candidate.code === UNIQUE_VIOLATION) return true;

  // Drivers often wrap the original error.
  if (candidate.cause && typeof candidate.cause === 'object') {
    return (candidate.cause as { code?: unknown }).code === UNIQUE_VIOLATION;
  }

  return false;
}
