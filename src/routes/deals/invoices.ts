import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError, UnauthorizedError, InternalError } from '../../lib/errors';
import { isPostmarkConfigured, sendProposalEmail } from '../../lib/postmark';
import { sendOpenPhoneMessage } from '../../lib/openphone';
import { sendOwnerNotification } from '../../services/notification-service';
import { formatCurrency, formatSmsRecipient } from '../../utils/formatting';
import { sanitizeUserId } from '../../utils/validation';
import { getCompanyEmailSettings } from '../../utils/email-settings';
import {
  recordPaymentAndUpdateInvoice,
  sanitizeInvoice,
  sanitizePayments,
  sanitizePaymentRequests,
  addLineItemToInvoice,
  updateLineItemAndRecalculate,
  deleteLineItemAndRecalculate,
} from '../../services/invoice-service';
import * as InvoiceRepository from '../../repositories/invoice-repository';
import * as CompanyRepository from '../../repositories/company-repository';
import * as RpcRepository from '../../repositories/rpc-repository';
import { requireResourceAccess } from '../../middleware/authorization';
import type { EmailSettingsData, OpenPhoneSettingsData, Invoice, InvoicePaymentRequest } from '../../types/api';

// Helper to extract email settings from RPC result
function extractEmailSettings(rpcEmailSettings: EmailSettingsData | null | undefined): EmailSettingsData {
  return {
    provider_account_email: rpcEmailSettings?.provider_account_email ?? null,
    reply_email: rpcEmailSettings?.reply_email ?? null,
    bcc_email: rpcEmailSettings?.bcc_email ?? null,
  };
}

// Helper to extract OpenPhone settings from RPC result
function extractOpenPhoneSettings(rpcSettings: OpenPhoneSettingsData | null | undefined): OpenPhoneSettingsData {
  return {
    openphone_api_key: rpcSettings?.openphone_api_key ?? null,
    openphone_phone_number_id: rpcSettings?.openphone_phone_number_id ?? null,
    openphone_phone_number: rpcSettings?.openphone_phone_number ?? null,
    openphone_enabled: rpcSettings?.openphone_enabled ?? false,
  };
}

const router = Router();

// GET /:dealId/invoices/:invoiceId/detail - Get all invoice detail data in one RPC call
router.get(
  '/:dealId/invoices/:invoiceId/detail',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId } = req.params;
    const { company_id } = req.query;

    if (!dealId || !invoiceId || !company_id) {
      throw new ValidationError('dealId, invoiceId, and company_id are required');
    }

    const data = await RpcRepository.getInvoiceDetail(dealId, invoiceId, company_id as string);

    res.json(data);
  })
);

