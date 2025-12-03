import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import { fetchSequenceWithSteps } from '../services/drip-sequence-service';
import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import { requireResourceAccess } from '../middleware/authorization';

const router = Router();

// Create a drip step and return the full sequence - requires access to sequence's company
router.post(
  '/',
  requireResourceAccess({ resourceType: 'drip_sequence', resourceIdSource: 'body', resourceIdField: 'sequence_id' }),
  asyncHandler(async (req, res) => {
    const {
      sequence_id,
      position,
      delay_type,
      delay_value,
      delay_unit,
      channel,
      email_subject,
      email_body,
      sms_body,
    } = req.body;

    if (!sequence_id || position === undefined || !delay_type || delay_value === undefined || !delay_unit || !channel) {
      throw new ValidationError('Missing required fields');
    }

    const result = await DripSequenceRepository.createDripStep({
      sequence_id,
      position,
      delay_type,
      delay_value,
      delay_unit,
      channel,
      email_subject: email_subject ?? null,
      email_body: email_body ?? null,
      sms_body: sms_body ?? null,
    });

    const sequence = await fetchSequenceWithSteps(result.sequence_id);
    res.json(sequence);
  })
);

// Update a drip step and return the full sequence - requires access to step's company
router.patch(
  '/:id',
  requireResourceAccess({ resourceType: 'drip_step' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { delay_type, delay_value, delay_unit, channel, email_subject, email_body, sms_body } = req.body;

    const updates: Record<string, any> = {};
    if (delay_type !== undefined) updates.delay_type = delay_type;
    if (delay_value !== undefined) updates.delay_value = delay_value;
    if (delay_unit !== undefined) updates.delay_unit = delay_unit;
    if (channel !== undefined) updates.channel = channel;
    if (email_subject !== undefined) updates.email_subject = email_subject;
    if (email_body !== undefined) updates.email_body = email_body;
    if (sms_body !== undefined) updates.sms_body = sms_body;

    const result = await DripSequenceRepository.updateDripStep(id, updates);

    if (!result) {
      throw new NotFoundError('Drip step not found');
    }

    const sequence = await fetchSequenceWithSteps(result.sequence_id);
    res.json(sequence);
  })
);

// Delete a drip step and return the updated sequence (or null if missing) - requires access to step's company
router.delete(
  '/:id',
  requireResourceAccess({ resourceType: 'drip_step' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await DripSequenceRepository.getDripStepById(id);

    if (!existing) {
      throw new NotFoundError('Drip step not found');
    }

    await DripSequenceRepository.deleteDripStep(id);

    try {
      const sequence = await fetchSequenceWithSteps(existing.sequence_id);
      res.json(sequence);
    } catch (fetchError) {
      // If the sequence is gone (edge case), surface null so the client can clear state.
      res.json(null);
    }
  })
);

export default router;
