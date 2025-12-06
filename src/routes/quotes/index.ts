import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError } from '../../lib/errors';
import * as QuoteRepository from '../../repositories/quote-repository';
import * as QuoteService from '../../services/quote-service';
import { requireCompanyAccess, requireResourceAccess } from '../../middleware/authorization';
import { acceptQuote, notifyQuoteAcceptance } from '../../services/quote-service';

const router = Router();

/**
 * Filter out change order items from quote line items
 */
const sanitizeQuoteLineItems = (quote: any) => {
  if (!quote) return quote;
  return {
    ...quote,
    line_items: (quote.line_items ?? []).filter((item: any) => !item.is_change_order && !item.change_order_id),
  };
};

// Get quotes - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, deal_id, exclude_archived } = req.query;
    const quotes = await QuoteRepository.getQuotes({
      company_id: company_id as string,
      deal_id: deal_id as string,
      exclude_archived_deals: exclude_archived === 'true',
    });
    const sanitized = quotes.map(sanitizeQuoteLineItems);
    res.json(sanitized);
  })
);

// Get proposal summaries for deals (quote count, latest status/total) - requires company membership
router.get(
  '/summary',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id } = req.query;

    if (!company_id || typeof company_id !== 'string') {
      throw new ValidationError('company_id is required');
    }

    const quotes = await QuoteRepository.getQuotesWithSummary(company_id);

    const summaries = new Map<
      string,
      {
        dealId: string;
        quoteCount: number;
        totalAmount: number;
        latestStatus: string;
        latestUpdatedAt: string;
        latestQuoteId: string | null;
      }
    >();

    for (const quote of quotes ?? []) {
      const dealId = quote.deal_id;
      if (!dealId) continue;

      const lineItems = Array.isArray(quote.line_items)
        ? quote.line_items.filter((item: any) => !item.is_change_order && !item.change_order_id)
        : [];
      const totalAmount = lineItems.reduce((sum: number, item: any) => {
        const quantity = Number(item?.quantity ?? 0);
        const unitPrice = Number(item?.unit_price ?? 0);
        return sum + quantity * unitPrice;
      }, 0);

      const updatedAt = quote.updated_at ?? quote.created_at ?? new Date().toISOString();
      const updatedAtTime = Date.parse(updatedAt) || 0;
      const existing = summaries.get(dealId);
      const existingTime = existing ? Date.parse(existing.latestUpdatedAt) || 0 : -Infinity;
      const isLatest = updatedAtTime >= existingTime;

      const next = existing
        ? {
            ...existing,
            quoteCount: existing.quoteCount + 1,
          }
        : {
            dealId,
            quoteCount: 1,
            totalAmount,
            latestStatus: quote.status,
            latestUpdatedAt: updatedAt,
            latestQuoteId: quote.id,
          };

      if (isLatest) {
        next.totalAmount = totalAmount;
        next.latestStatus = quote.status;
        next.latestUpdatedAt = updatedAt;
        next.latestQuoteId = quote.id;
      }

      summaries.set(dealId, next);
    }

    res.json(Array.from(summaries.values()));
  })
);

// Create or update quote - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    // Accept both legacy payloads ({ line_items, ...quote }) and new payloads ({ quote, lineItems, deletedLineItemIds })
    const { quote: nestedQuote, lineItems, line_items, ...quoteData } = req.body ?? {};

    const quotePayload = nestedQuote ?? quoteData;
    const itemsPayload = line_items ?? lineItems ?? [];
    const deletedLineItemIds: string[] = Array.isArray(quoteData.deletedLineItemIds)
      ? quoteData.deletedLineItemIds
      : [];

    const result = await QuoteService.createOrUpdateQuote({
      quote: quotePayload,
      lineItems: itemsPayload,
      deletedLineItemIds,
    });

    res.json(result);
  })
);

// Get quote by ID - requires access to quote's company
router.get(
  '/:id',
  requireResourceAccess({ resourceType: 'quote' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const quote = await QuoteRepository.getQuoteById(id);

    if (!quote) {
      throw new NotFoundError('Quote not found');
    }

    res.json(sanitizeQuoteLineItems(quote));
  })
);

// Accept quote without signature (for employees) - requires access to quote's company
router.post(
  '/:id/accept-without-signature',
  requireResourceAccess({ resourceType: 'quote' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const quote = await QuoteRepository.getQuoteById(id);

    if (!quote) {
      throw new NotFoundError('Quote not found');
    }

    if (quote.status === 'accepted') {
      throw new ValidationError('Quote is already accepted');
    }

    const acceptedAt = new Date().toISOString();

    const { updatedQuote, autoInvoiceId } = await acceptQuote({
      quoteId: quote.id,
      dealId: quote.deal_id,
      companyId: quote.company_id,
      signature: '(Accepted without signature)',
      acceptedAt,
    });

    // Send owner notification
    if (quote.company_id) {
      await notifyQuoteAcceptance({
        companyId: quote.company_id,
        quoteNumber: quote.quote_number,
        quoteTitle: quote.title ?? null,
        quoteId: quote.id,
        dealId: quote.deal_id,
        acceptedAt,
        invoiceId: autoInvoiceId,
      });
    }

    res.json({
      status: updatedQuote.status,
      signature: updatedQuote.acceptance_signature,
      signedAt: updatedQuote.acceptance_signed_at,
      invoiceId: autoInvoiceId,
    });
  })
);

export default router;
