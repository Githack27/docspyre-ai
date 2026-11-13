import type { User } from '../../db/index.js';

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface UserLicense {
  id: string;
  type: string | null;
  name: string | null;
  billing: string | null;
  /** When the license itself ends on the portal; null means it never expires. */
  expiresAt: Date | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  status: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  country: string | null;
  state: string | null;
  license: UserLicense | null;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  avatarUrl: user.avatarUrl,
  status: user.status,
  firstName: user.firstName,
  lastName: user.lastName,
  companyName: user.companyName,
  country: user.country,
  state: user.state,
  license: user.licenseId
    ? {
        id: user.licenseId,
        type: user.licenseType,
        name: user.licenseName,
        billing: user.licenseBilling,
        expiresAt: user.licenseEndsAt,
      }
    : null,
});

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  expiresAt: string;
}
