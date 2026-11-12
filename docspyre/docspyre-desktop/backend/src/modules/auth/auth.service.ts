import { db, eq, or, users, auditLogs, type User, type NewUser } from '@docspyre/database';
import { ApiError } from '../../core/utils/api-error';
import { LicensePortalClient, type PortalClientMetadata } from '../../shared/licensing/license-portal.client';
import { LicenseTokenVerifier, type LicenseClaims } from '../../shared/licensing/license-token.verifier';
import { SessionService } from '../../shared/security/session';
import { env } from '../../core/config/env';
import { toPublicUser, type AuthContext, type AuthResult } from './auth.types';
import type { LoginInput, RegisterInput } from './auth.validation';

const portalClient = new LicensePortalClient({
  baseUrl: env.LICENSE_PORTAL_URL,
  productKey: env.LICENSE_PORTAL_PRODUCT_KEY,
  timeoutMs: env.LICENSE_PORTAL_TIMEOUT_MS,
});

const tokenVerifier = new LicenseTokenVerifier({
  portalUrl: env.LICENSE_PORTAL_URL,
  issuer: env.LICENSE_PORTAL_ISSUER,
  audience: env.LICENSE_PORTAL_AUDIENCE,
  timeoutMs: env.LICENSE_PORTAL_TIMEOUT_MS,
});

export const sessionService = new SessionService(
  env.AUTH_SESSION_SECRET,
  env.AUTH_SESSION_TTL_SECONDS,
);

const installationMetadata: PortalClientMetadata = {
  appVersion: '2.0.0',
  platform: process.platform,
};

function identityFrom(claims: LicenseClaims, token: string): Partial<NewUser> & Pick<NewUser, 'name' | 'email'> {
  return {
    portalUserId: claims.sub,
    name: claims.user.displayName,
    email: claims.user.email,
    username: claims.user.username,
    firstName: claims.user.firstName,
    lastName: claims.user.lastName,
    companyName: claims.user.companyName,
    country: claims.user.country,
    state: claims.user.state,
    licenseId: claims.license.id,
    licenseType: claims.license.type,
    licenseName: claims.license.name ?? null,
    licenseBilling: claims.license.billing,
    licenseToken: token,
    // The token lifetime (capped by the portal at the license end) gates every request, so a revoked or
    // expired license is re-checked with the portal at the next sign-in, as in KIN.
    licenseExpiresAt: new Date(claims.exp * 1000),
    licenseEndsAt: claims.license.expiresAt ? new Date(claims.license.expiresAt) : null,
  };
}

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
  async licenseOptions() {
    return { options: await portalClient.licenseOptions() };
  },

  async register(input: RegisterInput, ctx: AuthContext) {
    const { confirmPassword: _confirmed, ...registration } = input;
    const result = await portalClient.register(registration);
    recordAudit('USER_REGISTERED', ctx, undefined, { username: input.username, email: input.email });
    return { status: result.status, licenseId: result.licenseId, message: result.message };
  },

  async login(input: LoginInput, ctx: AuthContext): Promise<AuthResult> {
    const grant = await portalClient.login(input.username, input.password, installationMetadata);
    const claims = await tokenVerifier.verify(grant.token);
    const user = await this.syncUser(claims, grant.token);

    if (user.status !== 'active') {
      recordAudit('USER_LOGIN_FAILED', ctx, user.id, { reason: 'account_inactive' });
      throw ApiError.forbidden('This account has been disabled on this DocSpyre installation.');
    }

    const session = sessionService.issue(user.id, user.licenseExpiresAt);
    recordAudit('USER_LOGIN', ctx, user.id);

    return {
      user: toPublicUser(user),
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
    };
  },

  async me(userId: string): Promise<AuthResult> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.status !== 'active') {
      throw ApiError.notFound('User not found');
    }
    const session = sessionService.issue(user.id, user.licenseExpiresAt);
    return {
      user: toPublicUser(user),
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
    };
  },

  async syncUser(claims: LicenseClaims, token: string): Promise<User> {
    const identity = identityFrom(claims, token);
    const [linked] = await db
      .select()
      .from(users)
      .where(eq(users.portalUserId, claims.sub))
      .limit(1);

    if (linked) {
      return this.updated(linked.id, identity);
    }

    // First portal sign-in on this installation. The portal is the only account source, so a username or
    // email already held by another portal identity here is a conflict, not an account to adopt.
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.username, claims.user.username), eq(users.email, claims.user.email)))
      .limit(1);
    if (taken) {
      throw ApiError.conflict('Another account on this DocSpyre installation already uses this username or email.');
    }

    const [created] = await db
      .insert(users)
      .values({ ...identity, status: 'active' } as NewUser)
      .returning();

    return created;
  },

  async updated(id: string, changes: Partial<NewUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) throw ApiError.conflict('The account changed while signing in. Try again.');
    return user;
  },
};
