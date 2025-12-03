import * as InvoiceRepository from '../repositories/invoice-repository';
import * as RpcRepository from '../repositories/rpc-repository';
import type {
  Invoice as ApiInvoice,
  InvoicePayment as ApiInvoicePayment,
  InvoicePaymentRequest,
  InvoiceLineItem,
} from '../types/api';

// Re-export types for backwards compatibility
export type InvoicePayment = ApiInvoicePayment;
export type Invoice = ApiInvoice;

export type PaymentCalculationResult = {
  totalPaid: number;
  newBalance: number;
  updatedStatus: 'paid' | 'partial' | 'overdue' | 'unpaid';
  invoiceMarkedPaid: boolean;
};

/**
 * Calculate the total paid amount from a list of payments
 */
export function calculateTotalPaid(payments: InvoicePayment[]): number {
  return payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
}

/**
 * Calculate new invoice balance after payments
 */
export function calculateInvoiceBalance(
  invoiceTotal: number,
  payments: InvoicePayment[]
): PaymentCalculationResult {
  const totalPaid = calculateTotalPaid(payments);
  const newBalance = Math.max(0, invoiceTotal - totalPaid);

  return {
    totalPaid,
    newBalance,
    updatedStatus: 'unpaid', // Will be determined by determineInvoiceStatus
    invoiceMarkedPaid: false,
  };
}

/**
 * Determine invoice status based on balance and current status
 */
export function determineInvoiceStatus(
  newBalance: number,
  invoiceTotal: number,
  currentStatus: string
): 'paid' | 'partial' | 'overdue' | 'unpaid' {
  if (newBalance <= 0) {
    return 'paid';
  }

  if (newBalance < invoiceTotal) {
    // Partial payment - preserve overdue status if it exists
    return currentStatus === 'overdue' ? 'overdue' : 'partial';
  }

  // No payment or full balance remaining - preserve overdue status
  return currentStatus === 'overdue' ? 'overdue' : 'unpaid';
}

/**
 * Record a payment and update invoice balance/status
 * Uses transactional RPC to ensure atomicity:
 * - Creates payment record
 * - Updates payment request status (if provided)
 * - Calculates new balance
 * - Updates invoice status
 * All operations are rolled back if any step fails.
 */
export async function recordPaymentAndUpdateInvoice(params: {
  invoiceId: string;
  dealId: string;
  companyId: string;
  userId: string;
  paymentAmount: number;
  receivedAt: string;
  method?: string;
  reference?: string;
  note?: string;
  paymentRequestId?: string;
}): Promise<{
  payment: InvoicePayment;
  updatedInvoice: Invoice;
  payments: InvoicePayment[];
  paymentRequestMarkedPaid: boolean;
  paymentRequestRecord: InvoicePaymentRequest | null;
  calculation: PaymentCalculationResult;
}> {
  const {
    invoiceId,
    dealId,
    companyId,
    userId,
    paymentAmount,
    receivedAt,
    method,
    reference,
    note,
    paymentRequestId,
  } = params;

  // Fetch payment request record if provided (for return value)
  let paymentRequestRecord: InvoicePaymentRequest | null = null;
  if (paymentRequestId) {
    paymentRequestRecord = await InvoiceRepository.getInvoicePaymentRequestById(paymentRequestId);
  }

  // Use transactional RPC - all operations are atomic
  const result = await RpcRepository.recordPaymentWithInvoiceUpdate({
    invoiceId,
    dealId,
    companyId,
    userId,
    amount: paymentAmount,
    receivedAt: new Date(receivedAt).toISOString(),
    method,
    reference,
    note,
    paymentRequestId,
  });

  // Fetch updated data for return values
  const updatedInvoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);
  const payments = await InvoiceRepository.getInvoicePayments(invoiceId);
  const payment = payments?.find((p) => p.id === result.paymentId) ?? {
    id: result.paymentId,
    amount: result.amount,
  };

  const calculation: PaymentCalculationResult = {
    totalPaid: result.totalPaid,
    newBalance: result.newBalance,
    updatedStatus: result.newStatus as 'paid' | 'partial' | 'overdue' | 'unpaid',
    invoiceMarkedPaid: result.invoiceMarkedPaid,
  };

  return {
    payment: payment as InvoicePayment,
    updatedInvoice: updatedInvoice as Invoice,
    payments: payments ?? [],
    paymentRequestMarkedPaid: result.paymentRequestMarkedPaid,
    paymentRequestRecord,
    calculation,
  };
}

