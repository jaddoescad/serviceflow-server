import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';
import type {
  DashboardData,
  DashboardDeal,
  DashboardQuote,
  DashboardDripSequence,
  UserAuthContext,
  PublicQuoteShare,
  QuoteAcceptanceResult,
  QuoteSendContext,
  InvoiceDetail,
  InvoiceSendContext,
  PaymentRequestSendContext,
  DealDetail,
  DealProposalData,
  CreateCompanyWithMemberResult,
  CreateOrUpdateQuoteResult,
  CreateOrUpdateChangeOrderResult,
  AcceptChangeOrderResult,
  RecordPaymentResult,
  CreateInvoiceWithItemsResult,
  CreateContactWithAddressesResult,
  UpdateContactWithAddressesResult,
  AddAddressesToContactResult,
  SeedDripSequencesResult,
  SeedCommunicationTemplatesResult,
  SeedProductTemplatesResult,
  SeedDealSourcesResult,
  UpdateQuoteAndDealAfterSendResult,
  UpdatePaymentRequestAfterSendResult,
  UpdatePaymentReceiptSentResult,
} from '../types/api';

// Re-export types for backwards compatibility
export type {
  DashboardData,
  DashboardDeal,
  DashboardQuote,
  DashboardDripSequence,
  UserAuthContext,
  PublicQuoteShare,
  QuoteAcceptanceResult,
  QuoteSendContext,
  InvoiceDetail,
  InvoiceSendContext,
  PaymentRequestSendContext,
  DealDetail,
  DealProposalData,
  CreateCompanyWithMemberResult,
  CreateOrUpdateQuoteResult,
  CreateOrUpdateChangeOrderResult,
  AcceptChangeOrderResult,
  RecordPaymentResult,
  CreateInvoiceWithItemsResult,
  CreateContactWithAddressesResult,
  UpdateContactWithAddressesResult,
  AddAddressesToContactResult,
  SeedDripSequencesResult,
  SeedCommunicationTemplatesResult,
  SeedProductTemplatesResult,
  SeedDealSourcesResult,
  UpdateQuoteAndDealAfterSendResult,
  UpdatePaymentRequestAfterSendResult,
  UpdatePaymentReceiptSentResult,
};

// ============================================================================
// RPC WRAPPER FUNCTIONS
// ============================================================================

/**
 * Get dashboard data for a company including deals, quotes, and drip sequences
 */
export async function getDashboardData(
  companyId: string,
  pipelineId: string
): Promise<DashboardData | null> {
  const { data, error } = await supabase.rpc('get_dashboard_data', {
    p_company_id: companyId,
    p_pipeline_id: pipelineId,
  });

  if (error) {
    // Return null to signal fallback should be used
    console.error('RPC get_dashboard_data error:', error);
    return null;
  }

  return data;
}

/**
 * Get user authentication context including user, organizations, company, and members
 */
export async function getUserAuthContext(
  userId: string
): Promise<UserAuthContext | null> {
  const { data, error } = await supabase.rpc('get_user_auth_context', {
    p_user_id: userId,
  });

  if (error) {
    console.error('RPC get_user_auth_context error:', error);
    return null;
  }

  return data;
}

/**
 * Get public quote share data by share ID
 */
export async function getPublicQuoteShare(
  shareId: string
): Promise<PublicQuoteShare | null> {
  const { data, error } = await supabase.rpc('get_public_quote_share', {
    p_share_id: shareId,
  });

  if (error) {
    console.error('RPC get_public_quote_share error:', error);
    return null;
  }

  return data;
}

/**
 * Accept a quote and create an invoice atomically
 */
export async function acceptQuoteWithInvoice(
  quoteId: string,
  signature: string,
  acceptedAt: string,
  signatureType: 'type' | 'draw' = 'type'
): Promise<QuoteAcceptanceResult | null> {
  const { data, error } = await supabase.rpc('accept_quote_with_invoice', {
    p_quote_id: quoteId,
    p_signature: signature,
    p_accepted_at: acceptedAt,
    p_signature_type: signatureType,
  });

  if (error) {
    console.error('RPC accept_quote_with_invoice error:', error);
    return null;
  }

  return data;
}

