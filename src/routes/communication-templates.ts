import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError } from '../lib/errors';
import * as CommunicationTemplateRepository from '../repositories/communication-template-repository';
import { requireCompanyAccess } from '../middleware/authorization';

const router = Router();

// Get templates - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, template_key } = req.query;
    const companyId = Array.isArray(company_id) ? company_id[0] : company_id;
    const templateKey = Array.isArray(template_key) ? template_key[0] : template_key;

    const templates = await CommunicationTemplateRepository.getCommunicationTemplates({
      company_id: companyId as string,
      template_key: templateKey as string,
    });

    res.json(templates);
  })
);

// Upsert template - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, template_key, ...updates } = req.body;

    if (!company_id || !template_key) {
      throw new ValidationError('company_id and template_key are required');
    }

    const template = await CommunicationTemplateRepository.upsertCommunicationTemplate(company_id, template_key, updates);

    res.json(template);
  })
);

export default router;
