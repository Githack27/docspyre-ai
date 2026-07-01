import type { Request, Response } from 'express';
import { authService } from './auth.service';
import type { AuthContext } from './auth.types';
import { asyncHandler } from '../../utils/async-handler';
import { ApiError } from '../../utils/api-error';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from '../../utils/cookies';

const contextFrom = (req: Request): AuthContext => ({
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

/**
 * Native desktop clients (Tauri) run in a webview whose origin differs from the
 * API, so the SameSite refresh cookie can't be used. The XSS threat that the
 * HttpOnly cookie mitigates does not apply to a packaged desktop app, so these
 * clients carry the refresh token in the JSON body instead. Signalled via a
 * request header; browser clients are unaffected and keep the cookie flow.
 */
const isDesktopClient = (req: Request): boolean =>
  req.get('x-client-type')?.toLowerCase() === 'desktop';

/** Reads the refresh token from the desktop body first, then the cookie. */
const refreshTokenFrom = (req: Request): string | undefined =>
  req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME];

/**
 * Emits an authenticated session: desktop clients get the refresh token in the
 * body, browser clients get it as an HttpOnly cookie.
 */
const sendSession = (
  req: Request,
  res: Response,
  status: number,
  result: { user: unknown; accessToken: string; refreshToken: string },
): void => {
  const { user, accessToken, refreshToken } = result;
  if (isDesktopClient(req)) {
    res.status(status).json({ user, accessToken, refreshToken });
    return;
  }
  setRefreshCookie(res, refreshToken);
  res.status(status).json({ user, accessToken });
};

/**
 * Controllers stay thin: translate HTTP <-> service calls, manage the refresh
 * token transport, and never contain business rules.
 */
export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body, contextFrom(req));
    sendSession(req, res, 201, result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body, contextFrom(req));
    sendSession(req, res, 200, result);
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = refreshTokenFrom(req);
    if (!rawToken) throw ApiError.unauthorized('Missing refresh token');

    const result = await authService.refresh(rawToken, contextFrom(req));
    sendSession(req, res, 200, result);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = refreshTokenFrom(req);
    await authService.logout(rawToken, contextFrom(req));
    clearRefreshCookie(res);
    res.status(204).send();
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    // `authenticate` guarantees req.auth is present here.
    const user = await authService.getProfile(req.auth!.userId);
    res.status(200).json({ user });
  }),
};
