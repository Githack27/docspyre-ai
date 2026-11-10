import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  LoginCredentials,
  LoginRequest,
  PublicUser,
  RegisterRequest,
  SignupPayload,
} from './auth.models';
import { AuthStorage } from './auth.storage';


@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly storage = new AuthStorage(this.isBrowser);
  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;
  private readonly isDesktop = environment.desktop;

  private accessToken: string | null = this.storage.readAccessToken();


  private refresh$: Observable<string> | null = null;


  readonly currentUser = signal<PublicUser | null>(this.storage.readUser());


  readonly isAuthenticated = computed(() => this.currentUser() !== null);


  register(payload: SignupPayload): Observable<PublicUser> {
    const body: RegisterRequest = {
      email: payload.email,
      password: payload.password,
      ...this.splitName(payload.fullName),
    };
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/register`, body)
      .pipe(tap((res) => this.applySession(res, false)), map((res) => res.user));
  }


  login(credentials: LoginCredentials): Observable<PublicUser> {
    const body: LoginRequest = {
      email: credentials.email,
      password: credentials.password,
    };
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, body).pipe(
      tap((res) => {
        this.applySession(res, credentials.remember);
        this.storage.setRememberedEmail(credentials.remember ? res.user.email : null);
      }),
      map((res) => res.user),
    );
  }


  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/logout`, this.isDesktop ? { refreshToken: this.storage.readRefreshToken() } : {})
      .pipe(tap({ next: () => this.clearSession(), error: () => this.clearSession() }));
  }


  refresh(): Observable<string> {
    if (this.refresh$) {
      return this.refresh$;
    }

    this.refresh$ = this.http.post<AuthResponse>(`${this.baseUrl}/refresh`, this.isDesktop ? { refreshToken: this.storage.readRefreshToken() } : {}).pipe(
      tap((res) => {
        this.accessToken = res.accessToken;
        this.storage.updateAccessToken(res.accessToken);
        if (this.isDesktop && res.refreshToken) {
          this.storage.updateRefreshToken(res.refreshToken);
        }
        this.currentUser.set(res.user);
      }),
      map((res) => res.accessToken),
      finalize(() => (this.refresh$ = null)),
      shareReplay(1),
    );
    return this.refresh$;
  }


  loadProfile(): Observable<PublicUser> {
    return this.http
      .get<{ user: PublicUser }>(`${this.baseUrl}/me`)
      .pipe(map((res) => res.user), tap((user) => this.currentUser.set(user)));
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRememberedEmail(): string | null {
    return this.storage.getRememberedEmail();
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
        refreshToken: this.isDesktop ? res.refreshToken : undefined,
      },
      remember,
    );
  }


  private splitName(fullName: string): { firstName?: string; lastName?: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return {};
    const [firstName, ...rest] = parts;
    return { firstName, lastName: rest.length ? rest.join(' ') : undefined };
  }
}
