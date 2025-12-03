import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * ProductTemplate type definitions
 */
export type ProductTemplate = {
  id: string;
  company_id: string;
  created_by_user_id?: string | null;
  name: string;
  description?: string | null;
  type: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Product Template Repository
 * Handles all database operations for product templates
 */

/**
 * Get product templates with optional filtering
 */
export async function getProductTemplates(filters?: {
  company_id?: string;
  type?: string;
  search?: string;
}): Promise<ProductTemplate[]> {
  let query = supabase.from('product_templates').select('*');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  if (filters?.type && filters.type !== 'all') {
    query = query.eq('type', filters.type);
  }

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch product templates', error);
  }

  return data ?? [];
}

/**
 * Get a single product template by ID
 */
export async function getProductTemplateById(templateId: string): Promise<ProductTemplate | null> {
  const { data, error } = await supabase
    .from('product_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch product template', error);
  }

  return data;
}

/**
 * Create a new product template
 */
export async function createProductTemplate(templateData: Partial<ProductTemplate>): Promise<ProductTemplate> {
  if (!templateData.company_id || !templateData.name || !templateData.type) {
    throw new DatabaseError('company_id, name, and type are required');
  }

  const { data, error } = await supabase
    .from('product_templates')
    .insert([templateData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create product template', error);
  }

  return data;
}

/**
 * Update a product template
 */
export async function updateProductTemplate(
  templateId: string,
  updates: Partial<ProductTemplate>
): Promise<ProductTemplate> {
  const { data, error } = await supabase
    .from('product_templates')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update product template', error);
  }

  return data;
}

/**
 * Delete a product template
 */
export async function deleteProductTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.from('product_templates').delete().eq('id', templateId);

  if (error) {
    throw new DatabaseError('Failed to delete product template', error);
  }
}
