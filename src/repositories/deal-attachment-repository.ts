import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Deal Attachment type definitions
 */
export type DealAttachment = {
  id: string;
  deal_id: string;
  file_name: string;
  file_url?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  uploaded_by?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Deal Attachment Repository
 * Handles all database operations for deal attachments
 */

/**
 * Get deal attachments by deal ID
 */
export async function getDealAttachments(dealId: string): Promise<DealAttachment[]> {
  const { data, error } = await supabase
    .from('proposal_attachments')
    .select('*')
    .eq('deal_id', dealId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Supabase error fetching deal attachments:', error);
    throw new DatabaseError('Failed to fetch deal attachments', error);
  }

  // Map the actual schema to DealAttachment type
  return (data ?? []).map(attachment => ({
    id: attachment.id,
    deal_id: dealId,
    file_name: attachment.original_filename,
    file_url: attachment.storage_key,
    file_size: attachment.byte_size,
    file_type: attachment.content_type,
    uploaded_by: attachment.uploaded_by_user_id,
    created_at: attachment.uploaded_at,
    updated_at: attachment.updated_at,
  }));
}

/**
 * Get a single deal attachment by ID
 */
export async function getDealAttachmentById(attachmentId: string): Promise<DealAttachment | null> {
  const { data, error } = await supabase
    .from('deal_attachments')
    .select('*')
    .eq('id', attachmentId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch deal attachment', error);
  }

  return data;
}

/**
 * Create a deal attachment
 */
export async function createDealAttachment(attachmentData: Partial<DealAttachment>): Promise<DealAttachment> {
  const { data, error } = await supabase
    .from('deal_attachments')
    .insert([attachmentData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create deal attachment', error);
  }

  return data;
}

/**
 * Delete a deal attachment
 */
export async function deleteDealAttachment(attachmentId: string): Promise<void> {
  const { error } = await supabase
    .from('deal_attachments')
    .delete()
    .eq('id', attachmentId);

  if (error) {
    throw new DatabaseError('Failed to delete deal attachment', error);
  }
}
