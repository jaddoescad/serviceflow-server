import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import { sendCommunication, CommunicationError } from '../services/communication-service';
import * as QuoteRepository from '../repositories/quote-repository';
import { requireResourceAccess } from '../middleware/authorization';

const router = Router();

// Send work order - requires access to the quote's company
router.post(
  '/send',
  requireResourceAccess({ resourceType: 'quote', resourceIdSource: 'body', resourceIdField: 'quoteId' }),
  asyncHandler(async (req, res) => {
    const { dealId, quoteId, method, email, text } = req.body ?? {};

    if (!dealId || !quoteId) {
      throw new ValidationError('dealId and quoteId are required.');
    }

    // Validate quote exists and get company context
    const quote = await QuoteRepository.getQuoteById(quoteId);

    if (!quote) {
      throw new NotFoundError('Quote not found for this deal.');
    }

    if (quote.deal_id !== dealId) {
      throw new ValidationError('Quote does not belong to this deal.');
    }

    if (!quote.company_id) {
      throw new ValidationError('Quote is missing company context.');
    }

    // Send communication using the service
    // CommunicationError now extends AppError, so it will be handled by global error handler
    const result = await sendCommunication({
      companyId: quote.company_id,
      method: method?.toLowerCase() || 'email',
      email: email
        ? {
            to: email.to,
            subject: email.subject,
            body: email.body,
            cc: email.cc,
          }
        : undefined,
      sms: text
        ? {
            to: text.to,
            body: text.body,
          }
        : undefined,
    });

    res.json({
      sentEmail: result.sentEmail,
      sentText: result.sentSms,
    });
  })
);

export default router;
