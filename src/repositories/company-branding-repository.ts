import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Company Branding type definitions
 */
export type CompanyBranding = {
  id: string;
  company_id: string;
  logo_url?: string | null;
  logo_storage_key?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  website_url?: string | null;
  review_url?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Company Branding Repository
 * Handles all database operations for company branding
 */

/**
 * Get company branding by company ID
 */
export async function getCompanyBranding(companyId: string): Promise<CompanyBranding | null> {
  // Company branding is stored in the companies table itself
  const { data, error } = await supabase
    .from('companies')
    .select('id, logo_storage_key, review_url, website, created_at, updated_at')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    console.error('Supabase error fetching company branding:', error);
    throw new DatabaseError('Failed to fetch company branding', error);
  }

  if (!data) {
    return null;
  }

  // Map companies table fields to CompanyBranding type
  return {
    id: data.id,
    company_id: data.id,
    logo_storage_key: data.logo_storage_key,
    review_url: data.review_url,
    website_url: data.website,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Create or update company branding (upsert)
 */
export async function upsertCompanyBranding(brandingData: Partial<CompanyBranding>): Promise<CompanyBranding> {
  const { data, error } = await supabase
    .from('company_branding')
    .upsert([{
      ...brandingData,
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert company branding', error);
  }

  return data;
}

/**
 * Update company branding
 */
export async function updateCompanyBranding(
  companyId: string,
  updates: Partial<CompanyBranding>
): Promise<CompanyBranding> {
  const { data, error } = await supabase
    .from('company_branding')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update company branding', error);
  }

  return data;
}

/**
 * Delete company branding
 */
export async function deleteCompanyBranding(companyId: string): Promise<void> {
  const { error } = await supabase
    .from('company_branding')
    .delete()
    .eq('company_id', companyId);

  if (error) {
    throw new DatabaseError('Failed to delete company branding', error);
  }
}
