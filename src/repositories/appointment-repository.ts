import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import type { Appointment as ApiAppointment, AppointmentWithDeal, DealForAppointment, ContactBasic } from '../types/api';

// Re-export types for backwards compatibility
export type Appointment = ApiAppointment;

// Normalize calendar appointment to extract first deal from array
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCalendarAppointment(raw: Record<string, unknown>): AppointmentWithDeal {
  const rawDeal = raw.deal;
  const dealArray = Array.isArray(rawDeal) ? rawDeal : [];
  const deal = dealArray[0] as Record<string, unknown> | undefined;

  const normalizedDeal: DealForAppointment = deal ? {
    id: deal.id as string ?? '',
    contact_id: deal.contact_id as string | null,
    first_name: deal.first_name as string ?? '',
    last_name: deal.last_name as string ?? '',
    email: deal.email as string | null,
    phone: deal.phone as string | null,
    stage: deal.stage as string ?? '',
    salesperson: deal.salesperson as string | null,
    assigned_to: deal.assigned_to as string | null,
    event_color: deal.event_color as string | null,
    contact: Array.isArray(deal.contact) ? (deal.contact[0] as ContactBasic | undefined) ?? null : null,
  } : {
    id: '',
    first_name: '',
    last_name: '',
    stage: '',
  };

  return {
    id: raw.id as string,
    company_id: raw.company_id as string,
    deal_id: raw.deal_id as string,
    assigned_to: raw.assigned_to as string | null,
    crew_id: raw.crew_id as string | null,
    event_color: raw.event_color as string | null,
    scheduled_start: raw.scheduled_start as string,
    scheduled_end: raw.scheduled_end as string,
    appointment_notes: raw.appointment_notes as string | null,
    send_email: raw.send_email as boolean,
    send_sms: raw.send_sms as boolean,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
    deal: normalizedDeal,
  };
}

/**
 * Appointment Repository
 * Handles all database operations for appointments
 */

/**
 * Get appointments with optional filtering
 */
export async function getAppointments(filters?: {
  company_id?: string;
  deal_id?: string;
  assigned_to?: string;
  crew_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<Appointment[]> {
  let query = supabase
    .from('appointments')
    .select('*')
    .order('scheduled_start', { ascending: true });

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }
  if (filters?.deal_id) {
    query = query.eq('deal_id', filters.deal_id);
  }
  if (filters?.assigned_to) {
    query = query.eq('assigned_to', filters.assigned_to);
  }
  if (filters?.crew_id) {
    query = query.eq('crew_id', filters.crew_id);
  }
  if (filters?.start_date) {
    query = query.gte('scheduled_start', filters.start_date);
  }
  if (filters?.end_date) {
    query = query.lte('scheduled_end', filters.end_date);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch appointments', error);
  }

  return data ?? [];
}

/**
 * Get calendar appointments with nested deal and contact data
 */
export async function getCalendarAppointments(filters?: {
  company_id?: string;
  deal_id?: string;
  start_date?: string;
  end_date?: string;
  deal_stages?: string[];
}): Promise<AppointmentWithDeal[]> {
  const APPOINTMENT_CALENDAR_FIELDS = `
    id,
    company_id,
    deal_id,
    assigned_to,
    crew_id,
    event_color,
    scheduled_start,
    scheduled_end,
    appointment_notes,
    send_email,
    send_sms,
    created_at,
    updated_at,
    deal:deals!appointments_deal_id_fkey(
      id,
      contact_id,
      first_name,
      last_name,
      email,
      phone,
      stage,
      salesperson,
      assigned_to,
      event_color,
      contact:contacts(
        id,
        first_name,
        last_name,
        email,
        phone
      )
    )
  `;

  let query = supabase
    .from('appointments')
    .select(APPOINTMENT_CALENDAR_FIELDS)
    .order('scheduled_start', { ascending: true });

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }
  if (filters?.deal_id) {
    query = query.eq('deal_id', filters.deal_id);
  }
  if (filters?.start_date) {
    query = query.gte('scheduled_start', filters.start_date);
  }
  if (filters?.end_date) {
    query = query.lt('scheduled_start', filters.end_date);
  }
  if (filters?.deal_stages && filters.deal_stages.length > 0) {
    query = query.in('deal.stage', filters.deal_stages);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch calendar appointments', error);
  }

  return (data ?? []).map(normalizeCalendarAppointment);
}

/**
 * Get a single appointment by ID
 */
export async function getAppointmentById(appointmentId: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch appointment', error);
  }

  return data;
}

/**
 * Get appointments for a deal
 */
export async function getAppointmentsByDealId(dealId: string, companyId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('deal_id', dealId)
    .eq('company_id', companyId)
    .order('scheduled_start', { ascending: true });

  if (error) {
    throw new DatabaseError('Failed to fetch appointments for deal', error);
  }

  return data ?? [];
}

/**
 * Count appointments for a deal
 */
export async function countAppointmentsByDealId(dealId: string): Promise<number> {
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId);

  if (error) {
    throw new DatabaseError('Failed to count appointments', error);
  }

  return count ?? 0;
}

/**
 * Create a new appointment
 */
export async function createAppointment(appointmentData: Partial<Appointment>): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert([appointmentData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create appointment', error);
  }

  return data;
}

/**
 * Update an appointment
 */
export async function updateAppointment(
  appointmentId: string,
  updates: Partial<Appointment>
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update appointment', error);
  }

  return data;
}

/**
 * Delete an appointment
 */
export async function deleteAppointment(appointmentId: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', appointmentId);

  if (error) {
    throw new DatabaseError('Failed to delete appointment', error);
  }
}
