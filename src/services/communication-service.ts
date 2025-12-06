import { sendProposalEmail, isPostmarkConfigured, stripButtonMarkers } from '../lib/postmark';
import { sendOpenPhoneMessage } from '../lib/openphone';
import { formatSmsRecipient } from '../utils/formatting';
import { getEmailContextForCompany } from './notification-service';
import * as CompanyRepository from '../repositories/company-repository';
import { AppError } from '../lib/errors';

/**
 * Communication Service
 * Handles business logic for sending communications (email and SMS)
 */

/**
 * Get SMS settings for a company
 */
export const getSmsSettingsForCompany = async (companyId: string) => {
  return await CompanyRepository.getCompanyOpenPhoneSettings(companyId);
};

/**
 * Configuration result type
 */
type CommunicationConfigResult = {
  emailContext?: Awaited<ReturnType<typeof getEmailContextForCompany>>;
  smsConfig?: { apiKey: string; from: string };
};

/**
 * Ensure communication channels are properly configured
 * This validates that the required channels (email/SMS) are set up for the company
 */
export const ensureCommunicationChannelsConfigured = async (params: {
  companyId: string;
  requireEmail: boolean;
  requireSms: boolean;
}): Promise<CommunicationConfigResult> => {
  const { companyId, requireEmail, requireSms } = params;
  const result: CommunicationConfigResult = {};

  if (requireEmail) {
    if (!isPostmarkConfigured) {
      throw new CommunicationError('Email sending is not configured yet.');
    }

    const emailContext = await getEmailContextForCompany(companyId);

    if (!emailContext.fromEmail) {
      throw new CommunicationError('Provide a From email in company email settings or POSTMARK_FROM_EMAIL.');
    }

    result.emailContext = emailContext;
  }

  if (requireSms) {
    const phoneSettings = await getSmsSettingsForCompany(companyId);

    if (!phoneSettings?.openphone_enabled || !phoneSettings?.openphone_api_key) {
      throw new CommunicationError('OpenPhone is not configured for this company.');
    }

    const fromValue =
      phoneSettings.openphone_phone_number_id?.trim() ||
      phoneSettings.openphone_phone_number?.trim() ||
      '';

    if (!fromValue) {
      throw new CommunicationError('OpenPhone phone number is not configured.');
    }

    result.smsConfig = {
      apiKey: phoneSettings.openphone_api_key,
      from: fromValue,
    };
  }

  return result;
};

/**
 * Type definitions for communication service
 */
export type EmailParams = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
};

export type SmsParams = {
  to: string;
  body: string;
};

export type CommunicationMethod = 'email' | 'text' | 'both';

export type CommunicationParams = {
  companyId: string;
  method: CommunicationMethod;
  email?: EmailParams;
  sms?: SmsParams;
};

export type CommunicationResult = {
  sentEmail: boolean;
  sentSms: boolean;
};

/**
 * Communication-specific error that extends AppError for global error handling
 */
export class CommunicationError extends AppError {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode);
  }
}

/**
 * Send an email using company email settings
 *
 * @throws {CommunicationError} If email is not configured or sending fails
 */
export async function sendEmail(params: {
  companyId: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
}): Promise<void> {
  const { companyId, to, subject, body, cc } = params;

  // Validate inputs
  if (!to || !subject || !body) {
    throw new CommunicationError('Email recipient, subject, and body are required.');
  }

  // Get email configuration
  const communicationConfig = await ensureCommunicationChannelsConfigured({
    companyId,
    requireEmail: true,
    requireSms: false,
  });

  if (!communicationConfig.emailContext) {
    throw new CommunicationError('Email configuration not found.', 500);
  }

  // Send email
  try {
    await sendProposalEmail({
      fromEmail: communicationConfig.emailContext.fromEmail ?? undefined,
      to,
      cc,
      bcc: communicationConfig.emailContext.bcc ?? undefined,
      replyTo: communicationConfig.emailContext.replyTo ?? undefined,
      subject,
      body,
    });
  } catch (error) {
    console.error('Failed to send email via Postmark', error);
    throw new CommunicationError('Failed to send email.', 500);
  }
}

/**
 * Send an SMS using company OpenPhone settings
 *
 * @throws {CommunicationError} If SMS is not configured or sending fails
 */
export async function sendSms(params: {
  companyId: string;
  to: string;
  body: string;
}): Promise<void> {
  const { companyId, to, body } = params;

  // Validate inputs
  const recipient = typeof to === 'string' ? to.trim() : '';
  const messageBody = typeof body === 'string' ? body.trim() : '';

  if (!recipient || !messageBody) {
    throw new CommunicationError('SMS delivery requires recipient and message body.');
  }

  // Format and validate phone number
  const formattedRecipient = formatSmsRecipient(recipient);

  if (!formattedRecipient) {
    throw new CommunicationError('Provide a valid SMS recipient (e.g., +15551234567 or a 10-11 digit US/CA number).');
  }

  // Get SMS configuration
  const communicationConfig = await ensureCommunicationChannelsConfigured({
    companyId,
    requireEmail: false,
    requireSms: true,
  });

  if (!communicationConfig.smsConfig) {
    throw new CommunicationError('OpenPhone is not configured for this company.');
  }

  // Send SMS (strip button markers so URLs appear as plain text)
  try {
    await sendOpenPhoneMessage({
      apiKey: communicationConfig.smsConfig.apiKey,
      from: communicationConfig.smsConfig.from,
      to: formattedRecipient,
      content: stripButtonMarkers(messageBody),
    });
  } catch (error) {
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 400;
    console.error('Failed to send SMS via OpenPhone', error);
    throw new CommunicationError('Failed to send SMS.', status);
  }
}

/**
 * Send communication via email and/or SMS based on method
 * This is the main function that should be used by routes
 *
 * @throws {CommunicationError} If validation fails or sending fails
 */
export async function sendCommunication(params: CommunicationParams): Promise<CommunicationResult> {
  const { companyId, method, email, sms } = params;

  // Validate method
  if (!['email', 'text', 'both'].includes(method)) {
    throw new CommunicationError('method must be one of email, text, or both.');
  }

  const shouldSendEmail = method === 'email' || method === 'both';
  const shouldSendSms = method === 'text' || method === 'both';

  // Validate required parameters
  if (shouldSendEmail && (!email || !email.to || !email.subject || !email.body)) {
    throw new CommunicationError('Email recipient, subject, and body are required.');
  }

  if (shouldSendSms && (!sms || !sms.to || !sms.body)) {
    throw new CommunicationError('SMS recipient and message body are required.');
  }

  const result: CommunicationResult = {
    sentEmail: false,
    sentSms: false,
  };

  // Send email if requested
  if (shouldSendEmail && email) {
    await sendEmail({
      companyId,
      to: email.to,
      subject: email.subject,
      body: email.body,
      cc: email.cc,
    });
    result.sentEmail = true;
  }

  // Send SMS if requested
  if (shouldSendSms && sms) {
    await sendSms({
      companyId,
      to: sms.to,
      body: sms.body,
    });
    result.sentSms = true;
  }

  return result;
}

/**
 * Validate communication parameters without sending
 * Useful for checking if channels are configured before attempting to send
 */
export async function validateCommunicationChannels(params: {
  companyId: string;
  requireEmail: boolean;
  requireSms: boolean;
}): Promise<void> {
  await ensureCommunicationChannelsConfigured(params);
}