// POST /:dealId/invoices/:invoiceId/send - Send invoice via email and/or SMS
router.post(
  '/:dealId/invoices/:invoiceId/send',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId } = req.params;
    const { method, email, text } = req.body ?? {};

    if (!dealId || !invoiceId) {
      throw new ValidationError('dealId and invoiceId are required');
    }

    const shouldSendEmail = method === 'email' || method === 'both';
    const shouldSendText = method === 'text' || method === 'both';

    let invoice: Invoice | null;
    let effectiveEmailSettings: EmailSettingsData;
    let phoneSettings: OpenPhoneSettingsData | null;

    // Try RPC first for optimized single call
    const context = await RpcRepository.getInvoiceSendContext(invoiceId, dealId);

    if (context) {
      invoice = context.invoice;
      effectiveEmailSettings = extractEmailSettings(context.emailSettings);
      phoneSettings = extractOpenPhoneSettings(context.openphoneSettings);
    } else {
      // Fallback: fetch data separately (original approach)
      invoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);

      if (!invoice || invoice.deal_id !== dealId) {
        throw new NotFoundError('Invoice not found for this deal');
      }

      const companyEmailSettings = await getCompanyEmailSettings(invoice.company_id);
      effectiveEmailSettings = extractEmailSettings(companyEmailSettings);
      try {
        phoneSettings = await CompanyRepository.getCompanyOpenPhoneSettings(invoice.company_id);
      } catch (error) {
        phoneSettings = null;
      }
    }

    let sentEmail = false;
    let sentText = false;

    const fromEmail =
      effectiveEmailSettings?.provider_account_email ||
      effectiveEmailSettings?.reply_email ||
      process.env.POSTMARK_FROM_EMAIL ||
      null;

    const replyToEmail = effectiveEmailSettings?.reply_email ?? null;
    const bccEmail = effectiveEmailSettings?.bcc_email ?? null;

    if (shouldSendEmail) {
      if (!email || typeof email !== 'object' || !email.to || !email.subject || !email.body) {
        throw new ValidationError('Email recipient, subject, and body are required.');
      }

      if (!isPostmarkConfigured) {
        throw new InternalError('Email sending is not configured yet.');
      }

      if (!fromEmail) {
        throw new InternalError('Provide a From email in company email settings or POSTMARK_FROM_EMAIL.');
      }

      await sendProposalEmail({
        fromEmail,
        to: email.to,
        cc: email.cc,
        bcc: bccEmail,
        replyTo: replyToEmail,
        subject: email.subject,
        body: email.body,
      });
      sentEmail = true;
    }

    if (shouldSendText && text) {
      const recipient = typeof text.to === 'string' ? text.to.trim() : '';
      const messageBody = typeof text.body === 'string' ? text.body.trim() : '';

      if (!recipient || !messageBody) {
        throw new ValidationError('SMS delivery requires recipient and message body.');
      }

      const formattedRecipient = formatSmsRecipient(recipient);
      if (!formattedRecipient) {
        throw new ValidationError('Provide a valid SMS recipient.');
      }

      // phoneSettings already fetched from RPC above
      if (!phoneSettings?.openphone_enabled || !phoneSettings?.openphone_api_key) {
        throw new ValidationError('OpenPhone is not configured for this company.');
      }

      const fromValue =
        phoneSettings.openphone_phone_number_id?.trim() || phoneSettings.openphone_phone_number?.trim() || '';

      if (!fromValue) {
        throw new ValidationError('OpenPhone phone number is not configured.');
      }

      await sendOpenPhoneMessage({
        apiKey: phoneSettings.openphone_api_key,
        from: fromValue,
        to: formattedRecipient,
        content: messageBody,
      });
      sentText = true;
    }

    let updatedStatus = invoice.status;
    if ((sentEmail || sentText) && invoice.status === 'unpaid') {
      // Optionally update status to 'sent' if you have such a status,
      // but invoices usually stay 'unpaid' until paid.
    }

    res.json({
      sentEmail,
      sentText,
      invoiceStatus: updatedStatus,
    });
  })
);

// POST /:dealId/invoices/:invoiceId/payment-requests - Create payment request
router.post(
  '/:dealId/invoices/:invoiceId/payment-requests',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId } = req.params;
    const { amount, note } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    if (!amount || amount <= 0) {
      throw new ValidationError('Valid amount is required');
    }

    // Fetch invoice to get company_id and validate deal_id
    const invoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);

    if (!invoice || invoice.deal_id !== dealId) {
      throw new NotFoundError('Invoice not found');
    }

    // Enforce a single open (unpaid) payment request at a time
    const openRequests = await InvoiceRepository.getOpenPaymentRequests(invoiceId, dealId);

    if (openRequests && openRequests.length > 0) {
      throw new ValidationError(
        'You already have an unpaid payment request. Mark it paid or delete it before creating a new one.'
      );
    }

    const data = await InvoiceRepository.createInvoicePaymentRequest({
      company_id: invoice.company_id,
      deal_id: invoice.deal_id,
      invoice_id: invoiceId,
      requested_by_user_id: userId,
      amount,
      note,
      status: 'created',
    });

    res.json(data);
  })
);

