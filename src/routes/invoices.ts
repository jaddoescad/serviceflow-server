import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import * as InvoiceRepository from '../repositories/invoice-repository';
import * as RpcRepository from '../repositories/rpc-repository';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const router = Router();

// Get invoices - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, deal_id, quote_id } = req.query;
    const invoices = await InvoiceRepository.getInvoices({
      company_id: company_id as string,
      deal_id: deal_id as string,
      quote_id: quote_id as string,
    });
    res.json(invoices);
  })
);

// Get invoice summaries for deals (invoice count, latest status/total) - requires company membership
router.get(
  '/summary',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id } = req.query;

    if (!company_id || typeof company_id !== 'string') {
      throw new ValidationError('company_id is required');
    }

    const invoices = await InvoiceRepository.getInvoicesForSummary(company_id);

    const summaries = new Map<
      string,
      {
        dealId: string;
        invoiceCount: number;
        totalAmount: number;
        balanceDue: number;
        latestStatus: string;
        latestUpdatedAt: string;
        latestInvoiceId: string | null;
      }
    >();

    for (const invoice of invoices) {
      const dealId = invoice.deal_id;
      if (!dealId) continue;

      const updatedAt = invoice.updated_at ?? invoice.created_at ?? new Date().toISOString();
      const updatedAtTime = Date.parse(updatedAt) || 0;
      const existing = summaries.get(dealId);
      const existingTime = existing ? Date.parse(existing.latestUpdatedAt) || 0 : -Infinity;
      const isLatest = updatedAtTime >= existingTime;

      const next = existing
        ? {
            ...existing,
            invoiceCount: existing.invoiceCount + 1,
          }
        : {
            dealId,
            invoiceCount: 1,
            totalAmount: invoice.total_amount,
            balanceDue: invoice.balance_due,
            latestStatus: invoice.status,
            latestUpdatedAt: updatedAt,
            latestInvoiceId: invoice.id,
          };

      if (isLatest) {
        next.totalAmount = invoice.total_amount;
        next.balanceDue = invoice.balance_due;
        next.latestStatus = invoice.status;
        next.latestUpdatedAt = updatedAt;
        next.latestInvoiceId = invoice.id;
      }

      summaries.set(dealId, next);
    }

    res.json(Array.from(summaries.values()));
  })
);

// Create invoice - requires company membership
// Uses transactional RPC to create invoice and line items atomically
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { line_items, ...invoiceData } = req.body;

    if (!invoiceData.company_id || !invoiceData.deal_id) {
      throw new ValidationError('Missing required invoice fields');
    }

    // Use transactional RPC - invoice and line items are created atomically
    const result = await RpcRepository.createInvoiceWithItems({
      companyId: invoiceData.company_id,
      dealId: invoiceData.deal_id,
      quoteId: invoiceData.quote_id,
      invoiceNumber: invoiceData.invoice_number,
      title: invoiceData.title,
      status: invoiceData.status,
      issueDate: invoiceData.issue_date,
      dueDate: invoiceData.due_date,
      lineItems: line_items || [],
    });

    // Return the invoice with line items
    res.json({
      ...result.invoice,
      line_items: result.line_items,
    });
  })
);

// Get invoice by ID - requires access to invoice's company
router.get(
  '/:id',
  requireResourceAccess({ resourceType: 'invoice' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await InvoiceRepository.getInvoiceById(id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    res.json(invoice);
  })
);

// Get invoice by Share ID
router.get(
  '/share/:shareId',
  asyncHandler(async (req, res) => {
    const { shareId } = req.params;

    const invoice = await InvoiceRepository.getInvoiceByShareId(shareId);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    // Transform to InvoiceShareSnapshot format
    const company = invoice.company;
    const deal = invoice.deal;
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
      invoice: { ...invoice, company: undefined, deal: undefined }, // clean up response
      company,
      customer,
      propertyAddress,
    };

    res.json({ invoiceShare: snapshot });
  })
);

// List invoice payment requests - requires access to invoice's company
router.get(
  '/:id/payment-requests',
  requireResourceAccess({ resourceType: 'invoice' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const paymentRequests = await InvoiceRepository.getInvoicePaymentRequests(id);
    res.json(paymentRequests);
  })
);

// List invoice payments - requires access to invoice's company
router.get(
  '/:id/payments',
  requireResourceAccess({ resourceType: 'invoice' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payments = await InvoiceRepository.getInvoicePayments(id);
    res.json(payments);
  })
);

export default router;
