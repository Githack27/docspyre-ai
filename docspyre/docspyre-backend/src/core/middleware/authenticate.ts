import type { NextFunction, Request, Response } from 'express';
import { db, eq, and, isNull, sessions, users } from '@docspyre/database';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

const extractBearerToken = (header?: string): string | null => {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw ApiError.unauthorized('Missing bearer token');
    }

    const { sub: userId, sid: sessionId } = verifyAccessToken(token);

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw ApiError.unauthorized('Session is no longer valid');
    }

    const [user] = await db
      .select({ status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw ApiError.forbidden('Account is not active');
    }

    req.auth = { userId, sessionId };
    next();
  },
);