/**
 * Sanitize invoice for API response
 */
export function sanitizeInvoice<T extends { total_amount?: number; balance_due?: number }>(
  invoice: T | null
): (T & { total_amount: number; balance_due: number }) | null {
  if (!invoice) return null;
  return {
    ...invoice,
    total_amount: Number(invoice.total_amount ?? 0),
    balance_due: Number(invoice.balance_due ?? 0),
  };
}

/**
 * Sanitize payments for API response
 */
export function sanitizePayments<T extends { amount?: number }>(
  payments: T[]
): (T & { amount: number })[] {
  return payments.map((p) => ({
    ...p,
    amount: Number(p.amount ?? 0),
  }));
}

/**
 * Sanitize payment requests for API response
 */
export function sanitizePaymentRequests<T extends { amount?: number }>(
  paymentRequests: T[]
): (T & { amount: number })[] {
  return paymentRequests.map((pr) => ({
    ...pr,
    amount: Number(pr.amount ?? 0),
  }));
}

/**
 * Calculate total amount from line items
 */
export function calculateLineItemsTotal(lineItems: InvoiceLineItem[]): number {
  return lineItems.reduce((sum, item) => {
    return sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0);
  }, 0);
}

/**
 * Recalculate and update invoice totals based on line items
 */
export async function recalculateInvoiceTotals(invoiceId: string): Promise<Invoice> {
  // Fetch current line items and payments
  const lineItems = await InvoiceRepository.getInvoiceLineItems(invoiceId);
  const payments = await InvoiceRepository.getInvoicePayments(invoiceId);
  const currentInvoice = await InvoiceRepository.getInvoiceByIdSimple(invoiceId);

  if (!currentInvoice) {
    throw new Error('Invoice not found');
  }

  // Calculate new total
  const newTotal = calculateLineItemsTotal(lineItems);
  const totalPaid = calculateTotalPaid(payments);
  const newBalance = Math.max(0, newTotal - totalPaid);
  const newStatus = determineInvoiceStatus(newBalance, newTotal, currentInvoice.status);

  // Update invoice
  const updatedInvoice = await InvoiceRepository.updateInvoice(invoiceId, {
    total_amount: newTotal,
    balance_due: newBalance,
    status: newStatus,
  });

  return updatedInvoice;
}

/**
 * Add a line item to an existing invoice
 */
export async function addLineItemToInvoice(params: {
  invoiceId: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
}): Promise<{ lineItem: InvoiceLineItem; invoice: Invoice }> {
  const { invoiceId, name, description, quantity, unit_price } = params;

  // Get the next position
  const maxPosition = await InvoiceRepository.getMaxLineItemPosition(invoiceId);
  const newPosition = maxPosition + 1;

  // Create the line item
  const [lineItem] = await InvoiceRepository.createInvoiceLineItems([{
    invoice_id: invoiceId,
    name,
    description,
    quantity,
    unit_price,
    position: newPosition,
  }]);

  // Recalculate invoice totals
  const invoice = await recalculateInvoiceTotals(invoiceId);

  return { lineItem, invoice };
}

/**
 * Update a line item and recalculate invoice totals
 */
export async function updateLineItemAndRecalculate(params: {
  itemId: string;
  invoiceId: string;
  updates: Partial<Pick<InvoiceLineItem, 'name' | 'description' | 'quantity' | 'unit_price'>>;
}): Promise<{ lineItem: InvoiceLineItem; invoice: Invoice }> {
  const { itemId, invoiceId, updates } = params;

  // Update the line item
  const lineItem = await InvoiceRepository.updateInvoiceLineItem(itemId, updates);

  // Recalculate invoice totals
  const invoice = await recalculateInvoiceTotals(invoiceId);

  return { lineItem, invoice };
}

/**
 * Delete a line item and recalculate invoice totals
 */
export async function deleteLineItemAndRecalculate(params: {
  itemId: string;
  invoiceId: string;
}): Promise<{ invoice: Invoice }> {
  const { itemId, invoiceId } = params;

  // Delete the line item
  await InvoiceRepository.deleteInvoiceLineItem(itemId);

  // Recalculate invoice totals
  const invoice = await recalculateInvoiceTotals(invoiceId);

  return { invoice };
}
