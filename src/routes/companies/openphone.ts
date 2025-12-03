import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError, AppError } from '../../lib/errors';
import { fetchOpenPhoneNumbers, normalizeApiKey, validateOpenPhoneApiKey } from '../../lib/openphone';
import * as CompanyRepository from '../../repositories/company-repository';
import { requireCompanyAccess } from '../../middleware/authorization';

const router = Router();

// Company OpenPhone numbers (using stored API key) - requires membership
router.get(
  '/:id/openphone/numbers',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const company = await CompanyRepository.getCompanyOpenPhoneSettings(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const apiKey = company.openphone_api_key;

    if (!apiKey) {
      throw new ValidationError('OpenPhone API key is not configured for this company.');
    }

    try {
      const numbers = await fetchOpenPhoneNumbers(apiKey);
      res.json(numbers);
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      throw new AppError('Failed to load OpenPhone phone numbers.', status);
    }
  })
);

// Test OpenPhone connection using stored API key - requires membership
router.get(
  '/:id/openphone/test',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const company = await CompanyRepository.getCompanyOpenPhoneSettings(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const apiKey = company.openphone_api_key;

    if (!apiKey) {
      throw new ValidationError('OpenPhone API key is not configured for this company.');
    }

    try {
      await validateOpenPhoneApiKey(apiKey);
      res.json({ success: true });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      throw new AppError('OpenPhone API key is invalid.', status);
    }
  })
);

// Update OpenPhone settings for a company - requires membership
router.patch(
  '/:id/openphone/settings',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { openphone_api_key, openphone_phone_number_id, openphone_phone_number, openphone_enabled } = req.body ?? {};

    const sanitizedApiKey =
      typeof openphone_api_key === 'string' && openphone_api_key.trim()
        ? normalizeApiKey(openphone_api_key)
        : null;

    const phoneNumberId =
      typeof openphone_phone_number_id === 'string' && openphone_phone_number_id.trim()
        ? openphone_phone_number_id.trim()
        : null;

    const phoneNumberValue =
      typeof openphone_phone_number === 'string' && openphone_phone_number.trim()
        ? openphone_phone_number.trim()
        : null;

    const shouldEnable = Boolean(openphone_enabled && sanitizedApiKey && phoneNumberId);

    const payload = {
      openphone_api_key: sanitizedApiKey,
      openphone_phone_number_id: phoneNumberId,
      openphone_phone_number: phoneNumberValue,
      openphone_enabled: shouldEnable,
    };

    const company = await CompanyRepository.updateCompany(id, payload);
    res.json(company);
  })
);

export default router;
