import type { Request, Response } from 'express';
import { usersService } from './users.service';
import { asyncHandler } from '../../utils/async-handler';

export const usersController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const email = String(req.query.email ?? '');
    const users = await usersService.searchByEmail(email, req.auth!.userId);
    res.status(200).json({ users });
  }),
};
