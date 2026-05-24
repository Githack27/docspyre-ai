import type { User } from '@repo/types';

export interface Session {
  user: User;
  accessToken: string;
  expiresAt: number;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface OAuthProvider {
  name: 'google' | 'github' | 'microsoft';
  clientId: string;
}

export function isSessionExpired(session: Session): boolean {
  return Date.now() > session.expiresAt;
}

export function getSessionUserId(session: Session | null): string | null {
  return session?.user.id ?? null;
}
