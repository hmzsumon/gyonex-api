import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { User, UserRole } from '../models/User.model.new';
import { AppError } from './error.middleware';
import { cacheGet } from '../database/redis';

export type AuthRequest = Request;

export const protect = async (
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401));
    }

    const isBlacklisted = await cacheGet<boolean>(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new AppError('Token has been invalidated. Please log in again.', 401));
    }

    const decoded = verifyAccessToken(token) as JWTPayload;

    const user = await User.findById(decoded.userId).select('role status');
    if (!user) {
      return next(new AppError('User no longer exists.', 401));
    }
    if (user.status === 'banned') {
      return next(new AppError('Your account has been permanently banned.', 403));
    }
    if (user.status === 'suspended') {
      return next(new AppError('Your account has been temporarily suspended.', 403));
    }

    req.authUser = {
      userId: decoded.userId,
      email:  decoded.email,
      role:   user.role,
    };

    next();
  } catch (error: unknown) {
    if ((error as Error).name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    if ((error as Error).name === 'JsonWebTokenError') {
      return next(new AppError('Invalid authentication token.', 401));
    }
    next(error);
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      return next(new AppError('Authentication required.', 401));
    }

    const roleHierarchy: Record<UserRole, number> = {
      super_admin: 4,
      admin:       3,
      moderator:   2,
      user:        1,
    };

    const userLevel   = roleHierarchy[req.authUser.role];
    const minRequired = Math.min(...roles.map(r => roleHierarchy[r]));

    if (userLevel < minRequired) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }

    next();
  };
};

export const adminOnly         = authorize('admin', 'super_admin');
export const superAdminOnly    = authorize('super_admin');
export const moderatorAndAbove = authorize('moderator', 'admin', 'super_admin');