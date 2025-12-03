/**
 * Custom Error Classes
 *
 * These errors automatically map to HTTP status codes when caught by
 * the global error handler middleware.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly (needed for instanceof checks with TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 400 Bad Request - Invalid input or validation failure
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * 403 Forbidden - Authenticated but not allowed
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * 409 Conflict - Resource state conflict (e.g., duplicate, already exists)
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409);
  }
}

/**
 * 422 Unprocessable Entity - Business logic error
 */
export class BusinessError extends AppError {
  constructor(message: string = 'Business rule violation') {
    super(message, 422);
  }
}

/**
 * 500 Internal Server Error - Unexpected errors
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, false);
  }
}

/**
 * Database-specific error (wraps Supabase errors)
 * Defaults to 500 but can be overridden
 */
export class DatabaseError extends AppError {
  public readonly originalError: unknown;

  constructor(message: string, originalError?: unknown, statusCode: number = 500) {
    super(message, statusCode);
    this.originalError = originalError;
  }
}
