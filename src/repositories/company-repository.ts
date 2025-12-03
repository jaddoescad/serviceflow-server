import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import type {
  Company as ApiCompany,
  CompanyEmailSettings as ApiCompanyEmailSettings,
  CompanyBranding as ApiCompanyBranding,
} from '../types/api';

// Re-export types for backwards compatibility
export type Company = ApiCompany;

/**
 * Company Repository
 * Handles all database operations for companies
 */

/**
 * Get all companies, optionally filtered by user_id
 */
export async function getCompanies(filters?: {
  user_id?: string;
}): Promise<Company[]> {
  let query = supabase.from('companies').select('*');

  if (filters?.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch companies', error);
  }

  return data ?? [];
}

/**
 * Get a single company by ID
 */
export async function getCompanyById(companyId: string): Promise<Company | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch company', error);
  }

  return data;
}

/**
 * Get multiple companies by their IDs
 */
export async function getCompaniesByIds(companyIds: string[]): Promise<Company[]> {
  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .in('id', companyIds);

  if (error) {
    throw new DatabaseError('Failed to fetch companies', error);
  }

  return data ?? [];
}

/**
 * Get company OpenPhone settings
 */
export async function getCompanyOpenPhoneSettings(companyId: string): Promise<{
  openphone_api_key: string | null;
  openphone_phone_number_id: string | null;
  openphone_phone_number: string | null;
  openphone_enabled: boolean;
} | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('openphone_api_key, openphone_phone_number_id, openphone_phone_number, openphone_enabled')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch company OpenPhone settings', error);
  }

  return data;
}

/**
 * Create a new company
 */
export async function createCompany(companyData: Partial<Company>): Promise<Company> {
  if (!companyData.name) {
    throw new DatabaseError('Name is required');
  }

  const { data, error } = await supabase
    .from('companies')
    .insert([companyData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create company', error);
  }

  return data;
}

/**
 * Update a company
 */
export async function updateCompany(companyId: string, updates: Partial<Company>): Promise<Company> {
  const { data, error } = await supabase
    .from('companies')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId)
    .select('*')
    .single();

  if (error) {
    throw new DatabaseError('Failed to update company', error);
  }

  return data;
}

/**
 * Delete a company
 */
export async function deleteCompany(companyId: string): Promise<void> {
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', companyId);

  if (error) {
    throw new DatabaseError('Failed to delete company', error);
  }
}

// Re-export CompanyEmailSettings type
export type CompanyEmailSettings = ApiCompanyEmailSettings;

/**
 * Get company email settings
 */
export async function getCompanyEmailSettings(
  companyId: string
): Promise<CompanyEmailSettings | null> {
  const { data, error } = await supabase
    .from('company_email_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch company email settings', error);
  }

  return data;
}

/**
 * Upsert company email settings
 */
export async function upsertCompanyEmailSettings(
  settings: Partial<CompanyEmailSettings> & { company_id: string }
): Promise<CompanyEmailSettings> {
  const payload = {
    ...settings,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('company_email_settings')
    .upsert(payload, { onConflict: 'company_id' })
    .select('*')
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert company email settings', error);
  }

  return data;
}

// Re-export CompanyBranding type
export type CompanyBranding = ApiCompanyBranding;

/**
 * Get company branding
 */
export async function getCompanyBranding(
  companyId: string
): Promise<CompanyBranding | null> {
  const { data, error } = await supabase
    .from('company_branding')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch company branding', error);
  }

  return data;
}

/**
 * Upsert company branding
 */
export async function upsertCompanyBranding(
  branding: Partial<CompanyBranding> & { company_id: string }
): Promise<CompanyBranding> {
  const { data, error } = await supabase
    .from('company_branding')
    .upsert(branding, { onConflict: 'company_id' })
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert company branding', error);
  }

  return data;
}
