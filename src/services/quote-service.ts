import { sendOwnerNotification } from './notification-service';
import * as QuoteRepository from '../repositories/quote-repository';
import * as DealRepository from '../repositories/deal-repository';
import * as InvoiceRepository from '../repositories/invoice-repository';
import * as RpcRepository from '../repositories/rpc-repository';
import type { Quote, QuoteWithLineItems } from '../types/api';

/**
 * Type definitions for quote service
 */
export type QuoteAcceptanceResult = {
  updatedQuote: Pick<Quote, 'id' | 'status' | 'acceptance_signature' | 'acceptance_signed_at'>;
  autoInvoiceId: string | null;
};

export type QuoteLineItemInput = {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price?: number;
  unitPrice?: number;
  position?: number;
};

export interface QuotePayload {
  id?: string;
  company_id: string;
  deal_id: string;
  quote_number?: string;
  quoteNumber?: string;
  title?: string | null;
  status?: string;
  client_message?: string | null;
  disclaimer?: string | null;
}

export type CreateOrUpdateQuoteParams = {
  quote: QuotePayload;
  lineItems: QuoteLineItemInput[];
  deletedLineItemIds?: string[];
};

/** Minimal response from quote save operation */
export type QuoteSaveResult = {
  success: boolean;
  id: string;
  quote_number: string;
  public_share_id: string | null;
  is_new: boolean;
  new_line_items: Array<{ id: string; client_id: string }>;
};

/**
 * Create or update a quote with line items
 * Uses transactional RPC to ensure atomicity:
 * - Creating new quote or updating existing quote
 * - Managing line items (delete old, upsert new)
 * - Updating deal stage to 'in_draft' when creating new quote
 * All operations are rolled back if any step fails.
 */
export async function createOrUpdateQuote(params: CreateOrUpdateQuoteParams): Promise<QuoteSaveResult> {
  const { quote: quotePayload, lineItems, deletedLineItemIds = [] } = params;

  if (!quotePayload?.company_id || !quotePayload?.deal_id) {
    throw new Error('Missing required quote fields (company_id, deal_id).');
  }

  const resolvedQuoteNumber =
    quotePayload.quote_number ??
    quotePayload.quoteNumber ??
    `Q-${Date.now()}`;

  // Use transactional RPC - all operations are atomic
  const result = await RpcRepository.createOrUpdateQuoteWithItems({
    quoteId: quotePayload.id || null,
    companyId: quotePayload.company_id,
    dealId: quotePayload.deal_id,
    quoteNumber: resolvedQuoteNumber,
    title: quotePayload.title ?? resolvedQuoteNumber,
    status: quotePayload.status ?? 'draft',
    clientMessage: quotePayload.client_message,
    disclaimer: quotePayload.disclaimer,
    lineItems: lineItems || [],
    deletedLineItemIds,
  });

  // Return minimal response directly from RPC
  return result;
}

/**
 * Accept a quote/proposal with signature
 * Handles:
 * - Updating quote status and signature
 * - Moving deal to 'project_accepted' stage
 * - Auto-creating invoice from quote line items
 * - Sending owner notification
 */
export async function acceptQuote(params: {
  quoteId: string;
  dealId: string | null;
  companyId: string;
  signature: string;
  acceptedAt: string;
}): Promise<QuoteAcceptanceResult> {
  const { quoteId, dealId, companyId, signature, acceptedAt } = params;

  // 1. Update quote with acceptance details
  const updatedQuote = await QuoteRepository.acceptQuote({
    quoteId,
    signature,
    acceptedAt,
  });

  let autoInvoiceId: string | null = null;

  // 2. Update deal stage if applicable
  if (dealId) {
    try {
      await DealRepository.updateDealStage(dealId, 'project_accepted');
    } catch (error) {
      console.error('Failed to move deal to project_accepted after proposal acceptance', error);
    }

    // 3. Auto-create invoice for accepted proposal (if one doesn't exist)
    autoInvoiceId = await createInvoiceForQuote({
      quoteId,
      dealId,
      companyId,
      acceptedAt,
    });
  }

  return {
    updatedQuote,
    autoInvoiceId,
  };
}

/**
 * Create an invoice for a quote
 * Returns the invoice ID if created, or existing invoice ID if already exists
 */
async function createInvoiceForQuote(params: {
  quoteId: string;
  dealId: string;
  companyId: string;
  acceptedAt: string;
}): Promise<string | null> {
  const { quoteId, dealId, companyId, acceptedAt } = params;

  try {
    // Check if invoice already exists for this quote
    const existingInvoice = await InvoiceRepository.getInvoiceByQuoteId(quoteId);

    if (existingInvoice?.id) {
      return existingInvoice.id;
    }

    // Fetch quote details for invoice creation
    const quote = await QuoteRepository.getQuoteById(quoteId);

    if (!quote) {
      console.error('Failed to fetch quote for invoice creation');
      return null;
    }

    // Fetch quote line items (excluding change orders)
    const lineItems = await QuoteRepository.getQuoteLineItems(quoteId, {
      excludeChangeOrders: true,
    });

    // Calculate total amount
    const totalAmount = lineItems.reduce((sum, item) => {
      const qty = Number(item?.quantity ?? 0);
      const price = Number(item?.unit_price ?? 0);
      return sum + qty * price;
    }, 0);

    // Create invoice
    const issueDate = acceptedAt;
    const dueDate = new Date(Date.parse(acceptedAt) + 14 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceNumber = `INV-${Date.now()}`;
    const invoiceTitle = quote.title || quote.quote_number || invoiceNumber;

    const invoice = await InvoiceRepository.createInvoice({
      company_id: companyId,
      deal_id: dealId,
      quote_id: quoteId,
      invoice_number: invoiceNumber,
      title: invoiceTitle,
      status: 'unpaid',
      issue_date: issueDate,
      due_date: dueDate,
      total_amount: totalAmount,
      balance_due: totalAmount,
    });

    // Add line items to invoice
    if (invoice?.id && lineItems.length > 0) {
      const itemsPayload = lineItems.map((item) => ({
        invoice_id: invoice.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        position: item.position,
      }));

      try {
        await InvoiceRepository.createInvoiceLineItems(itemsPayload);
      } catch (error) {
        console.error('Invoice created but failed to add line items', error);
      }
    }

    return invoice?.id ?? null;
  } catch (error) {
    console.error('Unexpected error during invoice creation', error);
    return null;
  }
}

/**
 * Send owner notification for quote acceptance
 */
export async function notifyQuoteAcceptance(params: {
  companyId: string;
  quoteNumber: string | null;
  quoteTitle: string | null;
  quoteId: string;
  dealId: string | null;
  acceptedAt: string;
  invoiceId: string | null;
}): Promise<void> {
  const { companyId, quoteNumber, quoteTitle, quoteId, dealId, acceptedAt, invoiceId } = params;

  const proposalLabel = quoteNumber || quoteTitle || quoteId;
  const subject = proposalLabel ? `Proposal accepted: ${proposalLabel}` : 'Proposal accepted';
  const body = [
    'Congrats! A proposal was just accepted.',
    proposalLabel ? `Proposal: ${proposalLabel}` : null,
    dealId ? `Deal ID: ${dealId}` : null,
    `Accepted at: ${acceptedAt}`,
    invoiceId ? `Invoice created: ${invoiceId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await sendOwnerNotification({
    companyId,
    subject,
    body,
  });
}
