import type { Request, Response } from 'express';

/** Terminal 404 handler for unmatched routes. */
export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
};
