// ✅ auth.ts – Full JWT Auth Middleware in TypeScript

import { IUser, User } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload, Secret, SignOptions } from "jsonwebtoken";

// ✅ Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

// 🔐 Middleware: isAuthenticatedUser
export const isAuthenticatedUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.sw99_token;

    if (!token) {
      return next(new ApiError(401, "Please login to access this resource"));
    }

    let decodedData: JwtPayload;
    try {
      decodedData = jwt.verify(
        token,
        process.env.JWT_SECRET as Secret
      ) as JwtPayload;
    } catch (err) {
      return next(new ApiError(401, "Invalid or expired token"));
    }

    const user = await User.findById(decodedData.id).select("+password");
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }
    req.user = user;

    next();
  }
);

// 🛡 Middleware: authorizeRoles
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          `Role: ${req.user?.role} is not allowed to access this resource`
        )
      );
    }
    next();
  };
};

// ✅ Function: sign JWT
export const signToken = (userId: string): string => {
  const payload = { id: userId };
  const secret: Secret = process.env.JWT_SECRET as Secret;
  const options: SignOptions = {
    expiresIn: process.env.JWT_EXPIRE as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, secret, options);
};
