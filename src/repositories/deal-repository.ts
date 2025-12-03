import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import * as PipelineRepository from './pipeline-repository';
import {
  type PaginationParams,
  type PaginatedResponse,
  calculateOffset,
  buildPaginatedResponse,
} from '../lib/pagination';
import type {
  Deal as ApiDeal,
  DealWithRelations as ApiDealWithRelations,
  ContactAddress,
  ContactWithAddresses,
  Appointment,
} from '../types/api';

// Re-export types for backwards compatibility
export type Deal = ApiDeal;
export type DealWithRelations = ApiDealWithRelations;

/**
 * Deal list filters for paginated queries
 */
export type DealListFilters = {
  company_id: string;
  pipeline?: string;
  stage?: string;
  salesperson?: string;
  lead_source?: string;
};

/**
 * Deal Repository
 * Handles all database operations for deals
 */

const DEAL_SELECT_WITH_RELATIONS = `
  *,
  contact:contacts(*, addresses:contact_addresses(*)),
  service_address:contact_addresses(*),
  latest_appointment:appointments!deal_id(
    id, company_id, deal_id, assigned_to, crew_id, event_color,
    scheduled_start, scheduled_end, appointment_notes, send_email, send_sms,
    created_at, updated_at
  )
`;

/**
 * Raw deal type from database query with potentially array-wrapped latest_appointment
 */
type RawDealFromDb = Omit<DealWithRelations, 'latest_appointment'> & {
  latest_appointment?: Appointment | Appointment[] | null;
};

/**
 * Normalize the latest_appointment field to always be a single object or null
 */
function normalizeLatestAppointment(deal: RawDealFromDb | null): DealWithRelations | null {
  if (!deal) return deal;

  const latest = Array.isArray(deal.latest_appointment)
    ? deal.latest_appointment[0] ?? null
    : deal.latest_appointment ?? null;

  return { ...deal, latest_appointment: latest };
}

/**
 * Get deals with optional filtering
 */
export async function getDeals(filters?: {
  company_id?: string;
  contact_id?: string;
  pipeline?: string;
  order?: string;
  limit?: number;
  exclude_archived?: boolean;
}): Promise<DealWithRelations[]> {
  let query = supabase
    .from('deals')
    .select(DEAL_SELECT_WITH_RELATIONS)
    .order('scheduled_start', { foreignTable: 'latest_appointment', ascending: false })
    .limit(1, { foreignTable: 'latest_appointment' });

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  if (filters?.contact_id) {
    query = query.eq('contact_id', filters.contact_id);
  }

  // Filter out archived deals only if explicitly requested
  if (filters?.exclude_archived) {
    query = query.is('archived_at', null);
  }

  if (filters?.pipeline && filters?.company_id) {
    const pipelineStages = await PipelineRepository.getPipelineStageKeys(
      filters.company_id,
      filters.pipeline
    );
    if (pipelineStages.length > 0) {
      query = query.in('stage', pipelineStages);
    }
  }

  if (filters?.order) {
    const [column, direction] = filters.order.split('.');
    if (column) {
      query = query.order(column, { ascending: direction !== 'desc' });
    }
  }

  if (filters?.limit && filters.limit > 0) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch deals', error);
  }

  return (data ?? []).map(normalizeLatestAppointment).filter((d): d is DealWithRelations => d !== null);
}

/**
 * Get deals with server-side pagination
 */
