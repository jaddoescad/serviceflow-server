import { ServerClient } from 'postmark';

const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
const postmarkDefaultFromEmail = process.env.POSTMARK_FROM_EMAIL;
const postmarkMessageStream = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';

// Create the client only when configured to avoid throwing at import time in local dev
const client = postmarkToken ? new ServerClient(postmarkToken) : null;

/**
 * Button style configuration for email HTML buttons
 */
const buttonStyle = [
  'display: inline-block',
  'padding: 12px 24px',
  'background-color: #2563eb',
  'color: #ffffff',
  'text-decoration: none',
  'border-radius: 6px',
  'font-weight: 600',
  'font-size: 14px',
  'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  'text-align: center',
  'margin: 8px 0',
].join('; ');

/**
 * Link style for plain URL links
 */
const linkStyle = 'color: #2563eb; text-decoration: underline;';

/**
 * Button marker pattern: [BTN:Label]URL
 * Used by -button template keywords to indicate a URL should render as a styled button.
 */
const buttonMarkerPattern = /^\[BTN:([^\]]+)\](https?:\/\/[^\s]+)$/;

/**
 * Converts plain text email body to HTML with button and link support
 * - Replaces newlines with <br> tags
 * - Converts [BTN:Label]URL markers to styled HTML buttons
 * - Converts standalone URLs to clickable links
 */
const toHtml = (body: string): string => {
  // Split by lines to process each line individually
  const lines = body.split('\n');

  const processedLines = lines.map(line => {
    const trimmed = line.trim();

    // Check for button marker pattern: [BTN:Label]URL
    const buttonMatch = trimmed.match(buttonMarkerPattern);
    if (buttonMatch) {
      const [, label, url] = buttonMatch;
      return `<a href="${url}" style="${buttonStyle}" target="_blank">${label}</a>`;
    }

    // Check if line is a standalone URL (http:// or https://)
    if (/^https?:\/\/[^\s]+$/.test(trimmed)) {
      // Render as a plain clickable link
      return `<a href="${trimmed}" style="${linkStyle}" target="_blank">${trimmed}</a>`;
    }

    return line;
  });

  return processedLines.join('<br>');
};

/**
 * Strips button markers from text for plain text output (SMS).
 * Converts [BTN:Label]URL to just URL.
 */
export const stripButtonMarkers = (body: string): string => {
  return body.replace(/\[BTN:[^\]]+\](https?:\/\/[^\s]+)/g, '$1');
};

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
    TextBody: stripButtonMarkers(params.body),
    HtmlBody: toHtml(params.body),
    MessageStream: postmarkMessageStream,
  });
}
