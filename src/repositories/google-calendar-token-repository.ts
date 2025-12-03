import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Google Calendar Token type definitions
 */
export type GoogleCalendarToken = {
  id: string;
  user_id: string;
  refresh_token: string;
  access_token: string;
  access_token_expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Google Calendar Token Repository
 * Handles all database operations for Google Calendar OAuth tokens
 */

/**
 * Get Google Calendar token by user ID
 */
export async function getTokenByUserId(userId: string): Promise<GoogleCalendarToken | null> {
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch Google Calendar token', error);
  }

  return data;
}

/**
 * Upsert Google Calendar token (create or update)
 */
export async function upsertToken(tokenData: {
  user_id: string;
  refresh_token: string;
  access_token: string;
  access_token_expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
}): Promise<GoogleCalendarToken> {
  const payload = {
    ...tokenData,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to upsert Google Calendar token', error);
  }

  return data;
}

/**
 * Delete Google Calendar token by user ID
 */
export async function deleteTokenByUserId(userId: string): Promise<void> {
  const { error } = await supabase
    .from('google_calendar_tokens')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw new DatabaseError('Failed to delete Google Calendar token', error);
  }
}