// POST /:dealId/invoices/:invoiceId/payment-requests/:requestId/send - Send payment request
router.post(
  '/:dealId/invoices/:invoiceId/payment-requests/:requestId/send',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId, requestId } = req.params;
    const { method, email, text } = req.body ?? {};

    if (!dealId || !invoiceId || !requestId) {
      throw new ValidationError('dealId, invoiceId, and requestId are required');
    }

    const shouldSendEmail = method === 'email' || method === 'both';
    const shouldSendText = method === 'text' || method === 'both';

    let paymentRequest: InvoicePaymentRequest | null;
    let effectiveEmailSettings: EmailSettingsData;
    let phoneSettings: OpenPhoneSettingsData | null;

    // Try RPC first for optimized single call
    const context = await RpcRepository.getPaymentRequestSendContext(requestId, invoiceId, dealId);

    if (context) {
      paymentRequest = context.paymentRequest;
      effectiveEmailSettings = extractEmailSettings(context.emailSettings);
      phoneSettings = extractOpenPhoneSettings(context.openphoneSettings);
    } else {
      // Fallback: fetch data separately (original approach)
      paymentRequest = await InvoiceRepository.getInvoicePaymentRequestById(requestId);

      if (!paymentRequest || paymentRequest.invoice_id !== invoiceId || paymentRequest.deal_id !== dealId) {
        throw new NotFoundError('Payment request not found');
      }

      const companyEmailSettings = await getCompanyEmailSettings(paymentRequest.company_id);
      effectiveEmailSettings = extractEmailSettings(companyEmailSettings);
      try {
        phoneSettings = await CompanyRepository.getCompanyOpenPhoneSettings(paymentRequest.company_id);
      } catch (error) {
        phoneSettings = null;
      }
    }

    let sentEmail = false;
    let sentText = false;

    const fromEmail =
      effectiveEmailSettings?.provider_account_email ||
      effectiveEmailSettings?.reply_email ||
      process.env.POSTMARK_FROM_EMAIL ||
      null;

    const replyToEmail = effectiveEmailSettings?.reply_email ?? null;
    const bccEmail = effectiveEmailSettings?.bcc_email ?? null;

    if (shouldSendEmail) {
      if (!email || typeof email !== 'object' || !email.to || !email.subject || !email.body) {
        throw new ValidationError('Email recipient, subject, and body are required.');
      }

      if (!isPostmarkConfigured) {
        throw new InternalError('Email sending is not configured yet.');
      }

      if (!fromEmail) {
        throw new InternalError('Provide a From email in company email settings or POSTMARK_FROM_EMAIL.');
      }

      await sendProposalEmail({
        fromEmail,
        to: email.to,
        cc: email.cc,
        bcc: bccEmail,
        replyTo: replyToEmail,
        subject: email.subject,
        body: email.body,
      });
      sentEmail = true;
    }

    if (shouldSendText && text) {
      const recipient = typeof text.to === 'string' ? text.to.trim() : '';
      const messageBody = typeof text.body === 'string' ? text.body.trim() : '';

      if (!recipient || !messageBody) {
        throw new ValidationError('SMS delivery requires recipient and message body.');
      }

      const formattedRecipient = formatSmsRecipient(recipient);
      if (!formattedRecipient) {
        throw new ValidationError('Provide a valid SMS recipient.');
      }

      // phoneSettings already fetched from RPC above
      if (!phoneSettings?.openphone_enabled || !phoneSettings?.openphone_api_key) {
        throw new ValidationError('OpenPhone is not configured for this company.');
      }

      const fromValue =
        phoneSettings.openphone_phone_number_id?.trim() || phoneSettings.openphone_phone_number?.trim() || '';

      if (!fromValue) {
        throw new ValidationError('OpenPhone phone number is not configured.');
      }

      await sendOpenPhoneMessage({
        apiKey: phoneSettings.openphone_api_key,
        from: fromValue,
        to: formattedRecipient,
        content: messageBody,
      });
      sentText = true;
    }

    let updatedStatus: InvoicePaymentRequest['status'] = paymentRequest.status;
    if ((sentEmail || sentText) && paymentRequest.status === 'created') {
      // Use atomic RPC to update payment request status
      const updateResult = await RpcRepository.updatePaymentRequestAfterSend({
        requestId,
        sentViaEmail: sentEmail,
        sentViaText: sentText,
      });
      updatedStatus = updateResult.status as InvoicePaymentRequest['status'];
    }

    res.json({
      sentEmail,
      sentText,
      paymentRequest: {
        ...paymentRequest,
        status: updatedStatus,
      },
    });
  })
);

