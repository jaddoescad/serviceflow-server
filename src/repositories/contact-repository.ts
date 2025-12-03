import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import {
  type PaginationParams,
  type PaginatedResponse,
  calculateOffset,
  buildPaginatedResponse,
} from '../lib/pagination';
import type {
  Contact as ApiContact,
  ContactAddress as ApiContactAddress,
  ContactWithAddresses as ApiContactWithAddresses,
} from '../types/api';

// Re-export types for backwards compatibility
export type Contact = ApiContact;
export type ContactAddress = ApiContactAddress;
export type ContactWithAddresses = ApiContactWithAddresses;

/**
 * Contact list filters
 */
export type ContactListFilters = {
  company_id: string;
  type?: string;
  source?: string;
  salesperson?: string;
  status?: string;
  showArchived?: boolean;
};

/**
 * Contact Repository
 * Handles all database operations for contacts
 */

/**
 * Get contacts with optional filtering (unpaginated - for backwards compatibility)
 */
export async function getContacts(filters?: {
  company_id?: string;
}): Promise<ContactWithAddresses[]> {
  let query = supabase
    .from('contacts')
    .select('*, addresses:contact_addresses(*)');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch contacts', error);
  }

  return data ?? [];
}

/**
 * Get contacts with pagination and server-side filtering
 */
export async function getContactsPaginated(
  filters: ContactListFilters,
  pagination: PaginationParams
): Promise<PaginatedResponse<ContactWithAddresses>> {
  const offset = calculateOffset(pagination.page, pagination.pageSize);

  // Build base query with count
  let query = supabase
    .from('contacts')
    .select('*, addresses:contact_addresses(*)', { count: 'exact' })
    .eq('company_id', filters.company_id);

  // Filter by archived status
  if (!filters.showArchived) {
    query = query.eq('archived', false);
  }

  // Server-side search across name, email, phone
  if (pagination.search) {
    const searchTerm = `%${pagination.search}%`;
    query = query.or(
      `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
    );
  }

  // Apply sorting (default: first_name ascending)
  const sortBy = pagination.sortBy || 'first_name';
  const sortOrder = pagination.sortOrder === 'desc' ? false : true;
  query = query.order(sortBy, { ascending: sortOrder });

  // Apply pagination
  query = query.range(offset, offset + pagination.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch contacts', error);
  }

  return buildPaginatedResponse(data ?? [], count ?? 0, pagination);
}

/**
 * Get contact list summary (sources, salespeople counts, etc.)
 * This is fetched separately to avoid slowing down paginated queries
 */
export async function getContactListSummary(companyId: string): Promise<{
  totalContacts: number;
  invalidPhoneCount: number;
  sources: string[];
  salespeople: string[];
}> {
  // Get total count and basic stats
  const { count, error: countError } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('archived', false);

  if (countError) {
    throw new DatabaseError('Failed to fetch contact count', countError);
  }

  // For now, return empty arrays for sources/salespeople
  // These would need to be populated based on your data model
  return {
    totalContacts: count ?? 0,
    invalidPhoneCount: 0,
    sources: [],
    salespeople: [],
  };
}

/**
 * Get a single contact by ID with addresses
 */
export async function getContactById(contactId: string): Promise<ContactWithAddresses | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, addresses:contact_addresses(*)')
    .eq('id', contactId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch contact', error);
  }

  return data;
}

/**
 * Create a new contact
 */
export async function createContact(contactData: Partial<Contact>): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .insert([contactData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create contact', error);
  }

  return data;
}

/**
 * Update a contact
 */
export async function updateContact(contactId: string, updates: Partial<Contact>): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update contact', error);
  }

  return data;
}

/**
 * Delete a contact
 */
export async function deleteContact(contactId: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId);

  if (error) {
    throw new DatabaseError('Failed to delete contact', error);
  }
}

/**
 * Get contact address by ID
 */
export async function getContactAddressById(addressId: string): Promise<ContactAddress | null> {
  const { data, error } = await supabase
    .from('contact_addresses')
    .select('*')
    .eq('id', addressId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch contact address', error);
  }

  return data;
}

/**
 * Create a contact address
 */
export async function createContactAddress(addressData: Partial<ContactAddress>): Promise<ContactAddress> {
  const { data, error } = await supabase
    .from('contact_addresses')
    .insert([addressData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create contact address', error);
  }

  return data;
}

/**
 * Update a contact address
 */
export async function updateContactAddress(
  addressId: string,
  updates: Partial<ContactAddress>
): Promise<ContactAddress> {
  const { data, error } = await supabase
    .from('contact_addresses')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', addressId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update contact address', error);
  }

  return data;
}

/**
 * Delete a contact address
 */
export async function deleteContactAddress(addressId: string): Promise<void> {
  const { error } = await supabase
    .from('contact_addresses')
    .delete()
    .eq('id', addressId);

  if (error) {
    throw new DatabaseError('Failed to delete contact address', error);
  }
}