export async function getDealsPaginated(
  filters: DealListFilters,
  pagination: PaginationParams
): Promise<PaginatedResponse<DealWithRelations>> {
  const offset = calculateOffset(pagination.page, pagination.pageSize);

  // Build base query with count
  let query = supabase
    .from('deals')
    .select(DEAL_SELECT_WITH_RELATIONS, { count: 'exact' })
    .eq('company_id', filters.company_id)
    .is('archived_at', null) // Exclude archived deals
    .order('scheduled_start', { foreignTable: 'latest_appointment', ascending: false })
    .limit(1, { foreignTable: 'latest_appointment' });

  // Filter by pipeline stages
  if (filters.pipeline) {
    const pipelineStages = await PipelineRepository.getPipelineStageKeys(
      filters.company_id,
      filters.pipeline
    );
    if (pipelineStages.length > 0) {
      query = query.in('stage', pipelineStages);
    }
  }

  // Filter by specific stage
  if (filters.stage) {
    query = query.eq('stage', filters.stage);
  }

  // Filter by salesperson
  if (filters.salesperson) {
    query = query.eq('salesperson', filters.salesperson);
  }

  // Filter by lead source
  if (filters.lead_source) {
    query = query.eq('lead_source', filters.lead_source);
  }

  // Server-side search across name, email, phone
  if (pagination.search) {
    const searchTerm = `%${pagination.search}%`;
    query = query.or(
      `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
    );
  }

  // Apply sorting (default: updated_at descending)
  const sortBy = pagination.sortBy || 'updated_at';
  const sortOrder = pagination.sortOrder === 'asc';
  query = query.order(sortBy, { ascending: sortOrder });

  // Apply pagination
  query = query.range(offset, offset + pagination.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch deals', error);
  }

  const normalizedData = (data ?? [])
    .map(normalizeLatestAppointment)
    .filter((d): d is DealWithRelations => d !== null);
  return buildPaginatedResponse(normalizedData, count ?? 0, pagination);
}

/**
 * Get deal list summary (salespeople, lead sources, etc.)
 */
export async function getDealListSummary(companyId: string, pipeline?: string): Promise<{
  totalDeals: number;
  salespeople: string[];
  leadSources: string[];
}> {
  let query = supabase
    .from('deals')
    .select('salesperson, lead_source', { count: 'exact' })
    .eq('company_id', companyId);

  // Filter by pipeline if provided
  if (pipeline) {
    const pipelineStages = await PipelineRepository.getPipelineStageKeys(companyId, pipeline);
    if (pipelineStages.length > 0) {
      query = query.in('stage', pipelineStages);
    }
  }

  const { data, count, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch deal summary', error);
  }

  const salespeople = [...new Set((data ?? []).map(d => d.salesperson).filter(Boolean))];
  const leadSources = [...new Set((data ?? []).map(d => d.lead_source).filter(Boolean))];

  return {
    totalDeals: count ?? 0,
    salespeople,
    leadSources,
  };
}

/**
 * Get a single deal by ID
 */
export async function getDealById(dealId: string): Promise<DealWithRelations | null> {
  const { data, error } = await supabase
    .from('deals')
    .select(DEAL_SELECT_WITH_RELATIONS)
    .order('scheduled_start', { foreignTable: 'latest_appointment', ascending: false })
    .limit(1, { foreignTable: 'latest_appointment' })
    .eq('id', dealId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch deal', error);
  }

  return normalizeLatestAppointment(data);
}

/**
 * Proposal attachment asset with signed URL
 */
export interface ProposalAttachmentAsset {
  id: string;
  company_id: string;
  deal_id: string;
  quote_id: string;
  storage_key: string;
  thumbnail_key: string | null;
  original_filename: string;
  content_type: string;
  byte_size: number;
  uploaded_by_user_id: string | null;
  uploaded_at: string;
  updated_at: string;
  signed_url: string | null;
  thumbnail_url: string | null;
}

/**
 * Deal details response with all related data
 */
export interface DealDetailsResponse {
  deal: DealWithRelations;
  quotes: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  companyMembers: Array<Record<string, unknown>>;
  crews: Array<Record<string, unknown>>;
  dealNotes: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  proposalAttachments: ProposalAttachmentAsset[];
  appointments: Appointment[];
}

/**
 * Get deal details with all related data
 */
export async function getDealDetails(dealId: string): Promise<DealDetailsResponse | null> {
  // Fetch deal first
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select(DEAL_SELECT_WITH_RELATIONS)
    .order('scheduled_start', { foreignTable: 'latest_appointment', ascending: false })
    .limit(1, { foreignTable: 'latest_appointment' })
    .eq('id', dealId)
    .single();

  if (dealError) {
    throw new DatabaseError('Failed to fetch deal', dealError);
  }

  if (!deal) {
    return null;
  }

  const normalizedDeal = normalizeLatestAppointment(deal);
  if (!normalizedDeal) {
    return null;
  }
  const companyId = normalizedDeal.company_id;

  // Fetch related data in parallel
  const [
    { data: quotes },
    { data: invoices },
    { data: contacts },
    { data: companyMembers },
    { data: crews },
    { data: dealNotes },
    { data: attachments },
    { data: proposalAttachments },
    { data: appointments },
  ] = await Promise.all([
    supabase.from('quotes').select('*, line_items:quote_line_items(*)').eq('deal_id', dealId),
    supabase.from('invoices').select('*').eq('deal_id', dealId),
    supabase.from('contacts').select('*').eq('company_id', companyId),
    supabase.from('company_members').select('*').eq('company_id', companyId),
    supabase.from('crews').select('*').eq('company_id', companyId),
    supabase.from('deal_notes').select('*').eq('deal_id', dealId),
    supabase.from('deal_attachments').select('*').eq('deal_id', dealId),
    supabase.from('proposal_attachments').select('*').eq('deal_id', dealId),
    supabase
      .from('appointments')
      .select('*')
      .eq('deal_id', dealId)
      .eq('company_id', companyId)
      .order('scheduled_start', { ascending: true }),
  ]);

  // Import and use proposal attachments helper
  const { toProposalAttachmentAssets } = await import('../lib/proposal-attachments');

  return {
    deal: normalizedDeal,
    quotes: quotes || [],
    invoices: invoices || [],
    contacts: contacts || [],
    companyMembers: companyMembers || [],
    crews: crews || [],
    dealNotes: dealNotes || [],
    attachments: attachments || [],
    proposalAttachments: await toProposalAttachmentAssets(proposalAttachments ?? []),
    appointments: appointments || [],
  };
}

/**
 * Create a new deal
 */
export async function createDeal(dealData: Partial<Deal>): Promise<Deal> {
  // Validation
  if (!dealData.company_id || !dealData.first_name || !dealData.stage) {
    throw new DatabaseError('company_id, first_name, and stage are required');
  }

  const { data, error } = await supabase
    .from('deals')
    .insert([dealData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create deal', error);
  }

  return data;
}

/**
 * Update a deal
 */
export async function updateDeal(dealId: string, updates: Partial<Deal>): Promise<DealWithRelations> {
  const updatePayload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('deals')
    .update(updatePayload)
    .eq('id', dealId)
    .select('*, contact:contacts(*, addresses:contact_addresses(*)), service_address:contact_addresses(*)')
    .single();

  if (error) {
    throw new DatabaseError('Failed to update deal', error);
  }

  return data;
}

/**
 * Update deal stage
 */
export async function updateDealStage(dealId: string, stage: string): Promise<Deal> {
  // Validate stage change requirements
  if (stage === 'estimate_scheduled') {
    const { count, error: appointmentError } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId);

    if (appointmentError) {
      throw new DatabaseError('Failed to check appointments', appointmentError);
    }

    if (!count || count < 1) {
      throw new DatabaseError('Create an appointment before moving this deal to Estimate Scheduled.');
    }
  }

  const { data, error } = await supabase
    .from('deals')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update deal stage', error);
  }

  return data;
}

/**
 * Delete a deal
 */
export async function deleteDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .delete()
    .eq('id', dealId);

  if (error) {
    throw new DatabaseError('Failed to delete deal', error);
  }
}

/**
 * Archive a deal (soft delete)
 */
export async function archiveDeal(dealId: string): Promise<Deal> {
  const { data, error } = await supabase
    .from('deals')
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to archive deal', error);
  }

  return data;
}

/**
 * Unarchive a deal
 */
export async function unarchiveDeal(dealId: string): Promise<Deal> {
  const { data, error } = await supabase
    .from('deals')
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to unarchive deal', error);
  }

  return data;
}
