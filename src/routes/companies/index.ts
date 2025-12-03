import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../lib/errors';
import * as CompanyRepository from '../../repositories/company-repository';
import * as CompanyService from '../../services/company-service';
import * as RpcRepository from '../../repositories/rpc-repository';
import { requireCompanyAccess, getUserCompanyIds } from '../../middleware/authorization';

const router = Router();

// Get all companies the user belongs to
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Only return companies the user is a member of
    const companyIds = await getUserCompanyIds(req.user.id);

    if (companyIds.length === 0) {
      return res.json([]);
    }

    const companies = await CompanyRepository.getCompaniesByIds(companyIds);
    res.json(companies);
  })
);

// Create a company - user becomes admin of the new company
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Require authentication
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { user_id, name, email, owner_first_name, owner_last_name, employee_count, phone_number, website } = req.body;

    // Ensure user can only create company for themselves
    if (user_id && user_id !== req.user.id) {
      throw new ForbiddenError('You can only create a company for yourself');
    }

    // Validation
    if (!name) {
      throw new ValidationError('Name is required');
    }

    // Use transactional RPC to create company and member atomically
    // If member creation fails, company creation is rolled back
    const result = await RpcRepository.createCompanyWithMember({
      userId: user_id ?? req.user.id,
      name,
      email,
      ownerFirstName: owner_first_name,
      ownerLastName: owner_last_name,
      employeeCount: employee_count,
      phoneNumber: phone_number,
      website,
    });

    const company = result.company;

    // Seed default data for the new company
    // Note: This runs after the transaction, so company+member are guaranteed to exist
    try {
      await CompanyService.seedDefaultCompanyData(company.id, user_id ?? req.user.id);
    } catch (seedError) {
      console.error('Failed to seed default data for company:', seedError);
      // Company and member were created successfully, just seeding failed
      // Return success but log the error - user can add templates manually
    }

    res.json(company);
  })
);

// Get company by ID - requires membership in the company
router.get(
  '/:id',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const company = await CompanyRepository.getCompanyById(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    res.json(company);
  })
);

// Update company settings - requires membership in the company
router.patch(
  '/:id/settings',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError('No settings provided to update');
    }

    const company = await CompanyRepository.getCompanyById(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const updatedCompany = await CompanyRepository.updateCompany(id, updates);
    res.json(updatedCompany);
  })
);

export default router;
