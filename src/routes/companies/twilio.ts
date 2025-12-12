import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError, AppError } from '../../lib/errors';
import { fetchTwilioNumbers, normalizeAccountSid, normalizeAuthToken, validateTwilioCredentials } from '../../lib/twilio';
import * as CompanyRepository from '../../repositories/company-repository';
import { requireCompanyAccess } from '../../middleware/authorization';

const router = Router();

// Company Twilio numbers (using stored credentials) - requires membership
router.get(
  '/:id/twilio/numbers',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const company = await CompanyRepository.getCompanyTwilioSettings(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const accountSid = company.twilio_account_sid;
    const authToken = company.twilio_auth_token;

    if (!accountSid || !authToken) {
      throw new ValidationError('Twilio credentials are not configured for this company.');
    }

    try {
      const numbers = await fetchTwilioNumbers(accountSid, authToken);
      res.json(numbers);
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      throw new AppError('Failed to load Twilio phone numbers.', status);
    }
  })
);

// Test Twilio connection using stored credentials - requires membership
router.get(
  '/:id/twilio/test',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const company = await CompanyRepository.getCompanyTwilioSettings(id);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const accountSid = company.twilio_account_sid;
    const authToken = company.twilio_auth_token;

    if (!accountSid || !authToken) {
      throw new ValidationError('Twilio credentials are not configured for this company.');
    }

    try {
      await validateTwilioCredentials(accountSid, authToken);
      res.json({ success: true });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      throw new AppError('Twilio credentials are invalid.', status);
    }
  })
);

// Update Twilio settings for a company - requires membership
router.patch(
  '/:id/twilio/settings',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      twilio_account_sid,
      twilio_auth_token,
      twilio_phone_number,
      twilio_enabled,
    } = req.body ?? {};

    const sanitizedSid =
      typeof twilio_account_sid === 'string' && twilio_account_sid.trim()
        ? normalizeAccountSid(twilio_account_sid)
        : null;

    const sanitizedToken =
      typeof twilio_auth_token === 'string' && twilio_auth_token.trim()
        ? normalizeAuthToken(twilio_auth_token)
        : null;

    const phoneNumberValue =
      typeof twilio_phone_number === 'string' && twilio_phone_number.trim()
        ? twilio_phone_number.trim()
        : null;

    const shouldEnable = Boolean(
      twilio_enabled && sanitizedSid && sanitizedToken && phoneNumberValue
    );

    const payload = {
      twilio_account_sid: sanitizedSid,
      twilio_auth_token: sanitizedToken,
      twilio_phone_number: phoneNumberValue,
      twilio_enabled: shouldEnable,
    };

    const company = await CompanyRepository.updateCompany(id, payload);
    res.json(company);
  })
);

export default router;

