import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import * as ChangeOrderRepository from '../repositories/change-order-repository';
import * as ChangeOrderService from '../services/change-order-service';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const router = Router();

const normalizeChangeOrder = (record: any) => {
  if (!record) return record;
  return {
    ...record,
    items: record.items ?? [],
  };
};

// List change orders for a deal - requires access to the deal's company
router.get(
  '/',
  requireResourceAccess({ resourceType: 'deal', resourceIdSource: 'query', resourceIdField: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId } = req.query;

    if (!dealId || typeof dealId !== 'string') {
      throw new ValidationError('dealId is required');
    }

    const data = await ChangeOrderRepository.getChangeOrders({ deal_id: dealId });
    res.json((data ?? []).map(normalizeChangeOrder));
  })
);

// Create or update a change order with items - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { items, ...payload } = req.body ?? {};

    if (!payload.company_id || !payload.quote_id || !payload.change_order_number) {
      throw new ValidationError('company_id, quote_id, and change_order_number are required');
    }

    const changeOrder = await ChangeOrderService.createOrUpdateChangeOrder({
      company_id: payload.company_id,
      quote_id: payload.quote_id,
      invoice_id: payload.invoice_id ?? null,
      change_order_number: payload.change_order_number,
      items: items ?? [],
    });

    res.json(normalizeChangeOrder(changeOrder));
  })
);

// Accept a change order (captures signature + adds to invoice) - requires access to change order's company
router.patch(
  '/:id/accept',
  requireResourceAccess({ resourceType: 'change_order' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { signer_name, signer_email, signature_text, signature_type, invoice_id } = req.body ?? {};

    // Fetch change order to get company_id and validate invoice_id
    const changeOrder = await ChangeOrderRepository.getChangeOrderById(id);

    if (!changeOrder) {
      throw new NotFoundError('Change order not found');
    }

    const targetInvoiceId = invoice_id ?? changeOrder.invoice_id;

    if (!targetInvoiceId) {
      throw new ValidationError('invoice_id is required to accept a change order');
    }

    // Accept change order and update invoice
    const { updatedChangeOrder, delta } = await ChangeOrderService.acceptChangeOrder({
      changeOrderId: id,
      invoiceId: targetInvoiceId,
      signerName: signer_name,
      signerEmail: signer_email,
      signatureText: signature_text,
      signatureType: signature_type,
    });

    // Send owner notification
    if (changeOrder.company_id) {
      await ChangeOrderService.notifyChangeOrderAcceptance({
        companyId: changeOrder.company_id,
        changeOrderNumber: changeOrder.change_order_number,
        changeOrderId: id,
        invoiceId: targetInvoiceId,
        delta,
      });
    }

    res.json(normalizeChangeOrder(updatedChangeOrder));
  })
);

// Delete a pending change order - requires access to change order's company
router.delete(
  '/:id',
  requireResourceAccess({ resourceType: 'change_order' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const changeOrder = await ChangeOrderRepository.getChangeOrderById(id);

    if (!changeOrder) {
      throw new NotFoundError('Change order not found');
    }

    if (changeOrder.status === 'accepted') {
      throw new ValidationError('Cannot delete an accepted change order');
    }

    // Delete items first, then the change order
    await ChangeOrderRepository.deleteChangeOrderItems(id);
    await ChangeOrderRepository.deleteChangeOrder(id);

    res.json({ success: true, message: 'Change order deleted' });
  })
);

// Placeholder send endpoint (hook up to delivery service as needed) - requires access to change order's company
router.post(
  '/:id/send',
  requireResourceAccess({ resourceType: 'change_order' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { to, subject, body } = req.body ?? {};

    if (!to || typeof to !== 'string') {
      throw new ValidationError('Recipient email is required');
    }

    // TODO: integrate with email delivery (Postmark/Twilio)
    res.json({
      status: 'queued',
      changeOrderId: id,
      to,
      subject,
      body,
    });
  })
);

export default router;
