import type { User } from '@docspyre/database';

/** Request metadata captured for sessions and the audit trail. */
export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

/** Safe user representation returned to clients (never includes the hash). */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: User['status'];
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  /** Raw refresh token (delivered via HttpOnly cookie; never persisted raw). */
  refreshToken: string;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
});
