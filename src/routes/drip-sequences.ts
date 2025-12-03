import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError } from '../lib/errors';
import { fetchSequenceWithSteps } from '../services/drip-sequence-service';
import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const router = Router();

// Get drip sequences - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, pipeline_id } = req.query;

    const sequences = await DripSequenceRepository.getDripSequences({
      company_id: company_id as string,
      pipeline_id: pipeline_id as string,
    });

    res.json(sequences);
  })
);

// Create drip sequence - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, pipeline_id, stage_id, name, is_enabled } = req.body;

    if (!company_id || !pipeline_id || !stage_id || !name) {
      throw new ValidationError('Missing required fields');
    }

    const result = await DripSequenceRepository.createDripSequence({
      company_id,
      pipeline_id,
      stage_id,
      name,
      is_enabled,
    });

    const sequence = await fetchSequenceWithSteps(result.id);
    res.json(sequence);
  })
);

// Update drip sequence - requires access to sequence's company
router.patch(
  '/:id',
  requireResourceAccess({ resourceType: 'drip_sequence' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { company_id, pipeline_id, stage_id, name, is_enabled } = req.body;

    const updates: Record<string, any> = {};

    if (company_id !== undefined) updates.company_id = company_id;
    if (pipeline_id !== undefined) updates.pipeline_id = pipeline_id;
    if (stage_id !== undefined) updates.stage_id = stage_id;
    if (name !== undefined) updates.name = name;
    if (is_enabled !== undefined) updates.is_enabled = is_enabled;

    await DripSequenceRepository.updateDripSequence(id, updates);

    const sequence = await fetchSequenceWithSteps(id);
    res.json(sequence);
  })
);

// Reorder drip steps within a sequence - requires access to sequence's company
router.post(
  '/:id/reorder',
  requireResourceAccess({ resourceType: 'drip_sequence' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { order } = req.body as { order?: Array<{ id: string; position: number }> };

    if (!Array.isArray(order)) {
      throw new ValidationError('Missing order array');
    }

    await DripSequenceRepository.batchUpdateDripStepPositions(order);

    const sequence = await fetchSequenceWithSteps(id);
    res.json(sequence);
  })
);

export default router;
