import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Async Handler Wrapper
 *
 * Wraps async route handlers to automatically catch errors and forward them
 * to the global error handler. Eliminates the need for try/catch blocks.
 *
 * Before:
 *   router.get('/', async (req, res) => {
 *     try {
 *       const data = await getData();
 *       res.json(data);
 *     } catch (error) {
 *       return respondWithError(res, error);
 *     }
 *   });
 *
 * After:
 *   router.get('/', asyncHandler(async (req, res) => {
 *     const data = await getData();
 *     res.json(data);
 *   }));
 *
 * Thrown errors (including AppError subclasses) are automatically
 * caught and passed to the global error handler middleware.
 */
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
