import { PublicUser } from './auth.models';

const KEYS = {
  accessToken: 'docspyre.accessToken',
  refreshToken: 'docspyre.refreshToken',
  user: 'docspyre.user',
  rememberedUsername: 'docspyre.rememberedUsername',
  rememberedEmail: 'docspyre.rememberedEmail',
} as const;

export interface PersistedSession {
  accessToken: string;
  user: PublicUser;
  refreshToken?: string;
}

export class AuthStorage {
  constructor(private readonly isBrowser: boolean) {}

  save(session: PersistedSession, remember: boolean): void {
    if (!this.isBrowser) return;
    const primary = remember ? localStorage : sessionStorage;
    const secondary = remember ? sessionStorage : localStorage;

    secondary.removeItem(KEYS.accessToken);
    secondary.removeItem(KEYS.refreshToken);
    secondary.removeItem(KEYS.user);
    primary.setItem(KEYS.accessToken, session.accessToken);
    primary.setItem(KEYS.user, JSON.stringify(session.user));
    if (session.refreshToken) {
      primary.setItem(KEYS.refreshToken, session.refreshToken);
    } else {
      primary.removeItem(KEYS.refreshToken);
    }
  }

  updateAccessToken(accessToken: string): void {
    if (!this.isBrowser) return;
    const tier = localStorage.getItem(KEYS.accessToken) !== null ? localStorage : sessionStorage;
    tier.setItem(KEYS.accessToken, accessToken);
  }

  updateUser(user: PublicUser): void {
    if (!this.isBrowser) return;
    const tier = localStorage.getItem(KEYS.accessToken) !== null ? localStorage : sessionStorage;
    tier.setItem(KEYS.user, JSON.stringify(user));
  }

  updateRefreshToken(refreshToken: string): void {
    if (!this.isBrowser) return;
    const tier = localStorage.getItem(KEYS.accessToken) !== null ? localStorage : sessionStorage;
    tier.setItem(KEYS.refreshToken, refreshToken);
  }

  readAccessToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(KEYS.accessToken) ?? sessionStorage.getItem(KEYS.accessToken);
  }

  readRefreshToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(KEYS.refreshToken) ?? sessionStorage.getItem(KEYS.refreshToken);
  }

  readUser(): PublicUser | null {
    if (!this.isBrowser) return null;
    const raw = localStorage.getItem(KEYS.user) ?? sessionStorage.getItem(KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PublicUser;
    } catch {
      return null;
    }
  }

  clear(): void {
    if (!this.isBrowser) return;
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(KEYS.accessToken);
      store.removeItem(KEYS.refreshToken);
      store.removeItem(KEYS.user);
    }
  }

  setRememberedUsername(username: string | null): void {
    if (!this.isBrowser) return;
    if (username) {
      localStorage.setItem(KEYS.rememberedUsername, username);
    } else {
      localStorage.removeItem(KEYS.rememberedUsername);
    }
  }

  getRememberedUsername(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(KEYS.rememberedUsername) ?? localStorage.getItem(KEYS.rememberedEmail);
  }

  setRememberedEmail(email: string | null): void {
    this.setRememberedUsername(email);
  }

  getRememberedEmail(): string | null {
    return this.getRememberedUsername();
  }
}
