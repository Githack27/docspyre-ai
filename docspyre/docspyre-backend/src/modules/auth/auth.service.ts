import { db, eq, users, sessions, auditLogs } from '@docspyre/database';
import { ApiError } from '../../core/utils/api-error';
import { hashPassword, verifyPassword } from '../../core/utils/password';
import { signAccessToken } from '../../core/utils/jwt';
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiry } from '../../core/utils/tokens';
import { requireRow } from '../../core/utils/rows';
import { toPublicUser, type AuthContext, type AuthResult } from './auth.types';
import type { LoginInput, RegisterInput } from './auth.validation';
import type { InferSelectModel } from '@docspyre/database';

type UserRow = InferSelectModel<typeof users>;

const issueSession = async (
  user: UserRow,
  ctx: AuthContext,
): Promise<AuthResult & { sessionId: string }> => {
  const refreshToken = generateRefreshToken();

  const session = requireRow(
    await db
      .insert(sessions)
      .values({
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiry(),
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      })
      .returning(),
    'session insert',
  );

  const accessToken = signAccessToken({ sub: user.id, sid: session.id });

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
};

const recordAudit = (
  action: 'USER_REGISTERED' | 'USER_LOGIN' | 'USER_LOGIN_FAILED' | 'USER_LOGOUT',
  ctx: AuthContext,
  userId?: string,
  metadata?: Record<string, unknown>,
): void => {
  void db
    .insert(auditLogs)
    .values({
      action,
      userId: userId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: metadata ?? null,
    })
    .catch(() => undefined);
};

export const authService = {
  async register(input: RegisterInput, ctx: AuthContext): Promise<AuthResult> {
    const emailNormalized = input.email;

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);

    if (existing) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const user = requireRow(
      await db
        .insert(users)
        .values({
          email: input.email,
          emailNormalized,
          passwordHash,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          status: 'ACTIVE',
        })
        .returning(),
      'user insert',
    );

    const result = await issueSession(user, ctx);
    recordAudit('USER_REGISTERED', ctx, result.user.id);
    return result;
  },

  async login(input: LoginInput, ctx: AuthContext): Promise<AuthResult> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailNormalized, input.email))
      .limit(1);

    const passwordValid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv');

    if (!user || !passwordValid || user.deletedAt) {
      recordAudit('USER_LOGIN_FAILED', ctx, user?.id, { email: input.email });
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden('Account is not active');
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const result = await issueSession(user, ctx);
    recordAudit('USER_LOGIN', ctx, user.id);
    return result;
  },

  async refresh(rawToken: string, ctx: AuthContext): Promise<AuthResult> {
    const refreshTokenHash = hashRefreshToken(rawToken);

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw ApiError.unauthorized('Refresh token is invalid or expired');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw ApiError.forbidden('Account is not active');
    }

    const rotated = await issueSession(user, ctx);

    await db
      .update(sessions)
      .set({ revokedAt: new Date(), replacedBySessionId: rotated.sessionId })
      .where(eq(sessions.id, session.id));

    return rotated;
  },

  async logout(rawToken: string | undefined, ctx: AuthContext): Promise<void> {
    if (!rawToken) return;

    const refreshTokenHash = hashRefreshToken(rawToken);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);

    if (session && session.revokedAt === null) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, session.id));
      recordAudit('USER_LOGOUT', ctx, session.userId);
    }
  },

  async getProfile(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw ApiError.notFound('User not found');
    return toPublicUser(user);
  },
};
