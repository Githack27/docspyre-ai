export type UserStatus = 'active' | 'suspended' | 'deactivated';

export interface UserLicense {
  id: string;
  type: string | null;
  billing: string | null;
  expiresAt: string | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  status: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  country?: string | null;
  state?: string | null;
  license?: UserLicense | null;
}

export interface LicenseOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing: string;
  durationDays: number | null;
}

export interface RegistrationPayload {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  companyName: string;
  password: string;
  confirmPassword: string;
  phone: string;
  country: string;
  state: string;
  licensePlanId: string;
}

export interface RegistrationResponse {
  status: string;
  licenseId: string;
  message: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
  remember: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  expiresAt: string;
}

export interface ApiErrorResponse {
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  message?: string;
}