// POST /:dealId/invoices/:invoiceId/payments - Record invoice payment
router.post(
  '/:dealId/invoices/:invoiceId/payments',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId } = req.params;
    const {
      amount,
      receivedAt,
      method,
      reference,
      note,
      sendReceipt,
      receiptEmail,
      receiptSubject,
      receiptBody,
      paymentRequestId,
    } = req.body ?? {};

    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError();
    }

    if (!dealId || !invoiceId) {
      throw new ValidationError('dealId and invoiceId are required');
    }

    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new ValidationError('Valid payment amount is required');
    }

    if (!receivedAt || Number.isNaN(Date.parse(receivedAt))) {
      throw new ValidationError('Valid received date is required');
    }

    // Use service to record payment and update invoice
    const result = await recordPaymentAndUpdateInvoice({
      invoiceId,
      dealId,
      companyId: '', // Will be fetched by service
      userId,
      paymentAmount,
      receivedAt,
      method,
      reference,
      note,
      paymentRequestId: typeof paymentRequestId === 'string' ? paymentRequestId : undefined,
    });

    const { payment, updatedInvoice, payments, paymentRequestMarkedPaid, paymentRequestRecord, calculation } = result;

    const invoice = {
      company_id: updatedInvoice.company_id,
      invoice_number: updatedInvoice.invoice_number,
      total_amount: updatedInvoice.total_amount,
    };
    const invoiceMarkedPaid = calculation.invoiceMarkedPaid;
    const newBalance = calculation.newBalance;

    const paymentRequests = await InvoiceRepository.getInvoicePaymentRequests(invoiceId);

    const notificationPromises: Promise<void>[] = [];

    if (paymentRequestMarkedPaid && invoice.company_id) {
      const amountLabel = formatCurrency(Number(paymentRequestRecord?.amount ?? paymentAmount));
      notificationPromises.push(
        sendOwnerNotification({
          companyId: invoice.company_id,
          subject: paymentRequestRecord?.id
            ? `Payment request paid: ${paymentRequestRecord.id}`
            : 'Payment request paid',
          body: [
            'Congrats! A payment request was marked as paid.',
            paymentRequestRecord?.id ? `Payment request: ${paymentRequestRecord.id}` : null,
            `Invoice: ${updatedInvoice?.invoice_number ?? invoiceId}`,
            `Amount: ${amountLabel}`,
          ]
            .filter(Boolean)
            .join('\n'),
        })
      );
    }

    if (invoice.company_id && invoiceMarkedPaid) {
      const totalLabel = formatCurrency(Number(updatedInvoice?.total_amount ?? invoice.total_amount ?? 0));
      const balanceLabel = formatCurrency(Number(updatedInvoice?.balance_due ?? newBalance));
      notificationPromises.push(
        sendOwnerNotification({
          companyId: invoice.company_id,
          subject: `Invoice paid: ${updatedInvoice?.invoice_number ?? invoiceId}`,
          body: [
            'Congrats! An invoice was marked as paid.',
            `Invoice: ${updatedInvoice?.invoice_number ?? invoiceId}`,
            updatedInvoice?.title ? `Title: ${updatedInvoice.title}` : null,
            `Total amount: ${totalLabel}`,
            `Balance due: ${balanceLabel}`,
          ]
            .filter(Boolean)
            .join('\n'),
        })
      );
    }

    if (notificationPromises.length > 0) {
      await Promise.all(notificationPromises);
    }

    if (sendReceipt && receiptEmail && receiptSubject && receiptBody) {
      const effectiveEmailSettings = await getCompanyEmailSettings(invoice.company_id);

      const fromEmail =
        effectiveEmailSettings?.provider_account_email ||
        effectiveEmailSettings?.reply_email ||
        process.env.POSTMARK_FROM_EMAIL ||
        null;

      if (!isPostmarkConfigured || !fromEmail) {
        console.warn('Payment receipt email not configured; skipping send.');
      } else {
        try {
          await sendProposalEmail({
            fromEmail,
            to: receiptEmail,
            subject: receiptSubject,
            body: receiptBody,
          });

          const receiptSentAt = new Date().toISOString();

          try {
            await InvoiceRepository.updateInvoicePayment(payment.id, {
              receipt_sent_at: receiptSentAt,
            });
          } catch (error) {
            console.error('Failed to record receipt sent timestamp', error);
          }
        } catch (error) {
          console.error('Failed to send payment receipt', error);
        }
      }
    }

    res.json({
      invoice: sanitizeInvoice(updatedInvoice),
      payments: sanitizePayments(payments),
      paymentRequests: sanitizePaymentRequests(paymentRequests ?? []),
    });
  })
);

