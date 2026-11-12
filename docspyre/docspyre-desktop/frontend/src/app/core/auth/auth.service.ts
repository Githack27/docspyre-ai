import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  LicenseOption,
  LoginCredentials,
  PublicUser,
  RegistrationPayload,
  RegistrationResponse,
} from './auth.models';
import { AuthStorage } from './auth.storage';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly storage = new AuthStorage(this.isBrowser);
  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  private accessToken: string | null = this.storage.readAccessToken();
  private refresh$: Observable<string> | null = null;

  readonly currentUser = signal<PublicUser | null>(this.storage.readUser());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  licenseOptions(): Observable<LicenseOption[]> {
    return this.http
      .get<{ options: LicenseOption[] }>(`${this.baseUrl}/license-options`)
      .pipe(map((res) => res.options ?? []));
  }

  register(payload: RegistrationPayload): Observable<RegistrationResponse> {
    return this.http.post<RegistrationResponse>(`${this.baseUrl}/register`, payload);
  }

  login(credentials: LoginCredentials): Observable<PublicUser> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login`, {
        username: credentials.username,
        password: credentials.password,
      })
      .pipe(
        tap((res) => {
          this.applySession(res, credentials.remember);
          this.storage.setRememberedUsername(credentials.remember ? credentials.username : null);
        }),
        map((res) => res.user),
      );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/logout`, {})
      .pipe(tap({ next: () => this.clearSession(), error: () => this.clearSession() }));
  }

  refresh(): Observable<string> {
    if (this.refresh$) {
      return this.refresh$;
    }

    this.refresh$ = this.http.get<AuthResponse>(`${this.baseUrl}/me`).pipe(
      tap((res) => this.applyProfile(res)),
      map((res) => res.accessToken),
      finalize(() => (this.refresh$ = null)),
      shareReplay(1),
    );
    return this.refresh$;
  }

  loadProfile(): Observable<PublicUser> {
    return this.http
      .get<AuthResponse>(`${this.baseUrl}/me`)
      .pipe(
        tap((res) => this.applyProfile(res)),
        map((res) => res.user),
      );
  }

  /**
   * The saved profile is from sign-in; replace it with the server's current one (license, name, etc.) when the app
   * starts. A session that can no longer be renewed is cleared by the interceptor.
   */
  syncProfile(): void {
    if (!this.isBrowser || !this.accessToken || !this.currentUser()) return;
    this.refresh().subscribe({ error: () => undefined });
  }

  private applyProfile(res: AuthResponse): void {
    this.accessToken = res.accessToken;
    this.storage.updateAccessToken(res.accessToken);
    this.storage.updateUser(res.user);
    this.currentUser.set(res.user);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRememberedUsername(): string | null {
    return this.storage.getRememberedUsername();
  }

  getRememberedEmail(): string | null {
    return this.storage.getRememberedUsername();
  }

  clearSession(): void {
    this.accessToken = null;
    this.currentUser.set(null);
    this.storage.clear();
  }

  private applySession(res: AuthResponse, remember: boolean): void {
    this.accessToken = res.accessToken;
    this.currentUser.set(res.user);
    this.storage.save(
      {
        accessToken: res.accessToken,
        user: res.user,
      },
      remember,
    );
  }
}
