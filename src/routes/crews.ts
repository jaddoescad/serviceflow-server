import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import * as CrewRepository from '../repositories/crew-repository';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const router = Router();

// Get crews - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id } = req.query;
    const crews = await CrewRepository.getCrews({
      company_id: company_id as string,
    });
    res.json(crews);
  })
);

// Create crew - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, name, created_by_user_id } = req.body;

    if (!company_id || !name) {
      throw new ValidationError('company_id and name are required');
    }

    const payload: any = { company_id, name };
    if (created_by_user_id) {
      payload.created_by_user_id = created_by_user_id;
    }

    const crew = await CrewRepository.createCrew(payload);
    res.json(crew);
  })
);

// Get crew by ID - requires access to crew's company
router.get(
  '/:id',
  requireResourceAccess({ resourceType: 'crew' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const crew = await CrewRepository.getCrewById(id);

    if (!crew) {
      throw new NotFoundError('Crew not found');
    }

    res.json(crew);
  })
);

export default router;
