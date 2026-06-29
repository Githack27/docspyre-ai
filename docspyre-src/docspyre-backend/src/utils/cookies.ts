import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../config';

/**
 * The refresh token is delivered as an HttpOnly cookie so it is never readable
 * by JavaScript (mitigates XSS token theft). The access token, by contrast, is
 * returned in the JSON body for the SPA to hold in memory.
 */
export const REFRESH_COOKIE_NAME = 'docspyre_rt';

const baseCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction, // requires HTTPS in production
  sameSite: 'lax',
  domain: env.COOKIE_DOMAIN,
  path: '/api/v1/auth',
});

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
};
