import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';


const AUTH_BYPASS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

const isApiRequest = (url: string): boolean =>
  url.startsWith(environment.apiBaseUrl) || url.startsWith('/api/');

const isBypassed = (url: string): boolean => AUTH_BYPASS.some((path) => url.includes(path));

const withAuth = (req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> => {
  const setHeaders: Record<string, string> = {};
  if (token) {
    setHeaders['Authorization'] = `Bearer ${token}`;
  }
  // Signal desktop clients so the backend returns the refresh token in the body
  // instead of relying on the cross-origin HttpOnly cookie.
  if (environment.desktop) {
    setHeaders['X-Client-Type'] = 'desktop';
  }
  return req.clone({ withCredentials: true, setHeaders });
};


export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const authed = withAuth(req, auth.getAccessToken());

  return next(authed).pipe(
    catchError((error: unknown) => {
      const shouldRefresh =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isBypassed(req.url) &&
        auth.getAccessToken() !== null;

      if (!shouldRefresh) {
        return throwError(() => error);
      }
      return retryWithRefresh(req, next, auth);
    }),
  );
};


const retryWithRefresh = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
): Observable<HttpEvent<unknown>> =>
  auth.refresh().pipe(
    switchMap((token) => next(withAuth(req, token))),
    catchError((refreshError: unknown) => {
      auth.clearSession();
      return throwError(() => refreshError);
    }),
  );
