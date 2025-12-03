import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, DatabaseError } from '../lib/errors';

/**
 * User info for logging context
 */
interface UserContext {
  id?: string;
  email?: string;
}

/**
 * Global Error Handler Middleware
 *
 * Catches all errors thrown in routes and middleware, providing:
 * - Consistent error response format
 * - Automatic status code mapping from AppError classes
 * - Security: Internal error details hidden from clients in production
 * - Full error logging server-side
 *
 * Usage: Register AFTER all routes in index.ts
 *   app.use(errorHandler);
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Determine if this is an operational error we threw intentionally
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const isOperational = isAppError ? err.isOperational : false;

  // Get user context for logging (cast to access non-standard user property)
  const user = (req as Request & { user?: UserContext }).user;

  // Log full error details server-side
  const logContext = {
    method: req.method,
    path: req.path,
    statusCode,
    userId: user?.id,
  };

  if (statusCode >= 500 || !isOperational) {
    // Log full stack for server errors or unexpected errors
    console.error('[ERROR]', logContext, err);
    if (err instanceof DatabaseError && err.originalError) {
      console.error('[DATABASE ERROR]', err.originalError);
    }
  } else {
    // Log minimal info for client errors (4xx)
    console.warn('[WARN]', logContext, err.message);
  }

  // Determine client-facing message
  // 5xx errors or non-operational errors: hide internal details
  // 4xx operational errors: show the error message (it's safe)
  const clientMessage =
    statusCode >= 500 || !isOperational
      ? 'Internal server error'
      : err.message;

  res.status(statusCode).json({ error: clientMessage });
};

/**
 * 404 Not Found Handler
 *
 * Catches requests that don't match any route.
 * Register AFTER all routes but BEFORE errorHandler.
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
};
