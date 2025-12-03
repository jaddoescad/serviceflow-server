import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, AppError } from '../lib/errors';
import { fetchOpenPhoneNumbers, normalizeApiKey, validateOpenPhoneApiKey } from '../lib/openphone';

const router = Router();

router.post(
  '/openphone/numbers',
  asyncHandler(async (req, res) => {
    const { apiKey } = req.body ?? {};

    const sanitizedKey =
      typeof apiKey === 'string' && apiKey.trim() ? normalizeApiKey(apiKey) : null;

    if (!sanitizedKey) {
      throw new ValidationError('apiKey is required');
    }

    try {
      const numbers = await fetchOpenPhoneNumbers(sanitizedKey);
      res.json(numbers);
    } catch (err) {
      const status = typeof (err as any)?.status === 'number' ? (err as any).status : 400;
      throw new AppError('Failed to load OpenPhone phone numbers.', status);
    }
  })
);

router.post(
  '/openphone/test',
  asyncHandler(async (req, res) => {
    const { apiKey } = req.body ?? {};

    const sanitizedKey =
      typeof apiKey === 'string' && apiKey.trim() ? normalizeApiKey(apiKey) : null;

    if (!sanitizedKey) {
      throw new ValidationError('apiKey is required');
    }

    try {
      await validateOpenPhoneApiKey(sanitizedKey);
      res.json({ success: true });
    } catch (err) {
      const status = typeof (err as any)?.status === 'number' ? (err as any).status : 400;
      throw new AppError('OpenPhone API key is invalid.', status);
    }
  })
);

export default router;
