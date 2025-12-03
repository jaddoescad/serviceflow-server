import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError } from '../../lib/errors';
import * as QuoteRepository from '../../repositories/quote-repository';
import * as ChangeOrderRepository from '../../repositories/change-order-repository';
import * as InvoiceRepository from '../../repositories/invoice-repository';
import * as RpcRepository from '../../repositories/rpc-repository';
import { acceptQuote, notifyQuoteAcceptance } from '../../services/quote-service';

const router = Router();

// Get quote by Share ID - uses RPC for single database call with fallback
router.get(
  '/share/:shareId',
  asyncHandler(async (req, res) => {
    const { shareId } = req.params;

    // Try RPC first for optimized single call
    const rpcData = await RpcRepository.getPublicQuoteShare(shareId);

    if (rpcData) {
      return res.json(rpcData);
    }

    // Fallback: fetch data separately (original approach)
    const quote = await QuoteRepository.getQuoteByShareId(shareId);

    if (!quote) {
      throw new NotFoundError('Quote not found');
    }

    // Transform - filter out change order items from quote line items
    const filteredLineItems = (quote.line_items ?? []).filter(
      (item: any) => !item.is_change_order && !item.change_order_id
    );
    const normalizedQuote = { ...quote, line_items: filteredLineItems };

    const changeOrdersForQuote = await ChangeOrderRepository.getChangeOrders({ quote_id: normalizedQuote.id });

    const invoiceForQuote = await InvoiceRepository.getInvoiceByQuoteId(normalizedQuote.id);

    const company = normalizedQuote.company;
    const deal = normalizedQuote.deal;
    const contact = deal?.contact;

    const customer = {
      name: deal
        ? `${deal.first_name} ${deal.last_name}`
        : contact
          ? `${contact.first_name} ${contact.last_name}`
          : 'Valued Customer',
      email: deal?.email || contact?.email || null,
      phone: deal?.phone || contact?.phone || null,
    };

    const address = deal?.service_address;
    const propertyAddress = address
      ? [address.address_line1, address.address_line2, address.city, address.state, address.postal_code]
          .filter(Boolean)
          .join(', ')
      : null;

    const snapshot = {
      quote: { ...normalizedQuote, company: undefined, deal: undefined },
      company,
      customer,
      propertyAddress,
      changeOrders: changeOrdersForQuote ?? [],
      invoiceForQuote: invoiceForQuote ?? null,
    };

    res.json(snapshot);
  })
);

// Accept a quote/proposal by public share ID - uses RPC for atomic transaction with fallback
router.post(
  '/share/:shareId/accept',
  asyncHandler(async (req, res) => {
    const { shareId } = req.params;
    const { signature, signatureType } = req.body ?? {};

    if (!shareId) {
      throw new ValidationError('shareId is required');
    }

    if (typeof signature !== 'string' || !signature.trim()) {
      throw new ValidationError('Signature is required to accept the proposal.');
    }

    const trimmedSignature = signature.trim();
    const acceptedAt = new Date().toISOString();
    const validatedSignatureType: 'type' | 'draw' = signatureType === 'draw' ? 'draw' : 'type';

    // Fetch quote to get ID and company info for notification
    const quote = await QuoteRepository.getQuoteByShareId(shareId);

    if (!quote) {
      throw new NotFoundError('Proposal not found.');
    }

    let resultStatus = 'accepted';
    let resultSignature = trimmedSignature;
    let resultSignedAt = acceptedAt;
    let resultInvoiceId: string | null = null;
    let resultSignatureType = validatedSignatureType;

    // Try RPC for atomic quote acceptance and invoice creation
    const rpcResult = await RpcRepository.acceptQuoteWithInvoice(quote.id, trimmedSignature, acceptedAt, validatedSignatureType);

    if (rpcResult) {
      resultStatus = rpcResult.status;
      resultSignature = rpcResult.signature;
      resultSignedAt = rpcResult.signedAt;
      resultInvoiceId = rpcResult.invoiceId;
      resultSignatureType = rpcResult.signatureType ?? validatedSignatureType;
    } else {
      // Fallback: use service (original approach)
      const { updatedQuote, autoInvoiceId } = await acceptQuote({
        quoteId: quote.id,
        dealId: quote.deal_id,
        companyId: quote.company_id,
        signature: trimmedSignature,
        acceptedAt,
      });

      resultStatus = updatedQuote?.status ?? 'accepted';
      resultSignature = updatedQuote?.acceptance_signature ?? trimmedSignature;
      resultSignedAt = updatedQuote?.acceptance_signed_at ?? acceptedAt;
      resultInvoiceId = autoInvoiceId;
    }

    // Send owner notification (still needs separate call as it's an external service)
    if (quote.company_id) {
      await notifyQuoteAcceptance({
        companyId: quote.company_id,
        quoteNumber: quote.quote_number,
        quoteTitle: quote.title ?? null,
        quoteId: quote.id,
        dealId: quote.deal_id,
        acceptedAt,
        invoiceId: resultInvoiceId,
      });
    }

    res.json({
      status: resultStatus,
      signature: resultSignature,
      signatureType: resultSignatureType,
      signedAt: resultSignedAt,
      invoiceId: resultInvoiceId,
    });
  })
);

export default router;
