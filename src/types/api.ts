/**
 * Shared API Type Definitions
 *
 * This file contains common types used across the API layer to ensure
 * type safety and consistency. Types are organized by domain.
 */

// ============================================================================
// BASE ENTITY TYPES
// ============================================================================

/**
 * Base entity with common timestamp fields
 */
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface User extends BaseEntity {
  email: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  current_company_id?: string | null;
}

// ============================================================================
// COMPANY TYPES
// ============================================================================

export interface Company extends BaseEntity {
  user_id: string;
  name: string;
  email?: string | null;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  employee_count?: number | null;
  phone_number?: string | null;
  website?: string | null;
  openphone_api_key?: string | null;
  openphone_phone_number_id?: string | null;
  openphone_phone_number?: string | null;
  openphone_enabled: boolean;
}

export interface CompanyMember extends BaseEntity {
  company_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'member' | 'sales';
  status?: 'active' | 'invited' | null;
}

export interface CompanyEmailSettings extends BaseEntity {
  company_id: string;
  reply_email?: string | null;
  bcc_email?: string | null;
  provider?: string | null;
  provider_account_email?: string | null;
  provider_account_id?: string | null;
  connected_at?: string | null;
  status?: string | null;
  status_error?: string | null;
  last_synced_at?: string | null;
}

export interface CompanyBranding extends BaseEntity {
  company_id: string;
  website?: string | null;
  review_url?: string | null;
  logo_storage_key?: string | null;
}

export interface CompanySettings extends BaseEntity {
  company_id: string;
  business_hours?: BusinessHours | null;
}

export interface BusinessHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed?: boolean;
}

// ============================================================================
// CONTACT TYPES
// ============================================================================

