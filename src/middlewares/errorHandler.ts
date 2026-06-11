import { Request, Response, NextFunction } from 'express';

interface CustomError extends Error {
	statusCode?: number;
}

// Global Error Handling Middleware
export const errorHandler = (
	err: CustomError,
	req: Request,
	res: Response,
	_next: NextFunction
) => {
	let statusCode = err.statusCode || 500;
	let message = err.message || 'Internal Server Error';

	// Handle Mongoose validation errors
	if (err.name === 'ValidationError') {
		message = Object.values((err as any).errors)
			.map((val: any) => val.message)
			.join(', ');
		statusCode = 400;
	}

	// Handle CastError (e.g. invalid MongoDB _id)
	if (err.name === 'CastError') {
		message = `Resource not found with id: ${(err as any).value}`;
		statusCode = 404;
	}

	// Handle Duplicate Key error
	if ((err as any).code === 11000) {
		const field = Object.keys((err as any).keyValue)[0];
		message = `Duplicate field value entered: ${field}`;
		statusCode = 400;
	}

	// Handle JWT errors
	if (err.name === 'JsonWebTokenError') {
		message = 'Invalid token. Please log in again.';
		statusCode = 401;
	}

	if (err.name === 'TokenExpiredError') {
		message = 'Your token has expired. Please log in again.';
		statusCode = 401;
	}

	res.status(statusCode).json({
		success: false,
		error: message,
	});
};
