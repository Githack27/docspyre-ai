import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { ApiError } from '../utils/api-error';

interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', error.flatten().fieldErrors));
        return;
      }
      next(error);
    }
  };

export type Infer<T extends ZodTypeAny> = ZodInfer<T>;
