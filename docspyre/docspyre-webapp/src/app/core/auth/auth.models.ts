export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';


export interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
}


export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}


export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
}


export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}


export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}


export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
