import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import type { CompanyMember as ApiCompanyMember } from '../types/api';

// Re-export types for backwards compatibility
export type CompanyMember = ApiCompanyMember;

/**
 * Company Member Repository
 * Handles all database operations for company members
 */

/**
 * Get company members with optional filtering
 */
export async function getCompanyMembers(filters?: {
  company_id?: string;
  user_id?: string;
  role?: string;
  includeUser?: boolean;
  includeCompany?: boolean;
}): Promise<CompanyMember[]> {
  let selectClause = '*';
  if (filters?.includeUser && filters?.includeCompany) {
    selectClause = '*,user:users(*),company:companies(*)';
  } else if (filters?.includeUser) {
    selectClause = '*,user:users(*)';
  } else if (filters?.includeCompany) {
    selectClause = '*,company:companies(*)';
  }

  let query = supabase.from('company_members').select(selectClause);

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }
  if (filters?.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters?.role) {
    query = query.eq('role', filters.role);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch company members', error);
  }

  return (data as unknown as CompanyMember[]) ?? [];
}

/**
 * Get a single company member by ID
 */
export async function getCompanyMemberById(memberId: string): Promise<CompanyMember | null> {
  const { data, error } = await supabase
    .from('company_members')
    .select('*')
    .eq('id', memberId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch company member', error);
  }

  return data;
}

/**
 * Create a new company member
 */
export async function createCompanyMember(memberData: Partial<CompanyMember>): Promise<CompanyMember> {
  const { data, error } = await supabase
    .from('company_members')
    .insert([memberData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create company member', error);
  }

  return data;
}

/**
 * Update a company member
 */
export async function updateCompanyMember(
  memberId: string,
  updates: Partial<CompanyMember>
): Promise<CompanyMember> {
  const { data, error } = await supabase
    .from('company_members')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update company member', error);
  }

  return data;
}

/**
 * Delete a company member
 */
export async function deleteCompanyMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('company_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    throw new DatabaseError('Failed to delete company member', error);
  }
}
