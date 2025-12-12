import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, AppError } from '../lib/errors';
import { fetchTwilioNumbers, normalizeAccountSid, normalizeAuthToken, validateTwilioCredentials } from '../lib/twilio';

const router = Router();

router.post(
  '/twilio/numbers',
  asyncHandler(async (req, res) => {
    const { accountSid, authToken } = req.body ?? {};

    const sanitizedSid =
      typeof accountSid === 'string' && accountSid.trim()
        ? normalizeAccountSid(accountSid)
        : null;
    const sanitizedToken =
      typeof authToken === 'string' && authToken.trim()
        ? normalizeAuthToken(authToken)
        : null;

    if (!sanitizedSid || !sanitizedToken) {
      throw new ValidationError('accountSid and authToken are required');
    }

    try {
      const numbers = await fetchTwilioNumbers(sanitizedSid, sanitizedToken);
      res.json(numbers);
    } catch (err) {
      const status = typeof (err as any)?.status === 'number' ? (err as any).status : 400;
      throw new AppError('Failed to load Twilio phone numbers.', status);
    }
  })
);

router.post(
  '/twilio/test',
  asyncHandler(async (req, res) => {
    const { accountSid, authToken } = req.body ?? {};

    const sanitizedSid =
      typeof accountSid === 'string' && accountSid.trim()
        ? normalizeAccountSid(accountSid)
        : null;
    const sanitizedToken =
      typeof authToken === 'string' && authToken.trim()
        ? normalizeAuthToken(authToken)
        : null;

    if (!sanitizedSid || !sanitizedToken) {
      throw new ValidationError('accountSid and authToken are required');
    }

    try {
      await validateTwilioCredentials(sanitizedSid, sanitizedToken);
      res.json({ success: true });
    } catch (err) {
      const status = typeof (err as any)?.status === 'number' ? (err as any).status : 400;
      throw new AppError('Twilio credentials are invalid.', status);
    }
  })
);

export default router;
