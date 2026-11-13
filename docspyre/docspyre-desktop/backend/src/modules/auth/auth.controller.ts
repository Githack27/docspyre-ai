import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import type { AuthContext } from './auth.types.js';
import { asyncHandler } from '../../core/utils/async-handler.js';
import { ApiError } from '../../core/utils/api-error.js';

const contextFrom = (req: Request): AuthContext => ({
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

export const authController = {
  licenseOptions: asyncHandler(async (_req: Request, res: Response) => {
    const result = await authService.licenseOptions();
    res.status(200).json(result);
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    // 202 Accepted: license is pending approval by administrator
    const result = await authService.register(req.body, contextFrom(req));
    res.status(202).json(result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body, contextFrom(req));
    res.status(200).json(result);
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth?.userId) throw ApiError.unauthorized();
    const result = await authService.me(req.auth.userId);
    res.status(200).json(result);
  }),

  logout: asyncHandler(async (_req: Request, res: Response) => {
    res.status(204).send();
  }),
};
