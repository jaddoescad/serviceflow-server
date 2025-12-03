import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Company Settings type definitions
 */
export type CompanySettings = {
  id: string;
  company_id: string;
  timezone?: string | null;
  date_format?: string | null;
  currency?: string | null;
  business_hours?: any | null;
  default_payment_terms?: string | null;
  auto_invoice_on_quote_accept?: boolean;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Company Settings Repository
 * Handles all database operations for company settings
 */

/**
 * Get company settings by company ID
 */
export async function getCompanySettings(companyId: string): Promise<CompanySettings | null> {
  // Company settings are stored in the companies table itself
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    console.error('Supabase error fetching company settings:', error);
    throw new DatabaseError('Failed to fetch company settings', error);
  }

  return data;
}

/**
 * Create or update company settings (upsert)
 */
export async function upsertCompanySettings(settingsData: Partial<CompanySettings>): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from('company_settings')
    .upsert([{
      ...settingsData,
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert company settings', error);
  }

  return data;
}

/**
 * Update company settings
 */
export async function updateCompanySettings(
  companyId: string,
  updates: Partial<CompanySettings>
): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from('company_settings')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update company settings', error);
  }

  return data;
}

/**
 * Delete company settings
 */
export async function deleteCompanySettings(companyId: string): Promise<void> {
  const { error } = await supabase
    .from('company_settings')
    .delete()
    .eq('company_id', companyId);

  if (error) {
    throw new DatabaseError('Failed to delete company settings', error);
  }
}