// POST /:dealId/invoices/:invoiceId/payments/:paymentId/send - Send payment receipt
router.post(
  '/:dealId/invoices/:invoiceId/payments/:paymentId/send',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId, paymentId } = req.params;
    const { receiptEmail, receiptSubject, receiptBody } = req.body ?? {};

    if (!dealId || !invoiceId || !paymentId) {
      throw new ValidationError('dealId, invoiceId, and paymentId are required');
    }

    if (!receiptEmail || !receiptSubject || !receiptBody) {
      throw new ValidationError('Receipt email, subject, and body are required.');
    }

    const payment = await InvoiceRepository.getInvoicePaymentById(paymentId);

    if (!payment || payment.invoice_id !== invoiceId || payment.deal_id !== dealId) {
      throw new NotFoundError('Payment not found');
    }

    const effectiveEmailSettings = await getCompanyEmailSettings(payment.company_id);

    const fromEmail =
      effectiveEmailSettings?.provider_account_email ||
      effectiveEmailSettings?.reply_email ||
      process.env.POSTMARK_FROM_EMAIL ||
      null;

    if (!isPostmarkConfigured) {
      throw new InternalError('Email sending is not configured yet.');
    }

    if (!fromEmail) {
      throw new InternalError('Provide a From email in company email settings or POSTMARK_FROM_EMAIL.');
    }

    await sendProposalEmail({
      fromEmail,
      to: receiptEmail,
      subject: receiptSubject,
      body: receiptBody,
    });

    const sentAt = new Date().toISOString();
    await InvoiceRepository.updateInvoicePayment(paymentId, {
      receipt_sent_at: sentAt,
    });

    res.json({ sent: true });
  })
);

// POST /:dealId/invoices/:invoiceId/payment-requests/:requestId/cancel - Cancel payment request
router.post(
  '/:dealId/invoices/:invoiceId/payment-requests/:requestId/cancel',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId, requestId } = req.params;

    if (!dealId || !invoiceId || !requestId) {
      throw new ValidationError('dealId, invoiceId, and requestId are required');
    }

    // Validate payment request exists and belongs to the invoice/deal
    const paymentRequest = await InvoiceRepository.getInvoicePaymentRequestById(requestId);

    if (!paymentRequest || paymentRequest.invoice_id !== invoiceId || paymentRequest.deal_id !== dealId) {
      throw new NotFoundError('Payment request not found');
    }

    if (paymentRequest.status === 'paid') {
      throw new ValidationError('Cannot cancel a paid payment request');
    }

    await InvoiceRepository.deleteInvoicePaymentRequest(requestId);

    res.json({ deletedRequestId: requestId });
  })
);

// ============================================================================
// LINE ITEM CRUD OPERATIONS
// ============================================================================

