import { isPostmarkConfigured, sendProposalEmail } from '../lib/postmark';
import { sendOpenPhoneMessage } from '../lib/openphone';
import { getEmailContextForCompany } from './notification-service';
import { formatSmsRecipient } from '../utils/formatting';
import { getSmsSettingsForCompany } from './communication-service';

/**
 * Type definitions for appointment service
 */
export type AppointmentCommunications = {
  email?: { to: string; subject: string; body: string };
  sms?: { to: string; body: string };
};

export type CommunicationResult = {
  sentEmail: boolean;
  sentSms: boolean;
  errors: string[];
};

/**
 * Send appointment confirmation email
 */
export async function sendAppointmentEmail(params: {
  companyId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (!isPostmarkConfigured) {
    throw new Error('Email sending is not configured yet.');
  }

  const { fromEmail, replyTo, bcc } = await getEmailContextForCompany(params.companyId);

  if (!fromEmail) {
    throw new Error('Provide a From email in company email settings or POSTMARK_FROM_EMAIL.');
  }

  await sendProposalEmail({
    fromEmail,
    to: params.to,
    cc: null,
    bcc,
    replyTo,
    subject: params.subject,
    body: params.body,
  });
}

/**
 * Send appointment confirmation SMS
 */
export async function sendAppointmentSms(params: {
  companyId: string;
  to: string;
  body: string;
}): Promise<void> {
  const recipient = typeof params.to === 'string' ? params.to.trim() : '';
  const messageBody = typeof params.body === 'string' ? params.body.trim() : '';

  if (!recipient || !messageBody) {
    throw new Error('SMS delivery requires recipient and message body.');
  }

  const formattedRecipient = formatSmsRecipient(recipient);

  if (!formattedRecipient) {
    throw new Error('Provide a valid SMS recipient (e.g., +15551234567 or a 10-11 digit US/CA number).');
  }

  const phoneSettings = await getSmsSettingsForCompany(params.companyId);

  if (!phoneSettings?.openphone_enabled || !phoneSettings?.openphone_api_key) {
    const err = new Error('OpenPhone is not configured for this company.') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const fromValue =
    phoneSettings.openphone_phone_number_id?.trim() ||
    phoneSettings.openphone_phone_number?.trim() ||
    '';

  if (!fromValue) {
    const err = new Error('OpenPhone phone number is not configured.') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  await sendOpenPhoneMessage({
    apiKey: phoneSettings.openphone_api_key,
    from: fromValue,
    to: formattedRecipient,
    content: messageBody,
  });
}

/**
 * Deliver appointment communications (email and/or SMS)
 * This is the main business logic for sending appointment confirmations
 */
export async function deliverAppointmentCommunications(params: {
  companyId: string;
  communications?: AppointmentCommunications;
  sendEmail: boolean;
  sendSms: boolean;
}): Promise<CommunicationResult> {
  const { companyId, communications, sendEmail, sendSms } = params;
  const result: CommunicationResult = {
    sentEmail: false,
    sentSms: false,
    errors: [],
  };

  if (sendEmail && communications?.email) {
    try {
      await sendAppointmentEmail({
        companyId,
        to: communications.email.to.trim(),
        subject: communications.email.subject.trim(),
        body: communications.email.body.trim(),
      });
      result.sentEmail = true;
    } catch (error) {
      console.error('Failed to send appointment email', error);
      result.errors.push((error as Error)?.message ?? 'Failed to send appointment email.');
    }
  }

  if (sendSms && communications?.sms) {
    try {
      await sendAppointmentSms({
        companyId,
        to: communications.sms.to.trim(),
        body: communications.sms.body.trim(),
      });
      result.sentSms = true;
    } catch (error) {
      console.error('Failed to send appointment SMS', error);
      result.errors.push((error as Error)?.message ?? 'Failed to send appointment SMS.');
    }
  }

  return result;
}
