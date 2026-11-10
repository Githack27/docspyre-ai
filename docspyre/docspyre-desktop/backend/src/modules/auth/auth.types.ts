import type { InferSelectModel } from '@docspyre/database';
import type { users } from '@docspyre/database';

type UserRow = InferSelectModel<typeof users>;

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export const toPublicUser = (user: UserRow): PublicUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
});
