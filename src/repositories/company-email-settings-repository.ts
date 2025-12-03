import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Company Email Settings type definitions
 */
export type CompanyEmailSettings = {
  id: string;
  company_id: string;
  provider_account_email: string | null;
  reply_email: string | null;
  bcc_email: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Company Email Settings Repository
 * Handles all database operations for company email settings
 */

/**
 * Get email settings for a company
 */
export async function getCompanyEmailSettings(companyId: string): Promise<CompanyEmailSettings | null> {
  const { data, error } = await supabase
    .from('company_email_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    // Handle the "relation does not exist" case gracefully
    // This can happen if the table hasn't been created yet in the database
    if (error.message?.toLowerCase().includes('relation')) {
      return null;
    }

    // For other errors, log but don't throw (graceful degradation)
    console.warn('Error fetching company email settings:', error);
    return null;
  }

  return data;
}

/**
 * Create or update email settings for a company
 */
export async function upsertCompanyEmailSettings(settings: Partial<CompanyEmailSettings> & { company_id: string }): Promise<CompanyEmailSettings> {
  const { data, error } = await supabase
    .from('company_email_settings')
    .upsert({
      ...settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert company email settings', error);
  }

  return data;
}

/**
 * Delete email settings for a company
 */
export async function deleteCompanyEmailSettings(companyId: string): Promise<void> {
  const { error } = await supabase
    .from('company_email_settings')
    .delete()
    .eq('company_id', companyId);

  if (error) {
    throw new DatabaseError('Failed to delete company email settings', error);
  }
}
