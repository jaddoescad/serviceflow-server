import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import * as ProductTemplateRepository from '../repositories/product-template-repository';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const router = Router();

// Get product templates - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, type, search } = req.query;
    const templates = await ProductTemplateRepository.getProductTemplates({
      company_id: company_id as string,
      type: type as string,
      search: search as string,
    });
    res.json(templates);
  })
);

// Create product template - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, created_by_user_id, name, description, type } = req.body;

    if (!company_id || !name || !type) {
      throw new ValidationError('company_id, name, and type are required');
    }

    const template = await ProductTemplateRepository.createProductTemplate({
      company_id,
      created_by_user_id: created_by_user_id || null,
      name,
      description,
      type,
    });

    res.json(template);
  })
);

// Update product template - requires access to template's company
router.patch(
  '/:id',
  requireResourceAccess({ resourceType: 'product_template' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const template = await ProductTemplateRepository.updateProductTemplate(id, updates);

    if (!template) {
      throw new NotFoundError('Product template not found');
    }

    res.json(template);
  })
);

export default router;