/**
 * Get quote send context including quote and deal information
 */
export async function getQuoteSendContext(
  quoteId: string,
  dealId: string
): Promise<QuoteSendContext | null> {
  const { data, error } = await supabase.rpc('get_quote_send_context', {
    p_quote_id: quoteId,
    p_deal_id: dealId,
  });

  if (error) {
    console.error('RPC get_quote_send_context error:', error);
    return null;
  }

  return data;
}

/**
 * Get invoice detail including all related data
 */
export async function getInvoiceDetail(
  dealId: string,
  invoiceId: string,
  companyId: string
): Promise<InvoiceDetail> {
  const { data, error } = await supabase.rpc('get_invoice_detail', {
    p_deal_id: dealId,
    p_invoice_id: invoiceId,
    p_company_id: companyId,
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to fetch invoice detail', error);
  }

  return data;
}

/**
 * Get invoice send context including email and phone settings
 */
export async function getInvoiceSendContext(
  invoiceId: string,
  dealId: string
): Promise<InvoiceSendContext | null> {
  const { data, error } = await supabase.rpc('get_invoice_send_context', {
    p_invoice_id: invoiceId,
    p_deal_id: dealId,
  });

  if (error) {
    console.error('RPC get_invoice_send_context error:', error);
    return null;
  }

  return data;
}

/**
 * Get payment request send context including email and phone settings
 */
export async function getPaymentRequestSendContext(
  requestId: string,
  invoiceId: string,
  dealId: string
): Promise<PaymentRequestSendContext | null> {
  const { data, error } = await supabase.rpc('get_payment_request_send_context', {
    p_request_id: requestId,
    p_invoice_id: invoiceId,
    p_deal_id: dealId,
  });

  if (error) {
    console.error('RPC get_payment_request_send_context error:', error);
    return null;
  }

  return data;
}

/**
 * Get deal detail including all related data (quotes, invoices, appointments, notes, etc.)
 */
export async function getDealDetail(
  dealId: string
): Promise<DealDetail> {
  const { data, error } = await supabase.rpc('get_deal_detail', {
    p_deal_id: dealId,
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to fetch deal detail', error);
  }

  return data;
}

/**
 * Get deal proposal data for proposal generation
 */
export async function getDealProposalData(
  dealId: string,
  quoteId?: string | null
): Promise<DealProposalData> {
  const { data, error } = await supabase.rpc('get_deal_proposal_data', {
    p_deal_id: dealId,
    p_quote_id: quoteId || null,
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to fetch deal proposal data', error);
  }

  return data;
}

// ============================================================================
// TRANSACTIONAL RPC FUNCTIONS
// These functions wrap multi-step operations in database transactions
// ============================================================================

/**
 * Create a company and add the creator as an admin member atomically.
 * If member creation fails, the company creation is rolled back.
 */
export async function createCompanyWithMember(params: {
  userId: string;
  name: string;
  email?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  employeeCount?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
}): Promise<CreateCompanyWithMemberResult> {
  const { data, error } = await supabase.rpc('create_company_with_member', {
    p_user_id: params.userId,
    p_name: params.name,
    p_email: params.email || null,
    p_owner_first_name: params.ownerFirstName || null,
    p_owner_last_name: params.ownerLastName || null,
    p_employee_count: params.employeeCount || null,
    p_phone_number: params.phoneNumber || null,
    p_website: params.website || null,
  });

  if (error) {
    throw new DatabaseError('Failed to create company with member', error);
  }

  return data;
}

/**
 * Create or update a quote with line items atomically.
 * For new quotes, also updates the deal stage to 'in_draft'.
 */
export async function createOrUpdateQuoteWithItems(params: {
  quoteId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  quoteNumber?: string | null;
  title?: string | null;
  status?: string;
  clientMessage?: string | null;
  disclaimer?: string | null;
  lineItems: Array<{
    id?: string;
    name: string;
    description?: string | null;
    quantity: number;
    unit_price?: number;
    unitPrice?: number;
    position?: number;
  }>;
  deletedLineItemIds?: string[];
}): Promise<CreateOrUpdateQuoteResult> {
  const { data, error } = await supabase.rpc('create_or_update_quote_with_items', {
    p_quote_id: params.quoteId || null,
    p_company_id: params.companyId || null,
    p_deal_id: params.dealId || null,
    p_quote_number: params.quoteNumber || null,
    p_title: params.title || null,
    p_status: params.status || 'draft',
    p_client_message: params.clientMessage ?? null,
    p_disclaimer: params.disclaimer ?? null,
    p_line_items: params.lineItems || [],
    p_deleted_line_item_ids: params.deletedLineItemIds || [],
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to create/update quote with items', error);
  }

  return data;
}

/**
 * Create or update a change order with items atomically.
 * Validates quote ownership and manages line items.
 */
export async function createOrUpdateChangeOrderWithItems(params: {
  companyId: string;
  quoteId: string;
  changeOrderNumber: string;
  items: Array<{
    name?: string;
    description?: string | null;
    quantity?: number;
    qty?: number;
    unit_price?: number;
    unitPrice?: number;
    position?: number;
  }>;
  invoiceId?: string | null;
}): Promise<CreateOrUpdateChangeOrderResult> {
  const { data, error } = await supabase.rpc('create_or_update_change_order_with_items', {
    p_company_id: params.companyId,
    p_quote_id: params.quoteId,
    p_change_order_number: params.changeOrderNumber,
    p_items: params.items || [],
    p_invoice_id: params.invoiceId || null,
  });

  if (error) {
    if (error.message.includes('not found') || error.message.includes('does not belong')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to create/update change order with items', error);
  }

  return data;
}

/**
 * Accept a change order and update the associated invoice atomically.
 * Adds change order items to invoice and updates totals.
 */
export async function acceptChangeOrderWithInvoice(params: {
  changeOrderId: string;
  invoiceId: string;
  signerName?: string | null;
  signerEmail?: string | null;
  signatureText?: string | null;
  signatureType?: 'type' | 'draw' | null;
}): Promise<AcceptChangeOrderResult> {
  const { data, error } = await supabase.rpc('accept_change_order_with_invoice', {
    p_change_order_id: params.changeOrderId,
    p_invoice_id: params.invoiceId,
    p_signer_name: params.signerName || null,
    p_signer_email: params.signerEmail || null,
    p_signature_text: params.signatureText || null,
    p_signature_type: params.signatureType || 'type',
  });

  if (error) {
    if (error.message.includes('not found') || error.message.includes('already accepted') || error.message.includes('at least one item')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to accept change order', error);
  }

  return data;
}

/**
 * Record a payment and update invoice balance/status atomically.
 * Optionally marks a payment request as paid.
 */
export async function recordPaymentWithInvoiceUpdate(params: {
  invoiceId: string;
  dealId: string;
  companyId: string;
  userId: string;
  amount: number;
  receivedAt: string;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  paymentRequestId?: string | null;
}): Promise<RecordPaymentResult> {
  const { data, error } = await supabase.rpc('record_payment_with_invoice_update', {
    p_invoice_id: params.invoiceId,
    p_deal_id: params.dealId,
    p_company_id: params.companyId,
    p_user_id: params.userId,
    p_amount: params.amount,
    p_received_at: params.receivedAt,
    p_method: params.method || null,
    p_reference: params.reference || null,
    p_note: params.note || null,
    p_payment_request_id: params.paymentRequestId || null,
  });

  if (error) {
    if (error.message.includes('not found') || error.message.includes('does not belong') || error.message.includes('already marked as paid')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to record payment', error);
  }

  return data;
}

/**
 * Create an invoice with line items atomically.
 */
export async function createInvoiceWithItems(params: {
  companyId: string;
  dealId: string;
  quoteId?: string | null;
  invoiceNumber?: string | null;
  title?: string | null;
  status?: string;
  issueDate?: string | null;
  dueDate?: string | null;
  lineItems: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit_price?: number;
    unitPrice?: number;
    position?: number;
  }>;
}): Promise<CreateInvoiceWithItemsResult> {
  const { data, error } = await supabase.rpc('create_invoice_with_items', {
    p_company_id: params.companyId,
    p_deal_id: params.dealId,
    p_quote_id: params.quoteId || null,
    p_invoice_number: params.invoiceNumber || null,
    p_title: params.title || null,
    p_status: params.status || 'unpaid',
    p_issue_date: params.issueDate || null,
    p_due_date: params.dueDate || null,
    p_line_items: JSON.stringify(params.lineItems || []),
  });

  if (error) {
    throw new DatabaseError('Failed to create invoice with items', error);
  }

  return data;
}

// ============================================================================
// CONTACT TRANSACTIONAL RPC FUNCTIONS
// ============================================================================

/**
 * Create a contact with addresses atomically.
 * If address creation fails, contact creation is rolled back.
 */
export async function createContactWithAddresses(params: {
  companyId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  addresses?: Array<{
    address_line1?: string;
    addressLine1?: string;
    address_line2?: string | null;
    addressLine2?: string | null;
    city?: string;
    state?: string;
    postal_code?: string;
    postalCode?: string;
    country?: string | null;
    is_primary?: boolean;
    isPrimary?: boolean;
  }>;
}): Promise<CreateContactWithAddressesResult> {
  const { data, error } = await supabase.rpc('create_contact_with_addresses', {
    p_company_id: params.companyId,
    p_first_name: params.firstName,
    p_last_name: params.lastName || null,
    p_email: params.email || null,
    p_phone: params.phone || null,
    p_notes: params.notes || null,
    p_addresses: params.addresses || [],
  });

  if (error) {
    if (error.message.includes('is required')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to create contact with addresses', error);
  }

  return data;
}

/**
 * Update a contact and manage its addresses atomically.
 * Supports adding new addresses and updating existing ones.
 */
export async function updateContactWithAddresses(params: {
  contactId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  addresses?: Array<{
    id?: string;
    address_line1?: string;
    addressLine1?: string;
    address_line2?: string | null;
    addressLine2?: string | null;
    city?: string;
    state?: string;
    postal_code?: string;
    postalCode?: string;
    country?: string | null;
    is_primary?: boolean;
    isPrimary?: boolean;
  }> | null;
}): Promise<UpdateContactWithAddressesResult> {
  const { data, error } = await supabase.rpc('update_contact_with_addresses', {
    p_contact_id: params.contactId,
    p_first_name: params.firstName || null,
    p_last_name: params.lastName,
    p_email: params.email,
    p_phone: params.phone,
    p_notes: params.notes,
    p_addresses: params.addresses || null,
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to update contact with addresses', error);
  }

  return data;
}

/**
 * Add multiple addresses to a contact atomically.
 * If any address creation fails, all are rolled back.
 */
export async function addAddressesToContact(params: {
  contactId: string;
  addresses: Array<{
    address_line1?: string;
    addressLine1?: string;
    address_line2?: string | null;
    addressLine2?: string | null;
    city?: string;
    state?: string;
    postal_code?: string;
    postalCode?: string;
    country?: string | null;
    is_primary?: boolean;
    isPrimary?: boolean;
  }>;
}): Promise<AddAddressesToContactResult> {
  const { data, error } = await supabase.rpc('add_addresses_to_contact', {
    p_contact_id: params.contactId,
    p_addresses: params.addresses,
  });

  if (error) {
    if (error.message.includes('not found') || error.message.includes('is required')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to add addresses to contact', error);
  }

  return data;
}

// ============================================================================
// SEEDING TRANSACTIONAL RPC FUNCTIONS
// ============================================================================

/**
 * Seed drip sequences with steps atomically for a company.
 * If any step fails, all sequences and steps are rolled back.
 */
export async function seedDripSequencesForCompany(params: {
  companyId: string;
  sequences: Array<{
    pipeline_id: string;
    stage_id: string;
    name: string;
    is_enabled: boolean;
    steps: Array<{
      position: number;
      delay_type: string;
      delay_value: number;
      delay_unit: string;
      channel: string;
      email_subject?: string | null;
      email_body?: string | null;
      sms_body?: string | null;
    }>;
  }>;
}): Promise<SeedDripSequencesResult> {
  const { data, error } = await supabase.rpc('seed_drip_sequences_for_company', {
    p_company_id: params.companyId,
    p_sequences: JSON.stringify(params.sequences),
  });

  if (error) {
    if (error.message.includes('is required')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to seed drip sequences', error);
  }

  return data;
}

/**
 * Seed communication templates atomically for a company.
 * If any template fails, all are rolled back.
 */
export async function seedCommunicationTemplatesForCompany(params: {
  companyId: string;
  templates: Array<{
    template_key: string;
    name: string;
    description: string;
    email_subject: string;
    email_body: string;
    sms_body: string;
  }>;
}): Promise<SeedCommunicationTemplatesResult> {
  const { data, error } = await supabase.rpc('seed_communication_templates_for_company', {
    p_company_id: params.companyId,
    p_templates: JSON.stringify(params.templates),
  });

  if (error) {
    if (error.message.includes('is required')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to seed communication templates', error);
  }

  return data;
}

/**
 * Seed product templates atomically for a company.
 * If any template fails, all are rolled back.
 */
export async function seedProductTemplatesForCompany(params: {
  companyId: string;
  createdByUserId?: string | null;
  templates: Array<{
    name: string;
    description?: string | null;
    type: string;
  }>;
}): Promise<SeedProductTemplatesResult> {
  const { data, error } = await supabase.rpc('seed_product_templates_for_company', {
    p_company_id: params.companyId,
    p_created_by_user_id: params.createdByUserId || null,
    p_templates: JSON.stringify(params.templates),
  });

  if (error) {
    if (error.message.includes('is required')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to seed product templates', error);
  }

  return data;
}

/**
 * Seed deal sources atomically for a company using upsert.
 * If any source fails, all are rolled back.
 */
export async function seedDealSourcesForCompany(params: {
  companyId: string;
  createdByUserId?: string | null;
  sources: Array<{
    name: string;
    is_default?: boolean;
  }>;
}): Promise<SeedDealSourcesResult> {
  const { data, error } = await supabase.rpc('seed_deal_sources_for_company', {
    p_company_id: params.companyId,
    p_created_by_user_id: params.createdByUserId || null,
    p_sources: JSON.stringify(params.sources),
  });

  if (error) {
    if (error.message.includes('is required')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to seed deal sources', error);
  }

  return data;
}

// ============================================================================
// WORKFLOW TRANSACTIONAL RPC FUNCTIONS
// ============================================================================

/**
 * Update quote status and deal stage atomically after sending.
 * Only updates if quote is not already accepted.
 */
export async function updateQuoteAndDealAfterSend(params: {
  quoteId: string;
  dealId: string;
  newQuoteStatus?: string;
  newDealStage?: string;
}): Promise<UpdateQuoteAndDealAfterSendResult> {
  const { data, error } = await supabase.rpc('update_quote_and_deal_after_send', {
    p_quote_id: params.quoteId,
    p_deal_id: params.dealId,
    p_new_quote_status: params.newQuoteStatus || 'sent',
    p_new_deal_stage: params.newDealStage || 'proposals_sent',
  });

  if (error) {
    if (error.message.includes('not found') || error.message.includes('does not belong')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to update quote and deal after send', error);
  }

  return data;
}

/**
 * Update payment request status atomically after sending.
 * Only updates if status is 'created'.
 */
export async function updatePaymentRequestAfterSend(params: {
  requestId: string;
  sentViaEmail?: boolean;
  sentViaText?: boolean;
}): Promise<UpdatePaymentRequestAfterSendResult> {
  const { data, error } = await supabase.rpc('update_payment_request_after_send', {
    p_request_id: params.requestId,
    p_sent_via_email: params.sentViaEmail || false,
    p_sent_via_text: params.sentViaText || false,
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to update payment request after send', error);
  }

  return data;
}

/**
 * Update payment receipt_sent_at timestamp atomically.
 */
export async function updatePaymentReceiptSent(params: {
  paymentId: string;
}): Promise<UpdatePaymentReceiptSentResult> {
  const { data, error } = await supabase.rpc('update_payment_receipt_sent', {
    p_payment_id: params.paymentId,
  });

  if (error) {
    if (error.message.includes('not found')) {
      throw new DatabaseError(error.message, error);
    }
    throw new DatabaseError('Failed to update payment receipt sent timestamp', error);
  }

  return data;
}
