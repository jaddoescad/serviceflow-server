import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * DealSource type definitions
 */
export type DealSource = {
  id: string;
  company_id: string;
  name: string;
  is_default: boolean;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Deal Source Repository
 * Handles all database operations for deal sources
 */

/**
 * Get deal sources for a company
 */
export async function getDealSources(companyId: string): Promise<DealSource[]> {
  const { data, error } = await supabase
    .from('deal_sources')
    .select('*')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw new DatabaseError('Failed to fetch deal sources', error);
  }

  return data ?? [];
}

/**
 * Get a single deal source by ID
 */
export async function getDealSourceById(sourceId: string): Promise<DealSource | null> {
  const { data, error } = await supabase
    .from('deal_sources')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch deal source', error);
  }

  return data;
}

/**
 * Upsert a deal source (update if exists by company_id + name, create if not)
 */
export async function upsertDealSource(
  sourceData: Partial<DealSource> & { company_id: string; name: string }
): Promise<DealSource> {
  const payload = {
    ...sourceData,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('deal_sources')
    .upsert(payload, { onConflict: 'company_id,name' })
    .select('*')
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert deal source', error);
  }

  return data;
}

/**
 * Create a new deal source
 */
export async function createDealSource(
  sourceData: Partial<DealSource>
): Promise<DealSource> {
  const { data, error } = await supabase
    .from('deal_sources')
    .insert([sourceData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create deal source', error);
  }

  return data;
}

/**
 * Update a deal source
 */
export async function updateDealSource(
  sourceId: string,
  updates: Partial<DealSource>
): Promise<DealSource> {
  const { data, error } = await supabase
    .from('deal_sources')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update deal source', error);
  }

  return data;
}

/**
 * Delete a deal source
 */
export async function deleteDealSource(sourceId: string): Promise<void> {
  const { error } = await supabase.from('deal_sources').delete().eq('id', sourceId);

  if (error) {
    throw new DatabaseError('Failed to delete deal source', error);
  }
}
