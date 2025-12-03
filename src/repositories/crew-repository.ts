import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Crew type definitions
 */
export type Crew = {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Crew Repository
 * Handles all database operations for crews
 */

/**
 * Get crews with optional filtering
 */
export async function getCrews(filters?: {
  company_id?: string;
}): Promise<Crew[]> {
  let query = supabase.from('crews').select('*');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch crews', error);
  }

  return data ?? [];
}

/**
 * Get a single crew by ID
 */
export async function getCrewById(crewId: string): Promise<Crew | null> {
  const { data, error } = await supabase
    .from('crews')
    .select('*')
    .eq('id', crewId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch crew', error);
  }

  return data;
}

/**
 * Create a new crew
 */
export async function createCrew(crewData: Partial<Crew>): Promise<Crew> {
  const { data, error } = await supabase
    .from('crews')
    .insert([crewData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create crew', error);
  }

  return data;
}

/**
 * Update a crew
 */
export async function updateCrew(crewId: string, updates: Partial<Crew>): Promise<Crew> {
  const { data, error } = await supabase
    .from('crews')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', crewId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update crew', error);
  }

  return data;
}

/**
 * Delete a crew
 */
export async function deleteCrew(crewId: string): Promise<void> {
  const { error } = await supabase
    .from('crews')
    .delete()
    .eq('id', crewId);

  if (error) {
    throw new DatabaseError('Failed to delete crew', error);
  }
}
