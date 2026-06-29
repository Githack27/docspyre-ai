/** Credentials supplied when signing in. */
export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

/** Payload supplied when registering a new account. */
export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
}

/** Account record persisted in local storage (demo only). */
export interface StoredAccount {
  fullName: string;
  email: string;
  /** Plain text purely for this local-storage demo; never do this in production. */
  password: string;
}

/** Lightweight authenticated session, free of any credentials. */
export interface AuthSession {
  fullName: string;
  email: string;
}

/** Uniform result returned by auth operations. */
export interface AuthResult {
  success: boolean;
  message: string;
}
