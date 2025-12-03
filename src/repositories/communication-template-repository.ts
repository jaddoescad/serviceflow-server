import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * CommunicationTemplate type definitions
 */
export type CommunicationTemplate = {
  id: string;
  company_id: string;
  template_key: string;
  subject?: string | null;
  body?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Communication Template Repository
 * Handles all database operations for communication templates
 */

/**
 * Get communication templates with optional filtering
 */
export async function getCommunicationTemplates(filters?: {
  company_id?: string;
  template_key?: string;
}): Promise<CommunicationTemplate[]> {
  let query = supabase.from('communication_templates').select('*');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  if (filters?.template_key) {
    query = query.eq('template_key', filters.template_key).limit(1);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch communication templates', error);
  }

  return data ?? [];
}

/**
 * Get a single communication template by ID
 */
export async function getCommunicationTemplateById(
  templateId: string
): Promise<CommunicationTemplate | null> {
  const { data, error } = await supabase
    .from('communication_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch communication template', error);
  }

  return data;
}

/**
 * Get a template by company and key
 */
export async function getCommunicationTemplateByKey(
  companyId: string,
  templateKey: string
): Promise<CommunicationTemplate | null> {
  const { data, error } = await supabase
    .from('communication_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('template_key', templateKey)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch communication template by key', error);
  }

  return data;
}

/**
 * Upsert a communication template (update if exists, create if not)
 */
export async function upsertCommunicationTemplate(
  companyId: string,
  templateKey: string,
  updates: Partial<CommunicationTemplate>
): Promise<CommunicationTemplate> {
  // Check if exists
  const existing = await getCommunicationTemplateByKey(companyId, templateKey);

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('communication_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new DatabaseError('Failed to update communication template', error);
    }

    return data;
  } else {
    // Create new
    const { data, error } = await supabase
      .from('communication_templates')
      .insert([
        {
          company_id: companyId,
          template_key: templateKey,
          ...updates,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new DatabaseError('Failed to create communication template', error);
    }

    return data;
  }
}

/**
 * Create a new communication template
 */
export async function createCommunicationTemplate(
  templateData: Partial<CommunicationTemplate>
): Promise<CommunicationTemplate> {
  const { data, error } = await supabase
    .from('communication_templates')
    .insert([templateData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create communication template', error);
  }

  return data;
}

/**
 * Update a communication template
 */
export async function updateCommunicationTemplate(
  templateId: string,
  updates: Partial<CommunicationTemplate>
): Promise<CommunicationTemplate> {
  const { data, error } = await supabase
    .from('communication_templates')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update communication template', error);
  }

  return data;
}

/**
 * Delete a communication template
 */
export async function deleteCommunicationTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.from('communication_templates').delete().eq('id', templateId);

  if (error) {
    throw new DatabaseError('Failed to delete communication template', error);
  }
}
