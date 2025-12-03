import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * User type definitions
 */
export type User = {
  id: string;
  email: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  current_company_id?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * User Repository
 * Handles all database operations for users
 */

/**
 * Get a single user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch user', error);
  }

  return data;
}

/**
 * Get a user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch user by email', error);
  }

  return data;
}

/**
 * Create or update a user (upsert)
 */
export async function upsertUser(userData: Partial<User>): Promise<User> {
  if (!userData.id || !userData.email) {
    throw new DatabaseError('User id and email are required for upsert');
  }

  const { data, error } = await supabase
    .from('users')
    .upsert([userData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert user', error);
  }

  return data;
}

/**
 * Update a user
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update user', error);
  }

  return data;
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase.from('users').delete().eq('id', userId);

  if (error) {
    throw new DatabaseError('Failed to delete user', error);
  }
}