export interface Contact extends BaseEntity {
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface ContactAddress extends BaseEntity {
  contact_id: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country?: string | null;
  is_primary: boolean;
}

export interface ContactWithAddresses extends Contact {
  addresses: ContactAddress[];
}

// ============================================================================
// DEAL TYPES
// ============================================================================

export interface Deal extends BaseEntity {
  company_id: string;
  contact_id?: string | null;
  contact_address_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
  lead_source?: string | null;
  salesperson?: string | null;
  project_manager?: string | null;
  assigned_to?: string | null;
  crew_id?: string | null;
  disable_drips: boolean;
  archived_at?: string | null;
  service_address?: ContactAddress | null;
}

export interface DealWithRelations extends Deal {
  contact?: ContactWithAddresses | null;
  service_address?: ContactAddress | null;
  latest_appointment?: Appointment | null;
}

export interface DealNote extends BaseEntity {
  deal_id: string;
  company_id: string;
  user_id: string;
  content: string;
}

export interface DealAttachment extends BaseEntity {
  deal_id: string;
  company_id: string;
  file_name: string;
  file_type: string;
  storage_key: string;
  file_size?: number | null;
}

// ============================================================================
// APPOINTMENT TYPES
// ============================================================================

export interface Appointment extends BaseEntity {
  company_id: string;
  deal_id: string;
  assigned_to?: string | null;
  crew_id?: string | null;
  event_color?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  appointment_notes?: string | null;
  send_email: boolean;
  send_sms: boolean;
}

export interface AppointmentWithDeal extends Appointment {
  deal: DealForAppointment;
}

export interface DealForAppointment {
  id: string;
  contact_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
  salesperson?: string | null;
  assigned_to?: string | null;
  event_color?: string | null;
  contact?: ContactBasic | null;
}

export interface ContactBasic {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
}

// ============================================================================
// QUOTE TYPES
// ============================================================================

export interface Quote extends BaseEntity {
  company_id: string;
  deal_id: string;
  quote_number: string;
  title?: string | null;
  status: string;
  public_share_id?: string | null;
  acceptance_signature?: string | null;
  acceptance_signed_at?: string | null;
}

export interface QuoteLineItem extends BaseEntity {
  quote_id: string;
  change_order_id?: string | null;
  is_change_order: boolean;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  position: number;
}

export interface QuoteWithLineItems extends Quote {
  line_items: QuoteLineItem[];
}

export interface QuoteWithRelations extends QuoteWithLineItems {
  company?: Company;
  deal?: DealWithContact;
}

export interface DealWithContact extends Deal {
  contact?: Contact | null;
  service_address?: ContactAddress | null;
}

// ============================================================================
// INVOICE TYPES
// ============================================================================

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export interface Invoice extends BaseEntity {
  company_id: string;
  deal_id: string;
  quote_id?: string | null;
  invoice_number: string;
  title?: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  total_amount: number;
  balance_due: number;
  public_share_id?: string | null;
}

export interface InvoiceLineItem extends BaseEntity {
  invoice_id: string;
  change_order_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  position: number;
}

export interface InvoiceWithLineItems extends Invoice {
  line_items: InvoiceLineItem[];
}

export interface InvoiceWithRelations extends InvoiceWithLineItems {
  company?: Company;
  deal?: DealWithContact;
}

export interface InvoicePayment extends BaseEntity {
  company_id: string;
  deal_id: string;
  invoice_id: string;
  received_by_user_id: string;
  amount: number;
  received_at: string;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  receipt_sent_at?: string | null;
}

export type PaymentRequestStatus = 'created' | 'sent' | 'viewed' | 'paid' | 'cancelled';

export interface InvoicePaymentRequest extends BaseEntity {
  company_id: string;
  deal_id: string;
  invoice_id: string;
  requested_by_user_id?: string | null;
  amount: number;
  status: PaymentRequestStatus;
  note?: string | null;
  public_share_id?: string | null;
  sent_at?: string | null;
  sent_via_email?: boolean;
  sent_via_text?: boolean;
  viewed_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
}

// ============================================================================
// CHANGE ORDER TYPES
// ============================================================================

export type ChangeOrderStatus = 'pending' | 'accepted';

export type SignatureType = 'type' | 'draw';

export interface ChangeOrder extends BaseEntity {
  company_id: string;
  deal_id: string;
  quote_id?: string | null;
  invoice_id?: string | null;
  change_order_number: string;
  status: ChangeOrderStatus;
  signer_name?: string | null;
  signer_email?: string | null;
  signature_text?: string | null;
  signature_type?: SignatureType | null;
  accepted_at?: string | null;
}

export interface ChangeOrderWithItems extends ChangeOrder {
  items: QuoteLineItem[];
}

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

export interface CommunicationTemplate extends BaseEntity {
  company_id: string;
  template_key: string;
  subject?: string | null;
  body: string;
  is_active: boolean;
}

export interface ProductTemplate extends BaseEntity {
  company_id: string;
  name: string;
  description?: string | null;
  default_price?: number | null;
  default_quantity?: number | null;
  position?: number | null;
}

export interface ProposalAttachment extends BaseEntity {
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
}

// ============================================================================
// CREW TYPES
// ============================================================================

export interface Crew extends BaseEntity {
  company_id: string;
  name: string;
}

// ============================================================================
// DRIP SEQUENCE TYPES
// ============================================================================

export interface DripSequence extends BaseEntity {
  company_id: string;
  pipeline_id: string;
  name: string;
}

// ============================================================================
// PIPELINE TYPES
// ============================================================================

export interface Pipeline extends BaseEntity {
  company_id: string;
  name: string;
  is_default: boolean;
}

export interface PipelineStage extends BaseEntity {
  pipeline_id: string;
  name: string;
  key: string;
  position: number;
  color?: string | null;
}

// ============================================================================
// RPC RESPONSE TYPES
// These types represent the shape of data returned from Supabase RPC functions
// ============================================================================

/**
 * Dashboard data returned from get_dashboard_data RPC
 */
export interface DashboardData {
  deals: DashboardDeal[];
  quotes: DashboardQuote[];
  dripSequences: DashboardDripSequence[];
}

export interface DashboardDeal {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
  lead_source?: string | null;
  created_at: string;
  updated_at: string;
  contact?: ContactWithAddresses | null;
  service_address?: ContactAddress | null;
  latest_appointment?: Appointment | null;
}

export interface DashboardQuote {
  id: string;
  deal_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  line_items?: QuoteLineItem[];
}

export interface DashboardDripSequence {
  id: string;
  company_id: string;
  pipeline_id: string;
  name: string;
  created_at: string;
}

/**
 * User auth context returned from get_user_auth_context RPC
 */
export interface UserAuthContext {
  user: User | null;
  organizations: UserOrganization[];
  company: Company | null;
  member: CompanyMember | null;
  companyMembers: CompanyMember[];
}

export interface UserOrganization {
  companyId: string;
  companyName: string;
  role: string;
}

/**
 * Public quote share data returned from get_public_quote_share RPC
 */
export interface PublicQuoteShare {
  quote: PublicQuoteData;
  company: Company;
  customer: CustomerInfo;
  propertyAddress?: string | null;
  changeOrders: ChangeOrderWithItems[];
  invoiceForQuote: Invoice | null;
}

export interface PublicQuoteData {
  id: string;
  quote_number: string;
  title?: string | null;
  status: string;
  line_items: QuoteLineItem[];
  acceptance_signature?: string | null;
  acceptance_signed_at?: string | null;
}

export interface CustomerInfo {
  name: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * Quote acceptance result from accept_quote_with_invoice RPC
 */
export interface QuoteAcceptanceResult {
  status: string;
  signature: string;
  signatureType?: 'type' | 'draw';
  signedAt: string;
  invoiceId: string | null;
}

/**
 * Quote send context from get_quote_send_context RPC
 */
export interface QuoteSendContext {
  quote: QuoteSendData;
  deal: DealSendData;
}

export interface QuoteSendData {
  id: string;
  deal_id: string;
  company_id: string;
  quote_number: string;
  title?: string | null;
  status: string;
}

export interface DealSendData {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
}

/**
 * Invoice detail from get_invoice_detail RPC
 */
export interface InvoiceDetail {
  invoice: Invoice;
  deal: Deal;
  quote: Quote | null;
  payments: InvoicePayment[];
  paymentRequests: InvoicePaymentRequest[];
  lineItems: InvoiceLineItem[];
  emailSettings: EmailSettingsData;
  openphoneSettings: OpenPhoneSettingsData;
}

export interface EmailSettingsData {
  provider_account_email?: string | null;
  reply_email?: string | null;
  bcc_email?: string | null;
}

export interface OpenPhoneSettingsData {
  openphone_api_key?: string | null;
  openphone_phone_number_id?: string | null;
  openphone_phone_number?: string | null;
  openphone_enabled?: boolean;
}

/**
 * Invoice send context from get_invoice_send_context RPC
 */
export interface InvoiceSendContext {
  invoice: Invoice;
  emailSettings: EmailSettingsData;
  openphoneSettings: OpenPhoneSettingsData;
}

/**
 * Payment request send context from get_payment_request_send_context RPC
 */
export interface PaymentRequestSendContext {
  paymentRequest: InvoicePaymentRequest;
  emailSettings: EmailSettingsData;
  openphoneSettings: OpenPhoneSettingsData;
}

/**
 * Lightweight drip sequence metadata for deal detail page
 * Only includes data needed for UI indicators (not full step content)
 */
export interface DripSequenceMeta {
  stage_id: string;
  is_enabled: boolean;
  step_count: number;
}

/**
 * Deal detail from get_deal_detail RPC
 */
export interface DealDetail {
  deal: DealWithRelations;
  quotes: QuoteWithLineItems[];
  invoices: Invoice[];
  appointments: Appointment[];
  notes: DealNote[];
  changeOrders: ChangeOrderWithItems[];
  proposalAttachments: ProposalAttachment[];
  dripSequencesMeta: DripSequenceMeta[];
}

/**
 * Deal proposal data from get_deal_proposal_data RPC
 */
export interface DealProposalData {
  deal: DealWithRelations;
  quote: QuoteWithLineItems | null;
  attachments: ProposalAttachment[];
  quoteCount: number;
  proposalTemplate: CommunicationTemplate | null;
  workOrderTemplate: CommunicationTemplate | null;
  changeOrderTemplate: CommunicationTemplate | null;
  productTemplates: ProductTemplate[];
  quoteCompanyBranding: CompanyBranding | null;
  companySettings: CompanySettings | null;
  invoiceForQuote: Invoice | null;
}

/**
 * Create company with member result from create_company_with_member RPC
 */
export interface CreateCompanyWithMemberResult {
  company: {
    id: string;
    user_id: string;
    name: string;
    email?: string | null;
    owner_first_name?: string | null;
    owner_last_name?: string | null;
    employee_count?: string | null;
    phone_number?: string | null;
    website?: string | null;
  };
  member: {
    id: string;
    company_id: string;
    user_id: string;
    role: string;
  };
}

/**
 * Minimal response from create_or_update_quote_with_items RPC
 */
export interface CreateOrUpdateQuoteResult {
  success: boolean;
  id: string;
  quote_number: string;
  public_share_id: string | null;
  is_new: boolean;
  new_line_items: Array<{ id: string; client_id: string }>;
}

/**
 * Create or update change order result from create_or_update_change_order_with_items RPC
 */
export interface CreateOrUpdateChangeOrderResult {
  change_order: ChangeOrder;
  items: QuoteLineItem[];
}

/**
 * Accept change order result from accept_change_order_with_invoice RPC
 */
export interface AcceptChangeOrderResult {
  changeOrderId: string;
  invoiceId: string;
  delta: number;
  newInvoiceTotal: number;
  newInvoiceBalance: number;
  newInvoiceStatus: string;
  acceptedAt: string;
}

/**
 * Record payment result from record_payment_with_invoice_update RPC
 */
export interface RecordPaymentResult {
  paymentId: string;
  invoiceId: string;
  amount: number;
  totalPaid: number;
  newBalance: number;
  newStatus: string;
  paymentRequestMarkedPaid: boolean;
  invoiceMarkedPaid: boolean;
}

/**
 * Create invoice with items result from create_invoice_with_items RPC
 */
export interface CreateInvoiceWithItemsResult {
  invoice: Invoice;
  line_items: InvoiceLineItem[];
}

/**
 * Result of creating a contact with addresses atomically
 */
export interface CreateContactWithAddressesResult {
  contact: Contact;
  addresses: ContactAddress[];
}

/**
 * Result of updating a contact with addresses atomically
 */
export interface UpdateContactWithAddressesResult {
  contact: Contact;
  addresses: ContactAddress[];
}

/**
 * Result of adding addresses to a contact atomically
 */
export interface AddAddressesToContactResult {
  contact_id: string;
  addresses: ContactAddress[];
}

// ============================================================================
// SEEDING RESULT TYPES
// ============================================================================

/**
 * Result of seeding drip sequences for a company
 */
export interface SeedDripSequencesResult {
  insertedSequences: number;
  skipped: boolean;
}

/**
 * Result of seeding communication templates for a company
 */
export interface SeedCommunicationTemplatesResult {
  insertedTemplates: number;
  skipped: boolean;
}

/**
 * Result of seeding product templates for a company
 */
export interface SeedProductTemplatesResult {
  insertedTemplates: number;
  skipped: boolean;
}

/**
 * Result of seeding deal sources for a company
 */
export interface SeedDealSourcesResult {
  upsertedSources: number;
}

// ============================================================================
// WORKFLOW RESULT TYPES
// ============================================================================

/**
 * Result of updating quote and deal after send
 */
export interface UpdateQuoteAndDealAfterSendResult {
  quoteStatus: string;
  dealStage: string;
  quoteUpdated: boolean;
  dealUpdated: boolean;
  message?: string;
}

/**
 * Result of updating payment request after send
 */
export interface UpdatePaymentRequestAfterSendResult {
  requestId: string;
  status: string;
  sentAt?: string;
  sentViaEmail?: boolean;
  sentViaText?: boolean;
  updated: boolean;
  message?: string;
}

/**
 * Result of updating payment receipt sent timestamp
 */
export interface UpdatePaymentReceiptSentResult {
  paymentId: string;
  receiptSentAt: string;
  updated: boolean;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * PostgreSQL error structure from Supabase
 */
export interface PostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

/**
 * Database error with original error context
 */
export interface DatabaseErrorContext {
  message: string;
  originalError?: PostgrestError;
}

// ============================================================================
// OPENPHONE TYPES
// ============================================================================

export interface OpenPhoneNumber {
  id: string;
  phoneNumber: string;
  name?: string | null;
  type?: string | null;
}

export interface OpenPhoneSettings {
  openphone_api_key?: string | null;
  openphone_phone_number_id?: string | null;
  openphone_phone_number?: string | null;
  openphone_enabled?: boolean;
}

// ============================================================================
// GOOGLE CALENDAR TYPES
// ============================================================================

export interface GoogleCalendarToken extends BaseEntity {
  company_id: string;
  user_id: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  calendar_id?: string | null;
}

// ============================================================================
// DEAL SOURCE TYPES
// ============================================================================

export interface DealSource extends BaseEntity {
  company_id: string;
  name: string;
  is_active: boolean;
  position?: number | null;
}
