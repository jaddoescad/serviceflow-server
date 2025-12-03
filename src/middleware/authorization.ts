import { Request, Response, NextFunction } from 'express';
import * as CompanyMemberRepository from '../repositories/company-member-repository';
import * as AuthorizationService from '../services/authorization-service';

/**
 * Resource types that can be authorized
 */
export type ResourceType = 'deal' | 'contact' | 'quote' | 'invoice' | 'crew' | 'appointment' |
  'deal_note' | 'drip_sequence' | 'drip_step' | 'product_template' | 'communication_template' |
  'proposal_attachment' | 'change_order' | 'work_order' | 'company_deal_source';

/**
 * Cache for user company memberships to avoid repeated DB calls within a request
 * Key: `${userId}:${companyId}` -> CompanyMember | null
 */
const membershipCache = new Map<string, { member: CompanyMemberRepository.CompanyMember | null; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute cache

/**
 * Get company membership for a user, with caching
 */
async function getUserCompanyMembership(
  userId: string,
  companyId: string
): Promise<CompanyMemberRepository.CompanyMember | null> {
  const cacheKey = `${userId}:${companyId}`;
  const cached = membershipCache.get(cacheKey);

  // Return cached value if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.member;
  }

  // Fetch from database
  const members = await CompanyMemberRepository.getCompanyMembers({
    user_id: userId,
    company_id: companyId,
  });

  const member = members[0] ?? null;

  // Cache the result
  membershipCache.set(cacheKey, { member, timestamp: Date.now() });

  return member;
}

/**
 * Clear membership cache for a user (call when membership changes)
 */
export function clearMembershipCache(userId: string): void {
  for (const key of membershipCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      membershipCache.delete(key);
    }
  }
}

/**
 * Extend Express Request to include authorization context
 */
declare global {
  namespace Express {
    interface Request {
      companyMember?: CompanyMemberRepository.CompanyMember;
      authorizedCompanyId?: string;
    }
  }
}

/**
 * Authorization error response helper
 */
function unauthorizedResponse(res: Response, message: string): void {
  res.status(403).json({ error: message });
}

/**
 * Extract company_id from various sources in the request
 */
function extractCompanyId(req: Request, companyIdParam?: string): string | null {
  // 1. Check route params (e.g., /companies/:id or /companies/:companyId)
  if (companyIdParam && req.params[companyIdParam]) {
    return req.params[companyIdParam];
  }

  // 2. Check query params (e.g., ?company_id=xxx)
  if (req.query.company_id && typeof req.query.company_id === 'string') {
    return req.query.company_id;
  }

  // 3. Check request body (e.g., POST { company_id: xxx })
  if (req.body?.company_id && typeof req.body.company_id === 'string') {
    return req.body.company_id;
  }

  return null;
}

/**
 * Options for the requireCompanyAccess middleware
 */
export interface RequireCompanyAccessOptions {
  /**
   * The name of the route parameter containing the company ID
   * Default: 'id' (for routes like /companies/:id)
   */
  companyIdParam?: string;

  /**
   * Where to look for company_id: 'query', 'body', or 'params' (default: auto-detect)
   */
  companyIdSource?: 'query' | 'body' | 'params';

  /**
   * Required role(s) for this operation
   * If not specified, any membership is sufficient
   */
  requiredRoles?: Array<'admin' | 'member' | 'sales'>;
}

/**
 * Options for the requireResourceAccess middleware
 */
export interface RequireResourceAccessOptions {
  /**
   * The type of resource being accessed
   */
  resourceType: ResourceType;

  /**
   * The name of the route parameter containing the resource ID
   * Default: 'id'
   */
  resourceIdParam?: string;

  /**
   * Where to look for resource ID: 'params' (default), 'body', or 'query'
   */
  resourceIdSource?: 'params' | 'body' | 'query';

  /**
   * The field name containing the resource ID (used when resourceIdSource is 'body' or 'query')
   */
  resourceIdField?: string;

  /**
   * Required role(s) for this operation
   * If not specified, any membership is sufficient
   */
  requiredRoles?: Array<'admin' | 'member' | 'sales'>;
}

/**
 * Middleware factory: Require that the authenticated user belongs to the company
 *
 * Usage:
 *   router.get('/:id', requireCompanyAccess({ companyIdParam: 'id' }), handler);
 *   router.get('/', requireCompanyAccess(), handler); // Uses query param company_id
 *   router.post('/', requireCompanyAccess(), handler); // Uses body company_id
 *   router.patch('/:id', requireCompanyAccess({ requiredRoles: ['admin'] }), handler);
 */
