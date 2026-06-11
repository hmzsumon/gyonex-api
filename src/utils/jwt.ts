import jwt, { SignOptions } from 'jsonwebtoken';
import { IUser } from '../models/User.model.new';

export interface JWTPayload {
  userId:     string;
  email:      string;
  role:       string;
  sessionId?: string;
}

export const generateAccessToken = (user: IUser): string => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email:  user.email,
      role:   user.role,
    },
    process.env.JWT_ACCESS_SECRET!,
    {
      expiresIn: (process.env.JWT_ACCESS_EXPIRE || '15m') as SignOptions['expiresIn'],
    },
  );
};

export const generateRefreshToken = (user: IUser, sessionId: string): string => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email:  user.email,
      role:   user.role,
      sessionId,
    },
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRE || '7d') as SignOptions['expiresIn'],
    },
  );
};

export const verifyAccessToken = (token: string): JWTPayload => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JWTPayload;
};

export const setRefreshTokenCookie = (
  res:   import('express').Response,
  token: string,
): void => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    path:     '/api/v1/auth',
  });
};

export const clearRefreshTokenCookie = (res: import('express').Response): void => {
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
};