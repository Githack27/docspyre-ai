import type { Request, Response } from 'express';
import { userService } from './users.service';
import { asyncHandler } from '../../core/utils/async-handler';
import { ApiError } from '../../core/utils/api-error';

export const usersController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const q = req.query.q;
    if (typeof q !== 'string' || q.trim().length < 2) {
      throw ApiError.badRequest('Search query must be at least 2 characters');
    }
    const users = await userService.searchByEmail(q.trim(), req.auth!.userId);
    res.status(200).json({ users });
  }),
};
