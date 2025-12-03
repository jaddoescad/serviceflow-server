import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * ProposalAttachment type definitions
 */
export type ProposalAttachment = {
  id: string;
  company_id: string;
  deal_id: string;
  quote_id: string;
  storage_key: string;
  thumbnail_key: string | null;
  original_filename: string;
  content_type: string;
  byte_size: number;
  uploaded_by_user_id: string | null;
  uploaded_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Proposal Attachment Repository
 * Handles all database operations for proposal attachments
 */

/**
 * Get proposal attachments with optional filtering
 */
export async function getProposalAttachments(filters?: {
  company_id?: string;
  deal_id?: string;
  quote_id?: string;
}): Promise<ProposalAttachment[]> {
  let query = supabase.from('proposal_attachments').select('*');

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
    throw new DatabaseError('Failed to fetch proposal attachments', error);
  }

  return data ?? [];
}

/**
 * Get a single proposal attachment by ID
 */
export async function getProposalAttachmentById(
  attachmentId: string
): Promise<ProposalAttachment | null> {
  const { data, error } = await supabase
    .from('proposal_attachments')
    .select('*')
    .eq('id', attachmentId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch proposal attachment', error);
  }

  return data;
}

/**
 * Create a new proposal attachment
 */
export async function createProposalAttachment(
  attachmentData: Partial<ProposalAttachment>
): Promise<ProposalAttachment> {
  const { data, error } = await supabase
    .from('proposal_attachments')
    .insert([attachmentData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create proposal attachment', error);
  }

  return data;
}

/**
 * Update a proposal attachment
 */
export async function updateProposalAttachment(
  attachmentId: string,
  updates: Partial<ProposalAttachment>
): Promise<ProposalAttachment> {
  const { data, error } = await supabase
    .from('proposal_attachments')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attachmentId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update proposal attachment', error);
  }

  return data;
}

/**
 * Delete a proposal attachment
 */
export async function deleteProposalAttachment(attachmentId: string): Promise<void> {
  const { error } = await supabase.from('proposal_attachments').delete().eq('id', attachmentId);

  if (error) {
    throw new DatabaseError('Failed to delete proposal attachment', error);
  }
}
