import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import type {
  Invoice as ApiInvoice,
  InvoiceLineItem as ApiInvoiceLineItem,
  InvoiceWithLineItems as ApiInvoiceWithLineItems,
  InvoicePayment as ApiInvoicePayment,
  InvoicePaymentRequest as ApiInvoicePaymentRequest,
  InvoiceWithRelations,
} from '../types/api';

// Re-export types from the API types file
export type Invoice = ApiInvoice;
export type InvoiceLineItem = ApiInvoiceLineItem;
export type InvoiceWithLineItems = ApiInvoiceWithLineItems;
export type InvoicePayment = ApiInvoicePayment;
export type InvoicePaymentRequest = ApiInvoicePaymentRequest;

/**
 * Invoice Repository
 * Handles all database operations for invoices
 */

/**
 * Get invoices with optional filtering
 */
export async function getInvoices(filters?: {
  company_id?: string;
  deal_id?: string;
  quote_id?: string;
}): Promise<InvoiceWithLineItems[]> {
  let query = supabase.from('invoices').select('*, line_items:invoice_line_items(*)');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }
  if (filters?.deal_id) {
    query = query.eq('deal_id', filters.deal_id);
  }
  if (filters?.quote_id) {
    query = query.eq('quote_id', filters.quote_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch invoices', error);
  }

  return data ?? [];
}

/**
 * Get a single invoice by ID with line items
 */
export async function getInvoiceById(invoiceId: string): Promise<InvoiceWithLineItems | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, line_items:invoice_line_items(*)')
    .eq('id', invoiceId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch invoice', error);
  }

  return data;
}

/**
 * Get invoice by public share ID with full nested data
 */
