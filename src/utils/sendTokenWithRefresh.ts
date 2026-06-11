import { Response } from "express";
import jwt, { Secret } from "jsonwebtoken";
import { StringValue } from "ms";

export const sendTokenWithRefresh = (
  user: any,
  statusCode: number,
  res: Response,
) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as Secret, {
    expiresIn: (process.env.JWT_EXPIRE as StringValue) || "7d",
  });

  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET as Secret,
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRE as StringValue) || "7d",
    },
  );

  const isProduction = process.env.NODE_ENV === "production";

  const cookieOptions = {
    httpOnly: true,
    secure: isProduction, // ✅ Required for SameSite: 'none'
    sameSite: isProduction ? ("none" as const) : ("lax" as const), // ✅ Allow cross-site cookies in prod
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  res.cookie("sw99_token", token, {
    ...cookieOptions,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.cookie("sw99_refresh_token", refreshToken, {
    ...cookieOptions,
    path: "/", // ✅ All routes will receive this cookie
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.status(statusCode).json({
    success: true,
    token,
    user,
  });
};
