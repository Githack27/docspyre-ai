import type { Request, Response } from 'express';
import { authService } from './auth.service';
import type { AuthContext } from './auth.types';
import { asyncHandler } from '../../core/utils/async-handler';
import { ApiError } from '../../core/utils/api-error';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from '../../core/utils/cookies';

const contextFrom = (req: Request): AuthContext => ({
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

const isDesktopClient = (req: Request): boolean =>
  req.get('x-client-type')?.toLowerCase() === 'desktop';

const refreshTokenFrom = (req: Request): string | undefined =>
  req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME];

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
    const user = await authService.getProfile(req.auth!.userId);
    res.status(200).json({ user });
  }),
};
