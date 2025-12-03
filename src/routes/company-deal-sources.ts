import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, ConflictError } from '../lib/errors';
import { sanitizeUserId } from '../utils/validation';
import * as DealSourceRepository from '../repositories/deal-source-repository';
import { requireCompanyAccess } from '../middleware/authorization';

const router = Router();

// Get deal sources - requires company membership
router.get(
  '/:companyId/deal-sources',
  requireCompanyAccess({ companyIdParam: 'companyId' }),
  asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    if (!companyId) {
      throw new ValidationError('companyId is required');
    }

    const dealSources = await DealSourceRepository.getDealSources(companyId);
    res.json(dealSources);
  })
);

// Create deal source - requires company membership
router.post(
  '/:companyId/deal-sources',
  requireCompanyAccess({ companyIdParam: 'companyId' }),
  asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { name, created_by_user_id } = req.body ?? {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (!companyId) {
      throw new ValidationError('companyId is required');
    }

    if (!trimmedName) {
      throw new ValidationError('Deal source name is required.');
    }

    const payload = {
      company_id: companyId,
      name: trimmedName,
      is_default: false,
      created_by_user_id: sanitizeUserId(created_by_user_id),
    };

    try {
      const dealSource = await DealSourceRepository.upsertDealSource(payload);
      res.json(dealSource);
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictError('Could not save deal source.');
      }
      throw error;
    }
  })
);

export default router;
