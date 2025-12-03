import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Authentication middleware that verifies Supabase JWT tokens
 * Extracts the token from the Authorization header and validates it
 */
export async function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.substring(7);

    // Verify the token using Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Token verification error:', error.message);
      res.status(401).json({ error: 'Unauthorized - Invalid token' });
      return;
    }

    if (!user) {
      res.status(401).json({ error: 'Unauthorized - User not found' });
      return;
    }

    // Attach user to request object for use in route handlers
    req.user = user;

    // Continue to next middleware/route handler
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't fail if missing
 */
export async function optionalAuthentication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just log them
    console.warn('Optional authentication warning:', error);
    next();
  }
}
