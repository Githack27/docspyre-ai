import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { UserStatus } from '@docspyre/database';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

const extractBearerToken = (header?: string): string | null => {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * Protects routes. Validates the access token, then confirms the backing
 * session is still live and the user is active. The session check means a
 * logout (or admin revocation) takes effect immediately, even before the
 * short-lived access token would naturally expire.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw ApiError.unauthorized('Missing bearer token');
    }

    const { sub: userId, sid: sessionId } = verifyAccessToken(token);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw ApiError.unauthorized('Session is no longer valid');
    }

    if (session.user.status !== UserStatus.ACTIVE || session.user.deletedAt) {
      throw ApiError.forbidden('Account is not active');
    }

    req.auth = { userId, sessionId };
    next();
  },
);
