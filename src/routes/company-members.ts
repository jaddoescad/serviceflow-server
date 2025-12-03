import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, ForbiddenError } from '../lib/errors';
import * as CompanyMemberRepository from '../repositories/company-member-repository';
import * as CompanyRepository from '../repositories/company-repository';
import * as UserRepository from '../repositories/user-repository';
import { requireCompanyAccess } from '../middleware/authorization';

const router = Router();

// Get members of a company - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id } = req.query;

    if (!company_id) {
      throw new ValidationError('company_id is required');
    }

    const members = await CompanyMemberRepository.getCompanyMembers({
      company_id: company_id as string,
      includeUser: true,
    });

    res.json(members);
  })
);

// Get organizations for a user - user can only query their own data
router.get(
  '/user/:user_id',
  asyncHandler(async (req, res) => {
    // Verify user is querying their own data
    if (req.user?.id !== req.params.user_id) {
      throw new ForbiddenError('You can only access your own organization data');
    }

    const { user_id } = req.params;

    // Organizations where the user is explicitly a member
    const memberData = await CompanyMemberRepository.getCompanyMembers({
      user_id,
      includeCompany: true,
    });

    // Organizations the user owns (in companies.user_id) but might not yet be in company_members
    const ownedCompanies = await CompanyRepository.getCompanies({ user_id });

    const ownedAsMember = ownedCompanies.map((company) => ({
      id: `owned-${company.id}`,
      company_id: company.id,
      user_id,
      role: 'admin',
      email: company.email,
      display_name:
        company.owner_first_name || company.owner_last_name
          ? `${company.owner_first_name ?? ''} ${company.owner_last_name ?? ''}`.trim()
          : company.email,
      company,
    }));

    // Merge and de-duplicate by company_id
    const combined = [...memberData, ...ownedAsMember].reduce((acc: any[], record) => {
      const existingIndex = acc.findIndex((r: any) => r.company_id === record.company_id);
      if (existingIndex === -1) {
        acc.push(record);
      }
      return acc;
    }, []);

    res.json(combined);
  })
);

// Invite a new member - requires admin role in the company
router.post(
  '/',
  requireCompanyAccess({ requiredRoles: ['admin'] }),
  asyncHandler(async (req, res) => {
    const { email, displayName, role, companyId } = req.body;

    if (!companyId || !email || !displayName) {
      throw new ValidationError('companyId, email, and displayName are required');
    }

    // Check if user exists
    const existingUser = await UserRepository.getUserByEmail(email);
    const userId = existingUser?.id;

    // Insert member
    const member = await CompanyMemberRepository.createCompanyMember({
      company_id: companyId,
      user_id: userId || undefined,
      email,
      display_name: displayName,
      role: role || 'sales',
      status: 'invited', // Assuming status column exists
    });

    res.json({ member });
  })
);

export default router;
