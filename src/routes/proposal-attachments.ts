import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError } from '../lib/errors';
import { PROPOSAL_ATTACHMENT_MAX_FILE_BYTES } from '../lib/proposal-attachments';
import * as ProposalAttachmentService from '../services/proposal-attachment-service';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROPOSAL_ATTACHMENT_MAX_FILE_BYTES },
});

// Create proposal attachment - requires company membership
router.post(
  '/',
  requireCompanyAccess({ companyIdSource: 'body' }),
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.file?.[0];
    const thumbnail = files?.thumbnail?.[0];
    const { quote_id, deal_id, company_id } = req.body ?? {};

    if (!file) {
      throw new ValidationError('Attachment file is required.');
    }

    if (!quote_id || !deal_id) {
      throw new ValidationError('quote_id and deal_id are required.');
    }

    if (file.mimetype && !file.mimetype.startsWith('image/')) {
      throw new ValidationError('Only image attachments are supported.');
    }

    const asset = await ProposalAttachmentService.uploadProposalAttachment({
      quoteId: quote_id,
      dealId: deal_id,
      companyId: company_id,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      thumbnail: thumbnail
        ? {
            buffer: thumbnail.buffer,
            originalname: thumbnail.originalname,
            mimetype: thumbnail.mimetype,
          }
        : undefined,
      uploadedByUserId: null,
    });

    return res.status(201).json(asset);
  })
);

// Delete proposal attachment - requires access to attachment's company
router.delete(
  '/:id',
  requireResourceAccess({ resourceType: 'proposal_attachment' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('attachment id is required.');
    }

    await ProposalAttachmentService.deleteProposalAttachment(id);

    return res.status(204).send();
  })
);

export default router;
