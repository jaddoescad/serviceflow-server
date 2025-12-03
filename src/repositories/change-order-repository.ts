import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import type {
  ChangeOrder as ApiChangeOrder,
  ChangeOrderWithItems as ApiChangeOrderWithItems,
} from '../types/api';

// Re-export types for backwards compatibility
export type ChangeOrder = ApiChangeOrder;
export type ChangeOrderWithItems = ApiChangeOrderWithItems;

/**
 * Change Order Repository
 * Handles all database operations for change orders
 */

/**
 * Get change orders with optional filtering
 */
export async function getChangeOrders(filters?: {
  deal_id?: string;
  quote_id?: string;
  invoice_id?: string;
}): Promise<ChangeOrderWithItems[]> {
  let query = supabase
    .from('change_orders')
    .select('*, items:quote_line_items(*)')
    .order('created_at', { ascending: true })
    .order('position', { ascending: true, foreignTable: 'items' });

  if (filters?.deal_id) {
    query = query.eq('deal_id', filters.deal_id);
  }
  if (filters?.quote_id) {
    query = query.eq('quote_id', filters.quote_id);
  }
  if (filters?.invoice_id) {
    query = query.eq('invoice_id', filters.invoice_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch change orders', error);
  }

  return data ?? [];
}

/**
 * Get a single change order by ID with items
 */
export async function getChangeOrderById(changeOrderId: string): Promise<ChangeOrderWithItems | null> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('*, items:quote_line_items(*)')
    .eq('id', changeOrderId)
    .order('position', { ascending: true, foreignTable: 'items' })
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch change order', error);
  }

  return data;
}

/**
 * Get change order by company and number
 */
export async function getChangeOrderByNumber(
  companyId: string,
  changeOrderNumber: string
): Promise<Pick<ChangeOrder, 'id'> | null> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('id')
    .eq('company_id', companyId)
    .eq('change_order_number', changeOrderNumber)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch change order by number', error);
  }

  return data;
}

/**
 * Create a new change order
 */
export async function createChangeOrder(changeOrderData: Partial<ChangeOrder>): Promise<ChangeOrder> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('change_orders')
    .insert([{
      ...changeOrderData,
      created_at: nowIso,
      updated_at: nowIso,
    }])
    .select('id, company_id, deal_id, quote_id, invoice_id, change_order_number, status, created_at, updated_at, accepted_at')
    .single();

  if (error) {
    throw new DatabaseError('Failed to create change order', error);
  }

  return data;
}

/**
 * Update a change order
 */
export async function updateChangeOrder(
  changeOrderId: string,
  updates: Partial<ChangeOrder>
): Promise<ChangeOrderWithItems> {
  const { data, error } = await supabase
    .from('change_orders')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', changeOrderId)
    .select('*, items:quote_line_items(*)')
    .order('position', { ascending: true, foreignTable: 'items' })
    .single();

  if (error) {
    throw new DatabaseError('Failed to update change order', error);
  }

  return data;
}

/**
 * Delete a change order
 */
export async function deleteChangeOrder(changeOrderId: string): Promise<void> {
  const { error } = await supabase
    .from('change_orders')
    .delete()
    .eq('id', changeOrderId);

  if (error) {
    throw new DatabaseError('Failed to delete change order', error);
  }
}

/**
 * Delete change order line items
 */
export async function deleteChangeOrderItems(changeOrderId: string): Promise<void> {
  const { error } = await supabase
    .from('quote_line_items')
    .delete()
    .eq('change_order_id', changeOrderId);

  if (error) {
    throw new DatabaseError('Failed to delete change order items', error);
  }
}