export async function getInvoiceByShareId(shareId: string): Promise<InvoiceWithRelations | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items(*),
      company:companies(*),
      deal:deals(
        *,
        contact:contacts(*),
        service_address:contact_addresses(*)
      )
    `)
    .eq('public_share_id', shareId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch invoice by share ID', error);
  }

  return data;
}

/**
 * Get invoice by ID (without line items)
 */
export async function getInvoiceByIdSimple(invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch invoice', error);
  }

  return data;
}

/**
 * Create a new invoice
 */
export async function createInvoice(invoiceData: Partial<Invoice>): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .insert([invoiceData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create invoice', error);
  }

  return data;
}

/**
 * Update an invoice
 */
export async function updateInvoice(invoiceId: string, updates: Partial<Invoice>): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update invoice', error);
  }

  return data;
}

/**
 * Delete an invoice
 */
export async function deleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId);

  if (error) {
    throw new DatabaseError('Failed to delete invoice', error);
  }
}

/**
 * Get invoice line items
 */
export async function getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (error) {
    throw new DatabaseError('Failed to fetch invoice line items', error);
  }

  return data ?? [];
}

/**
 * Create invoice line items
 */
export async function createInvoiceLineItems(items: Partial<InvoiceLineItem>[]): Promise<InvoiceLineItem[]> {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .insert(items)
    .select();

  if (error) {
    throw new DatabaseError('Failed to create invoice line items', error);
  }

  return data ?? [];
}

/**
 * Delete invoice line items
 */
export async function deleteInvoiceLineItems(itemIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .in('id', itemIds);

  if (error) {
    throw new DatabaseError('Failed to delete invoice line items', error);
  }
}

/**
 * Delete a single invoice line item
 */
export async function deleteInvoiceLineItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    throw new DatabaseError('Failed to delete invoice line item', error);
  }
}

/**
 * Update an invoice line item
 */
export async function updateInvoiceLineItem(
  itemId: string,
  updates: Partial<Pick<InvoiceLineItem, 'name' | 'description' | 'quantity' | 'unit_price' | 'position'>>
): Promise<InvoiceLineItem> {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update invoice line item', error);
  }

  return data;
}

/**
 * Get the maximum position for line items in an invoice
 */
export async function getMaxLineItemPosition(invoiceId: string): Promise<number> {
  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('position')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to get max line item position', error);
  }

  return data?.position ?? 0;
}

/**
 * Get invoice payments
 */
export async function getInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('received_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Failed to fetch invoice payments', error);
  }

  return data ?? [];
}

/**
 * Create an invoice payment
 */
export async function createInvoicePayment(paymentData: Partial<InvoicePayment>): Promise<InvoicePayment> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('invoice_payments')
    .insert([{
      ...paymentData,
      updated_at: now,
    }])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create invoice payment', error);
  }

  return data;
}

/**
 * Get invoice by quote ID (most recent)
 */
export async function getInvoiceByQuoteId(quoteId: string): Promise<Pick<Invoice, 'id' | 'quote_id'> | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, quote_id')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch invoice by quote ID', error);
  }

  return data;
}

/**
 * Get invoice payment requests
 */
export async function getInvoicePaymentRequests(invoiceId: string): Promise<InvoicePaymentRequest[]> {
  const { data, error } = await supabase
    .from('invoice_payment_requests')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Failed to fetch invoice payment requests', error);
  }

  return data ?? [];
}

/**
 * Get a single invoice payment request by ID
 */
export async function getInvoicePaymentRequestById(requestId: string): Promise<InvoicePaymentRequest | null> {
  const { data, error } = await supabase
    .from('invoice_payment_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch invoice payment request', error);
  }

  return data;
}

/**
 * Get open payment requests for an invoice
 */
export async function getOpenPaymentRequests(invoiceId: string, dealId: string): Promise<Pick<InvoicePaymentRequest, 'id' | 'status'>[]> {
  const { data, error } = await supabase
    .from('invoice_payment_requests')
    .select('id, status')
    .eq('invoice_id', invoiceId)
    .eq('deal_id', dealId)
    .in('status', ['created', 'sent'])
    .limit(1);

  if (error) {
    throw new DatabaseError('Failed to fetch open payment requests', error);
  }

  return data ?? [];
}

/**
 * Create an invoice payment request
 */
export async function createInvoicePaymentRequest(requestData: Partial<InvoicePaymentRequest>): Promise<InvoicePaymentRequest> {
  const { data, error } = await supabase
    .from('invoice_payment_requests')
    .insert([requestData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create invoice payment request', error);
  }

  return data;
}

/**
 * Update an invoice payment request
 */
export async function updateInvoicePaymentRequest(requestId: string, updates: Partial<InvoicePaymentRequest>): Promise<InvoicePaymentRequest> {
  const { data, error } = await supabase
    .from('invoice_payment_requests')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update invoice payment request', error);
  }

  return data;
}

/**
 * Delete an invoice payment request
 */
export async function deleteInvoicePaymentRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('invoice_payment_requests')
    .delete()
    .eq('id', requestId);

  if (error) {
    throw new DatabaseError('Failed to delete invoice payment request', error);
  }
}

/**
 * Update an invoice payment
 */
export async function updateInvoicePayment(paymentId: string, updates: Partial<InvoicePayment>): Promise<InvoicePayment> {
  const { data, error } = await supabase
    .from('invoice_payments')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update invoice payment', error);
  }

  return data;
}

/**
 * Get a single invoice payment by ID
 */
export async function getInvoicePaymentById(paymentId: string): Promise<InvoicePayment | null> {
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch invoice payment', error);
  }

  return data;
}

/**
 * Get invoices for summary (minimal fields needed for kanban display)
 */
export async function getInvoicesForSummary(companyId: string): Promise<Array<{
  id: string;
  deal_id: string;
  status: string;
  total_amount: number;
  balance_due: number;
  updated_at: string;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, deal_id, status, total_amount, balance_due, updated_at, created_at')
    .eq('company_id', companyId);

  if (error) {
    throw new DatabaseError('Failed to fetch invoices for summary', error);
  }

  return data ?? [];
}
