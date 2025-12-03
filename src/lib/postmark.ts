import { ServerClient } from 'postmark';

const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
const postmarkDefaultFromEmail = process.env.POSTMARK_FROM_EMAIL;
const postmarkMessageStream = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';

// Create the client only when configured to avoid throwing at import time in local dev
const client = postmarkToken ? new ServerClient(postmarkToken) : null;

const toHtml = (body: string) => body.replace(/\n/g, '<br>');

export const isPostmarkConfigured = Boolean(postmarkToken);

type SendEmailParams = {
  fromEmail?: string | null;
  to: string;
  cc?: string | null;
  bcc?: string | null;
  replyTo?: string | null;
  subject: string;
  body: string;
};

export async function sendProposalEmail(params: SendEmailParams) {
  if (!client) {
    throw new Error('Postmark is not configured. Set POSTMARK_SERVER_TOKEN.');
  }

  const fromEmail = params.fromEmail || postmarkDefaultFromEmail;

  if (!fromEmail) {
    throw new Error('Missing From email. Provide POSTMARK_FROM_EMAIL or pass fromEmail.');
  }

  await client.sendEmail({
    From: fromEmail,
    To: params.to,
    Cc: params.cc || undefined,
    Bcc: params.bcc || undefined,
    ReplyTo: params.replyTo || undefined,
    Subject: params.subject,
    TextBody: params.body,
    HtmlBody: toHtml(params.body),
    MessageStream: postmarkMessageStream,
  });
}
