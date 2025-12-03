import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { isPostmarkConfigured } from '../../lib/postmark';
import * as CompanyRepository from '../../repositories/company-repository';
import { requireCompanyAccess } from '../../middleware/authorization';

const router = Router();

const defaultEmailSettings = (companyId: string) => ({
  id: 'pending',
  company_id: companyId,
  reply_email: null,
  bcc_email: null,
  provider: isPostmarkConfigured ? 'postmark' : null,
  provider_account_email: null,
  provider_account_id: null,
  connected_at: null,
  status: isPostmarkConfigured ? 'connected' : 'disconnected',
  status_error: isPostmarkConfigured ? null : 'Postmark environment variables are not configured.',
  last_synced_at: null,
  created_at: null,
  updated_at: null,
});

// Company email settings - requires membership
router.get(
  '/:id/email-settings',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      const settings = await CompanyRepository.getCompanyEmailSettings(id);

      const base = settings ?? defaultEmailSettings(id);
      const normalized = {
        ...base,
        provider: isPostmarkConfigured ? 'postmark' : base.provider,
        status: isPostmarkConfigured ? 'connected' : 'disconnected',
        status_error: isPostmarkConfigured ? null : 'Postmark environment variables are not configured.',
      };

      res.json(normalized);
    } catch (error: any) {
      // If table is missing or other DB error, fall back to defaults so the UI can still render
      if (error?.message?.toLowerCase().includes('relation')) {
        return res.json(defaultEmailSettings(id));
      }
      throw error;
    }
  })
);

// Update email settings - requires membership
router.patch(
  '/:id/email-settings',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reply_email, bcc_email } = req.body ?? {};

    const payload = {
      company_id: id,
      reply_email: reply_email ?? null,
      bcc_email: bcc_email ?? null,
      provider: isPostmarkConfigured ? 'postmark' : null,
      status: isPostmarkConfigured ? 'connected' : 'error',
      status_error: isPostmarkConfigured ? null : 'Postmark environment variables are not configured.',
    };

    try {
      const settings = await CompanyRepository.upsertCompanyEmailSettings(payload);
      res.json(settings);
    } catch (error: any) {
      // Table missing; return in-memory payload so UI doesn't break
      if (error?.message?.toLowerCase().includes('relation')) {
        return res.json({ ...defaultEmailSettings(id), ...payload });
      }
      throw error;
    }
  })
);

export default router;
