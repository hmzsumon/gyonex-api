// src/utils/ApiError.ts

/**
 * meta — অপশনাল স্ট্রাকচার্ড ডেটা যা রেসপন্স বডিতে spread হয়ে যায়।
 * যেমন: new ApiError(403, "...", { code: "KYC_REQUIRED", kycStatus: "pending" })
 * ক্লায়েন্ট তখন err.data.code দেখে সঠিক পেজে রিডাইরেক্ট করতে পারে।
 */
export class ApiError extends Error {
  public meta?: Record<string, unknown>;

  constructor(
    public statusCode: number,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    super(message);
    this.meta = meta;
    Error.captureStackTrace(this, this.constructor);
  }
}
