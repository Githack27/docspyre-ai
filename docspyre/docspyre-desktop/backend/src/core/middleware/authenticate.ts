import type { NextFunction, Request, Response } from 'express';
import { db, eq, users } from '../../db/index.js';
import { sessionService } from '../../modules/auth/auth.service.js';
import { hasActiveLicense } from '../../shared/licensing/license-token.verifier.js';
import { ApiError } from '../utils/api-error.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const userId = sessionService.verify(req.headers.authorization);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.status !== 'active') {
      throw ApiError.unauthorized('An active user session is required');
    }

    if (!hasActiveLicense(user)) {
      throw ApiError.unauthorized('A valid DocSpyre license is required. Sign in again to continue');
    }

    req.auth = { userId: user.id };
    next();
  },
);
