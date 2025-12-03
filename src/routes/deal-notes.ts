import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError } from '../lib/errors';
import * as DealNoteRepository from '../repositories/deal-note-repository';
import { requireCompanyAccess } from '../middleware/authorization';

const router = Router();

// Get deal notes - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, deal_id } = req.query;
    const notes = await DealNoteRepository.getDealNotes({
      company_id: company_id as string,
      deal_id: deal_id as string,
      includeAuthor: true,
    });
    res.json(notes);
  })
);

// Create deal note - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, deal_id, author_user_id, body } = req.body;

    if (!company_id || !deal_id || !body) {
      throw new ValidationError('Missing required fields');
    }

    const note = await DealNoteRepository.createDealNote({ company_id, deal_id, author_user_id, body }, true);
    res.json(note);
  })
);

export default router;
