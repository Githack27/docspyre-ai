import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  AuthResult,
  AuthSession,
  LoginCredentials,
  SignupPayload,
  StoredAccount,
} from './auth.models';

const STORAGE_KEYS = {
  accounts: 'docspyre.accounts',
  session: 'docspyre.session',
  rememberedEmail: 'docspyre.rememberedEmail',
} as const;

/**
 * Minimal authentication service backed by browser storage.
 *
 * - Accounts live in `localStorage`.
 * - A "remembered" session persists in `localStorage`; otherwise it lives in
 *   `sessionStorage` and is cleared when the tab closes.
 * - All access is guarded for SSR where `window`/`localStorage` are absent.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Reactive view of the active session, or `null` when signed out. */
  readonly currentUser = signal<AuthSession | null>(this.readSession());

  /** Registers a new account and immediately opens a (non-remembered) session. */
  signup(payload: SignupPayload): AuthResult {
    const email = this.normalizeEmail(payload.email);
    const accounts = this.readAccounts();

    if (accounts.some((account) => account.email === email)) {
      return { success: false, message: 'An account with this email already exists.' };
    }

    const account: StoredAccount = {
      fullName: payload.fullName.trim(),
      email,
      password: payload.password,
    };
    accounts.push(account);
    this.writeAccounts(accounts);

    this.startSession({ fullName: account.fullName, email: account.email }, false);
    return { success: true, message: 'Account created successfully.' };
  }

  /** Validates credentials against stored accounts and opens a session. */
  login(credentials: LoginCredentials): AuthResult {
    const email = this.normalizeEmail(credentials.email);
    const account = this.readAccounts().find((item) => item.email === email);

    if (!account || account.password !== credentials.password) {
      return { success: false, message: 'Invalid email or password.' };
    }

    this.startSession({ fullName: account.fullName, email: account.email }, credentials.remember);
    this.persistRememberedEmail(credentials.remember ? email : null);
    return { success: true, message: 'Signed in successfully.' };
  }

  /** Clears the active session from both storage tiers. */
  logout(): void {
    if (!this.isBrowser) {
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.session);
    sessionStorage.removeItem(STORAGE_KEYS.session);
    this.currentUser.set(null);
  }

  /** Email previously stored via "remember me", used to prefill the form. */
  getRememberedEmail(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    return localStorage.getItem(STORAGE_KEYS.rememberedEmail);
  }

  /* ------------------------------------------------------------------ *
   * Internal helpers
   * ------------------------------------------------------------------ */

  private startSession(session: AuthSession, remember: boolean): void {
    if (!this.isBrowser) {
      return;
    }
    const target = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    target.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    other.removeItem(STORAGE_KEYS.session);
    this.currentUser.set(session);
  }

  private persistRememberedEmail(email: string | null): void {
    if (!this.isBrowser) {
      return;
    }
    if (email) {
      localStorage.setItem(STORAGE_KEYS.rememberedEmail, email);
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberedEmail);
    }
  }

  private readSession(): AuthSession | null {
    if (!this.isBrowser) {
      return null;
    }
    const raw =
      localStorage.getItem(STORAGE_KEYS.session) ?? sessionStorage.getItem(STORAGE_KEYS.session);
    return this.parse<AuthSession>(raw);
  }

  private readAccounts(): StoredAccount[] {
    if (!this.isBrowser) {
      return [];
    }
    return this.parse<StoredAccount[]>(localStorage.getItem(STORAGE_KEYS.accounts)) ?? [];
  }

  private writeAccounts(accounts: StoredAccount[]): void {
    if (!this.isBrowser) {
      return;
    }
    localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
  }

  private parse<T>(raw: string | null): T | null {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
