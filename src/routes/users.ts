import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../lib/errors';
import * as UserRepository from '../repositories/user-repository';
import * as CompanyRepository from '../repositories/company-repository';
import * as CompanyMemberRepository from '../repositories/company-member-repository';
import * as RpcRepository from '../repositories/rpc-repository';

const router = Router();

/**
 * Middleware: Require that the authenticated user is accessing their own data
 */
function requireSelfAccess(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  const targetUserId = req.params.id;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (user.id !== targetUserId) {
    res.status(403).json({ error: 'You can only access your own user data' });
    return;
  }

  next();
}

// Get user auth context - consolidated endpoint for auth initialization
// Returns user, organizations, company, member, and companyMembers in one call
// User can only access their own auth context
router.get(
  '/:id/auth-context',
  requireSelfAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Try RPC first for optimized single call
    const rpcData = await RpcRepository.getUserAuthContext(id);

    if (rpcData) {
      return res.json(rpcData);
    }

    // Fallback: fetch data separately (original approach)
    const user = await UserRepository.getUserById(id);

    if (!user) {
      return res.json({
        user: null,
        organizations: [],
        company: null,
        member: null,
        companyMembers: [],
      });
    }

    // Get organizations (companies user belongs to)
    const memberRecords = await CompanyMemberRepository.getCompanyMembers({
      user_id: id,
      includeCompany: true,
    });

    const organizations = memberRecords.map((m: any) => ({
      companyId: m.company_id,
      companyName: m.company?.name ?? 'Unknown',
      role: m.role,
    }));

    // If no current company, return early
    if (!user.current_company_id) {
      return res.json({
        user,
        organizations,
        company: null,
        member: null,
        companyMembers: [],
      });
    }

    // Verify user belongs to current company
    const belongsToCompany = organizations.some((org: any) => org.companyId === user.current_company_id);

    if (!belongsToCompany) {
      return res.json({
        user,
        organizations,
        company: null,
        member: null,
        companyMembers: [],
      });
    }

    // Get company and members
    const [company, companyMembers] = await Promise.all([
      CompanyRepository.getCompanyById(user.current_company_id),
      CompanyMemberRepository.getCompanyMembers({ company_id: user.current_company_id }),
    ]);

    const member = companyMembers.find((m) => m.user_id === id) ?? null;

    res.json({
      user,
      organizations,
      company,
      member,
      companyMembers,
    });
  })
);

// Get user profile - user can only access their own profile
router.get(
  '/:id',
  requireSelfAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await UserRepository.getUserById(id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json(user);
  })
);

// Create/Update user profile (Upsert) - user can only create/update their own profile
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, email, display_name, first_name, last_name, phone_number, current_company_id } = req.body;

    if (!id || !email) {
      throw new ValidationError('id and email are required');
    }

    // Ensure authenticated user can only upsert their own profile
    if (!req.user || req.user.id !== id) {
      throw new ForbiddenError('You can only update your own user profile');
    }

    const user = await UserRepository.upsertUser({
      id,
      email,
      display_name,
      first_name,
      last_name,
      phone_number,
      current_company_id,
    });

    res.json(user);
  })
);

// Update user profile (Partial) - user can only update their own profile
router.patch(
  '/:id',
  requireSelfAccess,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const user = await UserRepository.updateUser(id, updates);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json(user);
  })
);

export default router;
