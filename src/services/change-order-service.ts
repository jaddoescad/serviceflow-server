import { sendOwnerNotification } from './notification-service';
import { formatCurrency } from '../utils/formatting';
import * as ChangeOrderRepository from '../repositories/change-order-repository';
import * as RpcRepository from '../repositories/rpc-repository';

/**
 * Type definitions for change order service
 */
export type ChangeOrderAcceptanceResult = {
  updatedChangeOrder: any;
  invoiceUpdated: boolean;
  delta: number;
};

export type ChangeOrderItemInput = {
  name?: string;
  description?: string | null;
  quantity?: number;
  qty?: number;
  unit_price?: number;
  unitPrice?: number;
  position?: number;
};

export type CreateOrUpdateChangeOrderParams = {
  company_id: string;
  quote_id: string;
  invoice_id?: string | null;
  change_order_number: string;
  items: ChangeOrderItemInput[];
};

/**
 * Create or update a change order with items
 * Uses transactional RPC to ensure atomicity:
 * - Validates quote exists and belongs to company
 * - Creates or updates change order
 * - Manages line items (delete old, insert new)
 * All operations are rolled back if any step fails.
 */
export async function createOrUpdateChangeOrder(params: CreateOrUpdateChangeOrderParams): Promise<any> {
  const { company_id, quote_id, invoice_id, change_order_number, items } = params;

  // Use transactional RPC - validates quote, creates/updates change order, and manages items atomically
  const result = await RpcRepository.createOrUpdateChangeOrderWithItems({
    companyId: company_id,
    quoteId: quote_id,
    changeOrderNumber: change_order_number,
    items: items || [],
    invoiceId: invoice_id,
  });

  // Return the change order with items in the expected format
  return {
    ...result.change_order,
    items: result.items,
  };
}

/**
 * Accept a change order
 * Uses transactional RPC to ensure atomicity:
 * - Adding change order items to invoice
 * - Updating invoice totals and status
 * - Updating change order status and signature
 * All operations are rolled back if any step fails.
 */
export async function acceptChangeOrder(params: {
  changeOrderId: string;
  invoiceId: string;
  signerName?: string;
  signerEmail?: string;
  signatureText?: string;
}): Promise<ChangeOrderAcceptanceResult> {
  const { changeOrderId, invoiceId, signerName, signerEmail, signatureText } = params;

  // Use transactional RPC - all operations are atomic
  const result = await RpcRepository.acceptChangeOrderWithInvoice({
    changeOrderId,
    invoiceId,
    signerName,
    signerEmail,
    signatureText,
  });

  // Fetch the updated change order to return in expected format
  const updatedChangeOrder = await ChangeOrderRepository.getChangeOrderById(changeOrderId);

  return {
    updatedChangeOrder,
    invoiceUpdated: true,
    delta: result.delta,
  };
}

/**
 * Send owner notification for change order acceptance
 */
export async function notifyChangeOrderAcceptance(params: {
  companyId: string;
  changeOrderNumber: string | null;
  changeOrderId: string;
  invoiceId: string | null;
  delta: number;
}): Promise<void> {
  const { companyId, changeOrderNumber, changeOrderId, invoiceId, delta } = params;

  const changeOrderLabel = changeOrderNumber || changeOrderId;
  const subject = changeOrderLabel ? `Change order accepted: ${changeOrderLabel}` : 'Change order accepted';
  const body = [
    'Congrats! A change order was accepted.',
    changeOrderLabel ? `Change order: ${changeOrderLabel}` : null,
    invoiceId ? `Invoice: ${invoiceId}` : null,
    `Additional amount: ${formatCurrency(delta)}`,
  ]
    .filter(Boolean)
    .join('\n');

  await sendOwnerNotification({
    companyId,
    subject,
    body,
  });
}
