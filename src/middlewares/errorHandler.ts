import { NextFunction, Request, Response } from "express";

interface CustomError extends Error {
  statusCode?: number;
  status?: number;
  code?: number;
  errors?: Record<string, { message?: string }>;
  keyValue?: Record<string, unknown>;
  keyPattern?: Record<string, unknown>;
  value?: unknown;
  meta?: Record<string, unknown>;
}

/* ────────── global error handler ────────── */
export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (res.headersSent) return _next(err);
  const error = err && typeof err === "object" ? err : new Error("Internal Server Error");
  const requestedStatus = (error as CustomError).statusCode ?? (error as CustomError).status;
  let statusCode =
    typeof requestedStatus === "number" &&
    Number.isInteger(requestedStatus) &&
    requestedStatus >= 400 && requestedStatus <= 599
      ? requestedStatus
      : 500;
  let message = error.message || "Internal Server Error";

  /* Server console এ real error দেখা যাবে */
  console.error("[API_ERROR]", {
    path: req.originalUrl,
    method: req.method,
    statusCode,
    message,
    stack: error.stack,
  });

  // Handle Mongoose validation errors
  if (error.name === "ValidationError") {
    message = Object.values((error as CustomError).errors || {})
      .map((val) => val?.message)
      .filter(Boolean)
      .join(", ") || message;
    statusCode = 400;
  }

  // Handle CastError (e.g. invalid MongoDB _id)
  if (error.name === "CastError") {
    message = `Resource not found with id: ${(error as CustomError).value}`;
    statusCode = 404;
  }

  // Handle Duplicate Key error
  if ((error as CustomError).code === 11000) {
    // MongoBulkWriteError (e.g. insertMany) need not have keyValue.
    const duplicate = error as CustomError;
    const field = Object.keys(duplicate.keyValue || duplicate.keyPattern || {})[0];
    message = field ? `Duplicate field value entered: ${field}` : "This record already exists. Please refresh and try again.";
    statusCode = 400;
  }

  // Handle JWT errors
  if (error.name === "JsonWebTokenError") {
    message = "Invalid token. Please log in again.";
    statusCode = 401;
  }

  if (error.name === "TokenExpiredError") {
    message = "Your token has expired. Please log in again.";
    statusCode = 401;
  }

  res.status(statusCode).json({
    /* Preserve structured ApiError metadata, e.g. KYC_REQUIRED. */
    ...((error as CustomError).meta || {}),
    success: false,
    error: message,
    message,
  });
};
