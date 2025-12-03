import { isPostmarkConfigured, sendProposalEmail } from '../lib/postmark';
import { getCompanyEmailSettings } from '../utils/email-settings';
import * as CompanyRepository from '../repositories/company-repository';

/**
 * Notification Service
 * Handles business logic for sending notifications to company owners
 */

type EmailContext = {
  fromEmail: string | null;
  replyTo: string | null;
  bcc: string | null;
};

export const getEmailContextForCompany = async (companyId: string): Promise<EmailContext> => {
  const effectiveEmailSettings = await getCompanyEmailSettings(companyId);

  return {
    fromEmail:
      effectiveEmailSettings?.provider_account_email ||
      effectiveEmailSettings?.reply_email ||
      process.env.POSTMARK_FROM_EMAIL ||
      null,
    replyTo: effectiveEmailSettings?.reply_email ?? null,
    bcc: effectiveEmailSettings?.bcc_email ?? null,
  };
};

const getOwnerRecipient = async (companyId: string) => {
  let company;
  try {
    company = await CompanyRepository.getCompanyById(companyId);
  } catch (error) {
    console.error('Failed to load company owner for notification', error);
    return { email: null as string | null, name: null as string | null };
  }

  if (!company) {
    return { email: null as string | null, name: null as string | null };
  }

  const email = typeof company.email === 'string' ? company.email.trim() : '';
  const name = `${company.owner_first_name ?? ''} ${company.owner_last_name ?? ''}`.trim();

  return {
    email: email || null,
    name: name || null,
  };
};

export const sendOwnerNotification = async (params: { companyId: string; subject: string; body: string }) => {
  const { companyId, subject, body } = params;

  if (!isPostmarkConfigured) {
    console.warn('Postmark is not configured; skipping owner notification email.');
    return;
  }

  const recipient = await getOwnerRecipient(companyId);

  if (!recipient.email) {
    console.warn('Company owner email is missing; skipping owner notification.', { companyId });
    return;
  }

  const { fromEmail, replyTo, bcc } = await getEmailContextForCompany(companyId);

  if (!fromEmail) {
    console.warn('From email is not configured; skipping owner notification email.', { companyId });
    return;
  }

  const to = recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;

  try {
    await sendProposalEmail({
      fromEmail,
      to,
      bcc: bcc ?? undefined,
      replyTo: replyTo ?? undefined,
      subject,
      body,
    });
  } catch (error) {
    console.error('Failed to send owner notification email', error);
  }
};
