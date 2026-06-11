// src/utils/ApiError.ts
export class ApiError extends Error {
	constructor(public statusCode: number, message: string) {
		super(message);
		Error.captureStackTrace(this, this.constructor);
	}
}
