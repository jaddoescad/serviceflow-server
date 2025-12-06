import { supabase } from '../lib/supabase';
import type {
  Quote as ApiQuote,
  QuoteLineItem as ApiQuoteLineItem,
  QuoteWithLineItems as ApiQuoteWithLineItems,
  QuoteWithRelations,
  PostgrestError,
} from '../types/api';

/**
 * Custom error for database operations
 */
export class DatabaseError extends Error {
  originalError: PostgrestError | undefined;

  constructor(message: string, originalError?: PostgrestError) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

// Re-export types for backwards compatibility
export type Quote = ApiQuote;
export type QuoteLineItem = ApiQuoteLineItem;
export type QuoteWithLineItems = ApiQuoteWithLineItems;

/**
 * Quote Repository
 * Handles all database operations for quotes
 */

/**
 * Get quotes with optional filtering
 */
export async function getQuotes(filters?: {
  company_id?: string;
  deal_id?: string;
  exclude_archived_deals?: boolean;
}): Promise<QuoteWithLineItems[]> {
  // If we need to exclude archived deals, join with deals table
  if (filters?.exclude_archived_deals && filters?.company_id) {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, line_items:quote_line_items(*), deal:deals!inner(id, archived_at)')
      .eq('company_id', filters.company_id)
      .is('deal.archived_at', null);

    if (error) {
      throw new DatabaseError('Failed to fetch quotes', error);
    }

    // Remove the deal join data from the response
    return (data ?? []).map(({ deal, ...quote }) => quote as QuoteWithLineItems);
  }

  let query = supabase.from('quotes').select('*, line_items:quote_line_items(*)');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }
  if (filters?.deal_id) {
    query = query.eq('deal_id', filters.deal_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch quotes', error);
  }

  return data ?? [];
}

/**
 * Get a single quote by ID with line items
 */
export async function getQuoteById(quoteId: string): Promise<QuoteWithLineItems | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, line_items:quote_line_items(*)')
    .eq('id', quoteId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new DatabaseError('Failed to fetch quote', error);
  }

  return data;
}

/**
 * Get a quote by public share ID with related data
 */
export async function getQuoteByShareId(shareId: string): Promise<QuoteWithRelations | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      line_items:quote_line_items(*),
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
    throw new DatabaseError('Failed to fetch quote by share ID', error);
  }

  return data;
}

/**
 * Quote summary type for dashboard views
 */
export interface QuoteSummary {
  id: string;
  deal_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  line_items: Array<{
    quantity: number;
    unit_price: number;
    is_change_order: boolean;
    change_order_id: string | null;
  }>;
}

/**
 * Get quotes for a company with summary info
 */
export async function getQuotesWithSummary(companyId: string): Promise<QuoteSummary[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, deal_id, status, created_at, updated_at, line_items:quote_line_items(quantity, unit_price, is_change_order, change_order_id)')
    .eq('company_id', companyId);

  if (error) {
    throw new DatabaseError('Failed to fetch quotes with summary', error);
  }

  return data ?? [];
}

/**
 * Create a new quote
 */
export async function createQuote(quoteData: Partial<Quote>): Promise<Quote> {
  const { data, error } = await supabase
    .from('quotes')
    .insert([quoteData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create quote', error);
  }

  return data;
}

/**
 * Update a quote
 */
export async function updateQuote(quoteId: string, updates: Partial<Quote>): Promise<Quote> {
  const { data, error } = await supabase
    .from('quotes')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update quote', error);
  }

  return data;
}

/**
 * Update quote status
 */
export async function updateQuoteStatus(
  quoteId: string,
  status: string
): Promise<Quote> {
  return updateQuote(quoteId, { status });
}

/**
 * Accept a quote with signature
 */
export async function acceptQuote(params: {
  quoteId: string;
  signature: string;
  acceptedAt: string;
}): Promise<Pick<Quote, 'id' | 'status' | 'acceptance_signature' | 'acceptance_signed_at'>> {
  const { quoteId, signature, acceptedAt } = params;

  const { data, error } = await supabase
    .from('quotes')
    .update({
      status: 'accepted',
      acceptance_signature: signature,
      acceptance_signed_at: acceptedAt,
      updated_at: acceptedAt,
    })
    .eq('id', quoteId)
    .select('id, status, acceptance_signature, acceptance_signed_at')
    .single();

  if (error) {
    throw new DatabaseError('Failed to accept quote', error);
  }

  return data;
}

/**
 * Delete a quote
 */
export async function deleteQuote(quoteId: string): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .delete()
    .eq('id', quoteId);

  if (error) {
    throw new DatabaseError('Failed to delete quote', error);
  }
}

/**
 * Get quote line items
 */
export async function getQuoteLineItems(quoteId: string, options?: {
  excludeChangeOrders?: boolean;
}): Promise<QuoteLineItem[]> {
  let query = supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('position', { ascending: true });

  if (options?.excludeChangeOrders) {
    query = query
      .eq('is_change_order', false)
      .is('change_order_id', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch quote line items', error);
  }

  return data ?? [];
}

/**
 * Upsert quote line items
 */
export async function upsertQuoteLineItems(items: Partial<QuoteLineItem>[]): Promise<QuoteLineItem[]> {
  const { data, error } = await supabase
    .from('quote_line_items')
    .upsert(items, { onConflict: 'id' })
    .select();

  if (error) {
    throw new DatabaseError('Failed to upsert quote line items', error);
  }

  return data ?? [];
}

/**
 * Delete quote line items
 */
export async function deleteQuoteLineItems(itemIds: string[], quoteId: string): Promise<void> {
  const { error } = await supabase
    .from('quote_line_items')
    .delete()
    .in('id', itemIds)
    .eq('quote_id', quoteId);

  if (error) {
    throw new DatabaseError('Failed to delete quote line items', error);
  }
}

/**
 * Count quotes for a deal
 */
export async function countQuotesByDealId(dealId: string): Promise<number> {
  const { count, error } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId);

  if (error) {
    throw new DatabaseError('Failed to count quotes', error);
  }

  return count ?? 0;
}
