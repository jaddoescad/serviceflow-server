import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * DripSequence type definitions
 */
export type DripSequence = {
  id: string;
  company_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  steps?: DripStep[];
  [key: string]: any;
};

export type DripStep = {
  id: string;
  sequence_id: string;
  position: number;
  delay_type: string;
  delay_value: number;
  delay_unit: string;
  channel: string;
  email_subject?: string | null;
  email_body?: string | null;
  sms_body?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};

/**
 * Drip Sequence Repository
 * Handles all database operations for drip sequences and steps
 */

/**
 * Get drip sequences with optional filtering and nested steps
 */
export async function getDripSequences(filters?: {
  company_id?: string;
  pipeline_id?: string;
}): Promise<DripSequence[]> {
  let query = supabase
    .from('drip_sequences')
    .select('*,steps:drip_steps(*)')
    .order('position', { ascending: true, foreignTable: 'drip_steps' });

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  if (filters?.pipeline_id) {
    query = query.eq('pipeline_id', filters.pipeline_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch drip sequences', error);
  }

  return (data as unknown as DripSequence[]) ?? [];
}

/**
 * Get a single drip sequence by ID with its steps
 */
export async function getDripSequenceById(sequenceId: string): Promise<DripSequence | null> {
  const { data, error } = await supabase
    .from('drip_sequences')
    .select('*,steps:drip_steps(*)')
    .eq('id', sequenceId)
    .order('position', { ascending: true, foreignTable: 'drip_steps' })
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch drip sequence', error);
  }

  return data as unknown as DripSequence | null;
}

/**
 * Create a new drip sequence
 */
export async function createDripSequence(
  sequenceData: Partial<DripSequence>
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('drip_sequences')
    .insert([sequenceData])
    .select('id')
    .single();

  if (error) {
    throw new DatabaseError('Failed to create drip sequence', error);
  }

  return data;
}

/**
 * Update a drip sequence
 */
export async function updateDripSequence(
  sequenceId: string,
  updates: Partial<DripSequence>
): Promise<void> {
  const { error } = await supabase
    .from('drip_sequences')
    .update(updates)
    .eq('id', sequenceId);

  if (error) {
    throw new DatabaseError('Failed to update drip sequence', error);
  }
}

/**
 * Delete a drip sequence
 */
export async function deleteDripSequence(sequenceId: string): Promise<void> {
  const { error } = await supabase
    .from('drip_sequences')
    .delete()
    .eq('id', sequenceId);

  if (error) {
    throw new DatabaseError('Failed to delete drip sequence', error);
  }
}

/**
 * Update a drip step's position
 */
export async function updateDripStepPosition(
  stepId: string,
  position: number
): Promise<void> {
  const { error } = await supabase
    .from('drip_steps')
    .update({ position })
    .eq('id', stepId);

  if (error) {
    throw new DatabaseError('Failed to update drip step position', error);
  }
}

/**
 * Batch update drip step positions
 */
export async function batchUpdateDripStepPositions(
  updates: Array<{ id: string; position: number }>
): Promise<void> {
  const results = await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from('drip_steps').update({ position }).eq('id', id)
    )
  );

  const error = results.find((result) => result.error)?.error;
  if (error) {
    throw new DatabaseError('Failed to batch update drip step positions', error);
  }
}

/**
 * Create a new drip step
 */
export async function createDripStep(
  stepData: Partial<DripStep>
): Promise<{ sequence_id: string }> {
  const { data, error } = await supabase
    .from('drip_steps')
    .insert([stepData])
    .select('sequence_id')
    .single();

  if (error) {
    throw new DatabaseError('Failed to create drip step', error);
  }

  return data;
}

/**
 * Update a drip step
 */
export async function updateDripStep(
  stepId: string,
  updates: Partial<DripStep>
): Promise<{ sequence_id: string } | null> {
  const { data, error } = await supabase
    .from('drip_steps')
    .update(updates)
    .eq('id', stepId)
    .select('sequence_id')
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to update drip step', error);
  }

  return data;
}

/**
 * Get a drip step by ID
 */
export async function getDripStepById(
  stepId: string
): Promise<{ sequence_id: string } | null> {
  const { data, error } = await supabase
    .from('drip_steps')
    .select('sequence_id')
    .eq('id', stepId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to fetch drip step', error);
  }

  return data;
}

/**
 * Delete a drip step
 */
export async function deleteDripStep(stepId: string): Promise<void> {
  const { error } = await supabase.from('drip_steps').delete().eq('id', stepId);

  if (error) {
    throw new DatabaseError('Failed to delete drip step', error);
  }
}

/**
 * Cancel all pending drip jobs for a deal
 */
export async function cancelPendingDripJobsForDeal(
  dealId: string,
  reason: string = 'Deal archived'
): Promise<number> {
  const { data, error } = await supabase
    .from('deal_drip_jobs')
    .update({
      status: 'cancelled',
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('deal_id', dealId)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    throw new DatabaseError('Failed to cancel pending drip jobs', error);
  }

  return data?.length ?? 0;
}

/**
 * Appointment reminder types
 */
export type ReminderChannel = 'both' | 'email' | 'sms' | 'none';

export type AppointmentReminderJob = {
  id: string;
  company_id: string;
  deal_id: string;
  appointment_id: string;
  job_type: 'appointment_reminder';
  channel: string;
  send_at: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  message_subject: string | null;
  message_body: string | null;
  sms_body: string | null;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Create an appointment reminder job
 */
export async function createAppointmentReminder(params: {
  companyId: string;
  dealId: string;
  appointmentId: string;
  channel: ReminderChannel;
  sendAt: Date;
  messageSubject?: string | null;
  messageBody?: string | null;
  smsBody?: string | null;
}): Promise<{ id: string }> {
  const { companyId, dealId, appointmentId, channel, sendAt, messageSubject, messageBody, smsBody } = params;

  const { data, error } = await supabase
    .from('deal_drip_jobs')
    .insert([
      {
        company_id: companyId,
        deal_id: dealId,
        appointment_id: appointmentId,
        job_type: 'appointment_reminder',
        channel,
        stage_id: 'reminder', // Required field, using a placeholder
        send_at: sendAt.toISOString(),
        status: 'pending',
        message_subject: messageSubject ?? null,
        message_body: messageBody ?? null,
        sms_body: smsBody ?? null,
      },
    ])
    .select('id')
    .single();

  if (error) {
    throw new DatabaseError('Failed to create appointment reminder', error);
  }

  return data;
}

/**
 * Cancel pending appointment reminders for an appointment
 */
export async function cancelAppointmentReminders(
  appointmentId: string,
  reason: string = 'Appointment cancelled or rescheduled'
): Promise<number> {
  const { data, error } = await supabase
    .from('deal_drip_jobs')
    .update({
      status: 'cancelled',
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('appointment_id', appointmentId)
    .eq('job_type', 'appointment_reminder')
    .eq('status', 'pending')
    .select('id');

  if (error) {
    throw new DatabaseError('Failed to cancel appointment reminders', error);
  }

  return data?.length ?? 0;
}

/**
 * Check if an appointment has a pending reminder
 */
export async function hasPendingReminder(appointmentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deal_drip_jobs')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('job_type', 'appointment_reminder')
    .eq('status', 'pending')
    .limit(1);

  if (error) {
    throw new DatabaseError('Failed to check for pending reminder', error);
  }

  return (data?.length ?? 0) > 0;
}