// POST /:dealId/invoices/:invoiceId/line-items - Add a line item to an invoice
router.post(
  '/:dealId/invoices/:invoiceId/line-items',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId } = req.params;
    const { name, description, quantity, unit_price } = req.body;

    if (!dealId || !invoiceId) {
      throw new ValidationError('dealId and invoiceId are required');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Item name is required');
    }

    const parsedQuantity = Number(quantity);
    const parsedUnitPrice = Number(unit_price);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      throw new ValidationError('Quantity must be a positive number');
    }

    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
      throw new ValidationError('Unit price must be a non-negative number');
    }

    // Validate invoice exists and belongs to the deal
    const invoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);

    if (!invoice || invoice.deal_id !== dealId) {
      throw new NotFoundError('Invoice not found for this deal');
    }

    const result = await addLineItemToInvoice({
      invoiceId,
      name: name.trim(),
      description: description?.trim() || null,
      quantity: parsedQuantity,
      unit_price: parsedUnitPrice,
    });

    res.json({
      lineItem: result.lineItem,
      invoice: sanitizeInvoice(result.invoice),
    });
  })
);

// PATCH /:dealId/invoices/:invoiceId/line-items/:itemId - Update a line item
router.patch(
  '/:dealId/invoices/:invoiceId/line-items/:itemId',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId, itemId } = req.params;
    const { name, description, quantity, unit_price } = req.body;

    if (!dealId || !invoiceId || !itemId) {
      throw new ValidationError('dealId, invoiceId, and itemId are required');
    }

    // Validate invoice exists and belongs to the deal
    const invoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);

    if (!invoice || invoice.deal_id !== dealId) {
      throw new NotFoundError('Invoice not found for this deal');
    }

    // Validate line item exists and belongs to the invoice
    const lineItems = await InvoiceRepository.getInvoiceLineItems(invoiceId);
    const existingItem = lineItems.find(item => item.id === itemId);

    if (!existingItem) {
      throw new NotFoundError('Line item not found');
    }

    // Build updates object
    const updates: { name?: string; description?: string | null; quantity?: number; unit_price?: number } = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Item name cannot be empty');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (quantity !== undefined) {
      const parsedQuantity = Number(quantity);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        throw new ValidationError('Quantity must be a positive number');
      }
      updates.quantity = parsedQuantity;
    }

    if (unit_price !== undefined) {
      const parsedUnitPrice = Number(unit_price);
      if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
        throw new ValidationError('Unit price must be a non-negative number');
      }
      updates.unit_price = parsedUnitPrice;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('At least one field to update is required');
    }

    const result = await updateLineItemAndRecalculate({
      itemId,
      invoiceId,
      updates,
    });

    res.json({
      lineItem: result.lineItem,
      invoice: sanitizeInvoice(result.invoice),
    });
  })
);

// DELETE /:dealId/invoices/:invoiceId/line-items/:itemId - Delete a line item
router.delete(
  '/:dealId/invoices/:invoiceId/line-items/:itemId',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, invoiceId, itemId } = req.params;

    if (!dealId || !invoiceId || !itemId) {
      throw new ValidationError('dealId, invoiceId, and itemId are required');
    }

    // Validate invoice exists and belongs to the deal
    const invoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);

    if (!invoice || invoice.deal_id !== dealId) {
      throw new NotFoundError('Invoice not found for this deal');
    }

    // Validate line item exists and belongs to the invoice
    const lineItems = await InvoiceRepository.getInvoiceLineItems(invoiceId);
    const existingItem = lineItems.find(item => item.id === itemId);

    if (!existingItem) {
      throw new NotFoundError('Line item not found');
    }

    const result = await deleteLineItemAndRecalculate({
      itemId,
      invoiceId,
    });

    // Fetch updated line items
    const updatedLineItems = await InvoiceRepository.getInvoiceLineItems(invoiceId);

    res.json({
      deletedItemId: itemId,
      invoice: sanitizeInvoice(result.invoice),
      lineItems: updatedLineItems,
    });
  })
);

export default router;
