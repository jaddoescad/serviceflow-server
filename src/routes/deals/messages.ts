import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError } from '../../lib/errors';
import { DEAL_MESSAGE_ATTACHMENT_MAX_FILE_BYTES } from '../../lib/deal-messages';
import * as DealMessageService from '../../services/deal-message-service';
import { requireResourceAccess } from '../../middleware/authorization';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DEAL_MESSAGE_ATTACHMENT_MAX_FILE_BYTES },
});

// GET /:dealId/messages - list messages for a deal
router.get(
  '/:dealId/messages',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId } = req.params;

    if (!dealId) {
      throw new ValidationError('dealId is required');
    }

    const messages = await DealMessageService.listDealMessages(dealId);
    res.json(messages);
  })
);

// POST /:dealId/messages - send outbound message (team -> customer), optional image attachment
router.post(
  '/:dealId/messages',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { dealId } = req.params;
    const companyId = req.authorizedCompanyId;

    if (!dealId) {
      throw new ValidationError('dealId is required');
    }

    if (!companyId) {
      throw new ValidationError('companyId is required');
    }

    const bodyValue = typeof req.body?.body === 'string' ? req.body.body : null;
    const body = bodyValue ? bodyValue.trim() : null;

    const file = req.file;
    if (file && file.mimetype && !file.mimetype.startsWith('image/')) {
      throw new ValidationError('Only image attachments are supported.');
    }

    if (!body && !file) {
      throw new ValidationError('Message body or image is required.');
    }

    const message = await DealMessageService.sendOutboundDealMessage({
      companyId,
      dealId,
      body,
      authorUserId: req.user?.id ?? null,
      attachment: file
        ? {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          }
        : undefined,
    });

    res.status(201).json(message);
  })
);

// POST /:dealId/messages/inbound - record inbound message (customer -> team), optional image attachment
router.post(
  '/:dealId/messages/inbound',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { dealId } = req.params;
    const companyId = req.authorizedCompanyId;

    if (!dealId) {
      throw new ValidationError('dealId is required');
    }

    if (!companyId) {
      throw new ValidationError('companyId is required');
    }

    const bodyValue = typeof req.body?.body === 'string' ? req.body.body : null;
    const body = bodyValue ? bodyValue.trim() : null;

    const file = req.file;
    if (file && file.mimetype && !file.mimetype.startsWith('image/')) {
      throw new ValidationError('Only image attachments are supported.');
    }

    if (!body && !file) {
      throw new ValidationError('Message body or image is required.');
    }

    const message = await DealMessageService.createDealMessage({
      companyId,
      dealId,
      direction: 'inbound',
      body,
      authorUserId: null,
      attachment: file
        ? {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          }
        : undefined,
    });

    res.status(201).json(message);
  })
);

export default router;
