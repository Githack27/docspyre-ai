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
 * Controllers stay thin: translate HTTP <-> service calls, manage the refresh
 * cookie, and never contain business rules.
 */
export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await authService.register(
      req.body,
      contextFrom(req),
    );
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await authService.login(
      req.body,
      contextFrom(req),
    );
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ user, accessToken });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) throw ApiError.unauthorized('Missing refresh token');

    const { user, accessToken, refreshToken } = await authService.refresh(
      rawToken,
      contextFrom(req),
    );
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ user, accessToken });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
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
