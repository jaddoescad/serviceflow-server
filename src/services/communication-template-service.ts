import * as RpcRepository from '../repositories/rpc-repository';

export type DefaultCommunicationTemplate = {
  template_key:
    | 'appointment_confirmation'
    | 'proposal_quote'
    | 'invoice_send'
    | 'invoice_payment_request'
    | 'payment_receipt'
    | 'work_order_dispatch'
    | 'change_order_send'
    | 'job_schedule';
  name: string;
  description: string;
  email_subject: string;
  email_body: string;
  sms_body: string;
};

export const DEFAULT_COMMUNICATION_TEMPLATES: DefaultCommunicationTemplate[] = [
  {
    template_key: 'appointment_confirmation',
    name: 'Appointment Confirmation',
    description:
      'Templates used when emailing or texting appointment confirmations or reschedules. Include {{appointment_button}} if you share a calendar link.',
    email_subject: 'Appointment scheduled with {company-name}',
    email_body:
      'Hi {first-name},\n\nYour appointment with {company-name} is scheduled for {job-date} at {job-time}.\nIf you need to reschedule, call {company-phone} or visit {company-website}.\n\nThanks,\n{company-name}',
    sms_body: 'Appointment with {company-name} on {job-date} at {job-time}. Questions? {company-phone}',
  },
  {
    template_key: 'proposal_quote',
    name: 'Proposal Delivery',
    description:
      'Templates used when emailing or texting a proposal to a customer. Include {{proposal_button}} where the proposal link/button should appear.',
    email_subject: '{company-name} proposal for {customer-name}',
    email_body:
      'Hi {first-name},\n\nYour proposal from {company-name} is ready.\n{proposal_button}\n\nIf you have questions, call {company-phone} or visit {company-website}.\n\nThank you,\n{company-name}',
    sms_body: 'Proposal from {company-name}: {proposal_button}',
  },
  {
    template_key: 'invoice_send',
    name: 'Invoice Delivery',
    description:
      'Templates used when emailing or texting an invoice to a customer. Include {{invoice_button}} where the invoice link/button should appear.',
    email_subject: 'Invoice {invoice-number} from {company-name}',
    email_body:
      "Hi {first-name},\n\nHere's invoice {invoice-number} from {company-name}.\n{invoice_button}\n\nIf anything looks off, call {company-phone}. We appreciate your business.\n\n{company-name} | {company-website}",
    sms_body: 'Invoice {invoice-number} from {company-name}: {invoice_button}',
  },
  {
    template_key: 'invoice_payment_request',
    name: 'Invoice Payment Request',
    description:
      'Templates used when requesting a payment or deposit. Include {{invoice_button}} where the invoice link/button should appear and {{payment_amount}} for the requested amount.',
    email_subject: 'Payment request for invoice {invoice-number} – {company-name}',
    email_body:
      'Hi {first-name},\n\nA payment of {payment-amount} is requested for your project with {company-name}.\n{invoice_button}\n\nIf you need help, call {company-phone}.',
    sms_body: 'Payment of {payment-amount} requested by {company-name}. {invoice_button}',
  },
  {
    template_key: 'payment_receipt',
    name: 'Payment Receipt',
    description:
      'Templates used when emailing or texting a receipt after a payment is recorded. Include {{invoice_button}} for the receipt/invoice link.',
    email_subject: 'Receipt for invoice {invoice-number} – {company-name}',
    email_body:
      'Hi {first-name},\n\nWe received {payment-amount} for invoice {invoice-number}.\n{invoice_button}\n\nThank you for choosing {company-name}. If you need anything, reach us at {company-phone} or {company-website}.',
    sms_body: 'Receipt: {payment-amount} received for invoice {invoice-number}. Thank you, {company-name}.',
  },
  {
    template_key: 'work_order_dispatch',
    name: 'Work Order Dispatch',
    description:
      'Templates used when emailing or texting a work order to crew members. Include {{work_order_button}} where the work order link should appear.',
    email_subject: 'Work order for {customer-name} - {company-name}',
    email_body:
      "Team,\n\nHere's the work order for {customer-name}.\n{work_order_button}\n\nSite contact: {first-name} {last-name}\nAddress: {work-order-address}\n\nQuestions? Call {company-phone}.",
    sms_body: 'Work order from {company-name}: {work_order_button}',
  },
  {
    template_key: 'change_order_send',
    name: 'Change Order',
    description:
      'Templates used when emailing or texting a change order to a customer. Include {{change_order_button}} where the change order link/button should appear.',
    email_subject: 'Change order {change-order-number} from {company-name}',
    email_body:
      'Hi {first-name},\n\nPlease review and approve change order {change-order-number} for {customer-name}.\n{change_order_button}\n\nIf you have questions, call {company-phone} or visit {company-website}.',
    sms_body: 'Change order {change-order-number}: {change_order_button}',
  },
  {
    template_key: 'job_schedule',
    name: 'Job Schedule',
    description:
      'Templates used when emailing or texting a scheduled job to a customer. Include {{work_order_button}} if you share a work order link.',
    email_subject: 'Your job is scheduled with {company-name}',
    email_body:
      'Hi {client-name},\n\nYour job is scheduled for {job-date} at {job-time}.\nAddress: {job-address}\n\nIf you need to reschedule, reply to this email.',
    sms_body: 'Your job is scheduled for {job-date} at {job-time}. {job-address}',
  },
];

/**
 * Seed default communication templates for a company atomically.
 * If any template fails, all are rolled back.
 */
export const seedDefaultCommunicationTemplatesForCompany = async (
  companyId: string,
) => {
  if (!companyId) {
    throw new Error('companyId is required to seed communication templates');
  }

  // Use atomic RPC function to seed all templates in a single transaction
  const result = await RpcRepository.seedCommunicationTemplatesForCompany({
    companyId,
    templates: DEFAULT_COMMUNICATION_TEMPLATES,
  });

  return result;
};
