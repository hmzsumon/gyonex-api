import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from './error.middleware';

export const validate = (req: Request, _res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(err => ({
      field: (err as { path?: string }).path || 'unknown',
      message: err.msg,
    }));
    return next(new AppError('Validation failed', 422, messages));
  }
  next();
};
