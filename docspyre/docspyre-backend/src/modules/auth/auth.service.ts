import { prisma } from '../../db/prisma';
import {
  AuditAction,
  UserStatus,
  type Prisma,
  type User,
} from '@docspyre/database';
import { ApiError } from '../../utils/api-error';
import { hashPassword, verifyPassword } from '../../utils/password';
import { signAccessToken } from '../../utils/jwt';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from '../../utils/tokens';
import {
  toPublicUser,
  type AuthContext,
  type AuthResult,
} from './auth.types';
import type { LoginInput, RegisterInput } from './auth.validation';

/**
 * Issues a fresh session (DB row + access/refresh token pair) for a user.
 * Wrapped so registration, login and refresh-rotation all share one path.
 */
const issueSession = async (
  user: User,
  ctx: AuthContext,
  tx: Prisma.TransactionClient = prisma,
): Promise<AuthResult & { sessionId: string }> => {
  const refreshToken = generateRefreshToken();

  const session = await tx.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  });

  const accessToken = signAccessToken({ sub: user.id, sid: session.id });

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
};

const recordAudit = (
  action: AuditAction,
  ctx: AuthContext,
  userId?: string,
  metadata?: Prisma.InputJsonValue,
): void => {
  // Fire-and-forget: auditing must never block or fail the auth flow.
  void prisma.auditLog
    .create({
      data: {
        action,
        userId: userId ?? null,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata,
      },
    })
    .catch(() => undefined);
};

export const authService = {
  async register(input: RegisterInput, ctx: AuthContext): Promise<AuthResult> {
    const emailNormalized = input.email; // already trimmed + lowercased by zod

    const existing = await prisma.user.findUnique({ where: { emailNormalized } });
    if (existing) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          emailNormalized,
          passwordHash,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          // No email-verification flow yet in local dev; activate immediately.
          status: UserStatus.ACTIVE,
        },
      });
      return issueSession(user, ctx, tx);
    });

    recordAudit(AuditAction.USER_REGISTERED, ctx, result.user.id);
    return result;
  },

  async login(input: LoginInput, ctx: AuthContext): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { emailNormalized: input.email },
    });

    // Always run a comparison to keep timing roughly constant whether or not
    // the user exists, and return a single generic error to avoid disclosing
    // which accounts are registered.
    const passwordValid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv');

    if (!user || !passwordValid || user.deletedAt) {
      recordAudit(AuditAction.USER_LOGIN_FAILED, ctx, user?.id, {
        email: input.email,
      });
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw ApiError.forbidden('Account is not active');
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return issueSession(user, ctx, tx);
    });

    recordAudit(AuditAction.USER_LOGIN, ctx, user.id);
    return result;
  },

  /**
   * Validates a refresh token and rotates the session: the presented session
   * is revoked and replaced by a new one. Reusing a revoked token is rejected.
   */
  async refresh(rawToken: string, ctx: AuthContext): Promise<AuthResult> {
    const refreshTokenHash = hashRefreshToken(rawToken);

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw ApiError.unauthorized('Refresh token is invalid or expired');
    }

    if (session.user.status !== UserStatus.ACTIVE || session.user.deletedAt) {
      throw ApiError.forbidden('Account is not active');
    }

    return prisma.$transaction(async (tx) => {
      const rotated = await issueSession(session.user, ctx, tx);
      await tx.session.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          replacedBySessionId: rotated.sessionId,
        },
      });
      const { sessionId: _sessionId, ...result } = rotated;
      return result;
    });
  },

  /** Revokes the session tied to a refresh token (logout). Idempotent. */
  async logout(rawToken: string | undefined, ctx: AuthContext): Promise<void> {
    if (!rawToken) return;

    const refreshTokenHash = hashRefreshToken(rawToken);
    const session = await prisma.session.findUnique({ where: { refreshTokenHash } });

    if (session && session.revokedAt === null) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      recordAudit(AuditAction.USER_LOGOUT, ctx, session.userId);
    }
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },
};
