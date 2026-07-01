import { PublicUser } from './auth.models';


const KEYS = {
  accessToken: 'docspyre.accessToken',
  user: 'docspyre.user',
  rememberedEmail: 'docspyre.rememberedEmail',
} as const;

export interface PersistedSession {
  accessToken: string;
  user: PublicUser;
}

export class AuthStorage {
  constructor(private readonly isBrowser: boolean) {}

  
  save(session: PersistedSession, remember: boolean): void {
    if (!this.isBrowser) return;
    const primary = remember ? localStorage : sessionStorage;
    const secondary = remember ? sessionStorage : localStorage;

    secondary.removeItem(KEYS.accessToken);
    secondary.removeItem(KEYS.user);
    primary.setItem(KEYS.accessToken, session.accessToken);
    primary.setItem(KEYS.user, JSON.stringify(session.user));
  }

  
  updateAccessToken(accessToken: string): void {
    if (!this.isBrowser) return;
    const tier = localStorage.getItem(KEYS.accessToken) !== null ? localStorage : sessionStorage;
    tier.setItem(KEYS.accessToken, accessToken);
  }

  readAccessToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(KEYS.accessToken) ?? sessionStorage.getItem(KEYS.accessToken);
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
      store.removeItem(KEYS.user);
    }
  }

  setRememberedEmail(email: string | null): void {
    if (!this.isBrowser) return;
    if (email) {
      localStorage.setItem(KEYS.rememberedEmail, email);
    } else {
      localStorage.removeItem(KEYS.rememberedEmail);
    }
  }

  getRememberedEmail(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(KEYS.rememberedEmail);
  }
}
