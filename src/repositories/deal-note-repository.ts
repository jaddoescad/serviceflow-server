import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Deal Note type definitions
 */
export type DealNote = {
  id: string;
  company_id: string;
  deal_id: string;
  author_user_id?: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Deal Note Repository
 * Handles all database operations for deal notes
 */

/**
 * Get deal notes with optional filtering
 */
export async function getDealNotes(filters?: {
  company_id?: string;
  deal_id?: string;
  author_user_id?: string;
  includeAuthor?: boolean;
}): Promise<DealNote[]> {
  const selectClause = filters?.includeAuthor === true ? '*,author:users(display_name,email)' : '*';

  let query = supabase
    .from('deal_notes')
    .select(selectClause)
    .order('created_at', { ascending: false });

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }
  if (filters?.deal_id) {
    query = query.eq('deal_id', filters.deal_id);
  }
  if (filters?.author_user_id) {
    query = query.eq('author_user_id', filters.author_user_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch deal notes', error);
  }

  return (data as unknown as DealNote[]) ?? [];
}

/**
 * Get a single deal note by ID
 */
export async function getDealNoteById(noteId: string): Promise<DealNote | null> {
  const { data, error } = await supabase
    .from('deal_notes')
    .select('*')
    .eq('id', noteId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch deal note', error);
  }

  return data;
}

/**
 * Create a new deal note
 */
export async function createDealNote(
  noteData: Partial<DealNote>,
  includeAuthor: boolean = false
): Promise<DealNote> {
  const selectClause = includeAuthor === true ? '*,author:users(display_name,email)' : '*';

  const { data, error } = await supabase
    .from('deal_notes')
    .insert([noteData])
    .select(selectClause)
    .single();

  if (error) {
    throw new DatabaseError('Failed to create deal note', error);
  }

  return data as unknown as DealNote;
}

/**
 * Update a deal note
 */
export async function updateDealNote(noteId: string, updates: Partial<DealNote>): Promise<DealNote> {
  const { data, error } = await supabase
    .from('deal_notes')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update deal note', error);
  }

  return data;
}

/**
 * Delete a deal note
 */
export async function deleteDealNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('deal_notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    throw new DatabaseError('Failed to delete deal note', error);
  }
}