export function requireCompanyAccess(options: RequireCompanyAccessOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        unauthorizedResponse(res, 'Authentication required');
        return;
      }

      let companyId: string | null = null;

      // Extract company_id based on source option
      if (options.companyIdSource === 'body' && req.body?.company_id) {
        companyId = req.body.company_id;
      } else if (options.companyIdSource === 'query' && req.query.company_id) {
        companyId = req.query.company_id as string;
      } else if (options.companyIdSource === 'params' && options.companyIdParam) {
        companyId = req.params[options.companyIdParam];
      } else {
        // Auto-detect
        companyId = extractCompanyId(req, options.companyIdParam);
      }

      if (!companyId) {
        // If no company_id is found, allow the request but don't set authorization context
        // This handles cases like GET /companies (list all user's companies)
        next();
        return;
      }

      // Check if user is a member of this company
      const member = await getUserCompanyMembership(user.id, companyId);

      if (!member) {
        unauthorizedResponse(res, 'You do not have access to this company');
        return;
      }

      // Check role requirements if specified
      if (options.requiredRoles && options.requiredRoles.length > 0) {
        if (!options.requiredRoles.includes(member.role)) {
          unauthorizedResponse(
            res,
            `This action requires one of the following roles: ${options.requiredRoles.join(', ')}`
          );
          return;
        }
      }

      // Attach authorization context to request
      req.companyMember = member;
      req.authorizedCompanyId = companyId;

      next();
    } catch (error) {
      console.error('Authorization middleware error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

/**
 * Middleware: Require that the user is an admin of the company
 * Shorthand for requireCompanyAccess({ requiredRoles: ['admin'] })
 */
export function requireCompanyAdmin(companyIdParam?: string) {
  return requireCompanyAccess({
    companyIdParam,
    requiredRoles: ['admin']
  });
}

/**
 * Helper to get all company IDs a user has access to
 * Useful for filtering list queries
 */
export async function getUserCompanyIds(userId: string): Promise<string[]> {
  const members = await CompanyMemberRepository.getCompanyMembers({
    user_id: userId,
  });
  return members.map(m => m.company_id);
}

/**
 * Middleware: Filter list queries to only return data from companies the user belongs to
 * This middleware should be used AFTER authentication
 *
 * It either:
 * 1. Validates the company_id in query/body if provided
 * 2. Or adds user's company IDs to the request for filtering
 */
export function filterByUserCompanies() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        unauthorizedResponse(res, 'Authentication required');
        return;
      }

      const companyId = extractCompanyId(req);

      if (companyId) {
        // Validate access to the specific company
        const member = await getUserCompanyMembership(user.id, companyId);

        if (!member) {
          unauthorizedResponse(res, 'You do not have access to this company');
          return;
        }

        req.companyMember = member;
        req.authorizedCompanyId = companyId;
      }
      // If no company_id provided, routes should use getUserCompanyIds to filter

      next();
    } catch (error) {
      console.error('Filter by companies middleware error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

/**
 * Middleware factory: Require access to a specific resource (deal, contact, etc.)
 * Looks up the resource's company_id and validates membership
 *
 * Usage:
 *   router.get('/:id', requireResourceAccess({ resourceType: 'deal' }), handler);
 *   router.patch('/:id', requireResourceAccess({ resourceType: 'deal', requiredRoles: ['admin'] }), handler);
 */
export function requireResourceAccess(options: RequireResourceAccessOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        unauthorizedResponse(res, 'Authentication required');
        return;
      }

      let resourceId: string | undefined;

      // Extract resource ID based on source option
      if (options.resourceIdSource === 'body') {
        const field = options.resourceIdField ?? 'id';
        resourceId = req.body?.[field];
      } else if (options.resourceIdSource === 'query') {
        const field = options.resourceIdField ?? 'id';
        const value = req.query[field];
        resourceId = typeof value === 'string' ? value : undefined;
      } else {
        // Default: params
        const resourceIdParam = options.resourceIdParam ?? 'id';
        resourceId = req.params[resourceIdParam];
      }

      if (!resourceId) {
        const fieldName = options.resourceIdSource === 'body' || options.resourceIdSource === 'query'
          ? (options.resourceIdField ?? 'id')
          : (options.resourceIdParam ?? 'id');
        res.status(400).json({ error: `Missing resource ID: ${fieldName}` });
        return;
      }

      // Look up the resource's company_id
      const companyId = await AuthorizationService.getResourceCompanyId(
        options.resourceType,
        resourceId
      );

      if (!companyId) {
        res.status(404).json({ error: `${options.resourceType} not found` });
        return;
      }

      // Check if user is a member of this company
      const member = await getUserCompanyMembership(user.id, companyId);

      if (!member) {
        unauthorizedResponse(res, `You do not have access to this ${options.resourceType}`);
        return;
      }

      // Check role requirements if specified
      if (options.requiredRoles && options.requiredRoles.length > 0) {
        if (!options.requiredRoles.includes(member.role)) {
          unauthorizedResponse(
            res,
            `This action requires one of the following roles: ${options.requiredRoles.join(', ')}`
          );
          return;
        }
      }

      // Attach authorization context to request
      req.companyMember = member;
      req.authorizedCompanyId = companyId;

      next();
    } catch (error) {
      console.error('Resource authorization middleware error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}
