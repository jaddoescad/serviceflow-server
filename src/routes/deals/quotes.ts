import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError } from '../../lib/errors';
import * as QuoteRepository from '../../repositories/quote-repository';
import * as DealRepository from '../../repositories/deal-repository';
import * as RpcRepository from '../../repositories/rpc-repository';
import { sendCommunication } from '../../services/communication-service';
import { requireResourceAccess } from '../../middleware/authorization';

const router = Router();

// POST /:dealId/quotes/:quoteId/send - Send a quote via email and/or SMS
router.post(
  '/:dealId/quotes/:quoteId/send',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, quoteId } = req.params;
    const { method, email, text } = req.body ?? {};

    if (!dealId || !quoteId) {
      throw new ValidationError('dealId and quoteId are required');
    }

    let quote: any;
    let deal: any;

    // Try RPC first for optimized single call, fall back to sequential queries
    const context = await RpcRepository.getQuoteSendContext(quoteId, dealId);

    if (context) {
      quote = context.quote;
      deal = context.deal;
    } else {
      // Fallback: fetch quote and deal separately
      quote = await QuoteRepository.getQuoteById(quoteId);

      if (!quote) {
        throw new NotFoundError('Quote not found for this deal');
      }

      if (quote.deal_id !== dealId) {
        throw new ValidationError('Quote does not belong to this deal');
      }

      deal = await DealRepository.getDealById(dealId);

      if (!deal) {
        throw new NotFoundError('Deal not found');
      }
    }

    const quoteIsAccepted = quote.status === 'accepted';

    if (!deal.company_id) {
      throw new ValidationError('Deal is missing company context.');
    }

    // Send communication using the service
    const result = await sendCommunication({
      companyId: deal.company_id,
      method: method || 'email',
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

    let updatedQuoteStatus = quote.status;
    let updatedDealStage = deal.stage;

    // Update quote and deal status atomically if communication was sent
    if ((result.sentEmail || result.sentSms) && !quoteIsAccepted) {
      // Use atomic RPC to update both quote status and deal stage in a single transaction
      const updateResult = await RpcRepository.updateQuoteAndDealAfterSend({
        quoteId,
        dealId,
        newQuoteStatus: 'sent',
        newDealStage: 'proposals_sent',
      });

      updatedQuoteStatus = updateResult.quoteStatus;
      updatedDealStage = updateResult.dealStage;
    }

    res.json({
      sentEmail: result.sentEmail,
      sentText: result.sentSms,
      quoteStatus: updatedQuoteStatus,
    });
  })
);

export default router;
