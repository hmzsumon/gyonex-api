import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/User.model.new';

export type typeHandler = (
  req:  Request,
  res:  Response,
  next: NextFunction,
) => void | Promise<void>;

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        userId: string;
        email:  string;
        role:   UserRole;
      };
      files?: 
        | { [fieldname: string]: Express.Multer.File[] }
        | Express.Multer.File[];
    }
  }
}