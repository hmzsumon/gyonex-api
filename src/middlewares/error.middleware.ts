import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errors?: Record<string, string>[];

  constructor(message: string, statusCode: number, errors?: Record<string, string>[]) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

interface MongoError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
  path?: string;
  value?: unknown;
  errors?: Record<string, { message: string }>;
}

const handleCastError = (err: MongoError): AppError =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateFields = (err: MongoError): AppError => {
  const field = Object.keys(err.keyValue || {})[0];
  return new AppError(`${field} already exists. Please use a different value.`, 400);
};

const handleValidationError = (err: MongoError): AppError => {
  const errors = Object.values(err.errors || {}).map(e => e.message);
  return new AppError(`Validation failed: ${errors.join('. ')}`, 400);
};

const handleJWTError = (): AppError =>
  new AppError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = (): AppError =>
  new AppError('Your session has expired. Please log in again.', 401);

export const errorHandler = (
  err: AppError & MongoError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = { ...err, message: err.message };

  if (err.name === 'CastError') error = handleCastError(err) as AppError & MongoError;
  if (err.code === 11000) error = handleDuplicateFields(err) as AppError & MongoError;
  if (err.name === 'ValidationError') error = handleValidationError(err) as AppError & MongoError;
  if (err.name === 'JsonWebTokenError') error = handleJWTError() as AppError & MongoError;
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError() as AppError & MongoError;

  const statusCode = (error as AppError).statusCode || 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.path} - ${statusCode}`, {
      error: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    errors: (error as AppError).errors,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
};
