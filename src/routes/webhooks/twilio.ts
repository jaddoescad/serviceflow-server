import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError } from '../../lib/errors';
import { formatSmsRecipient } from '../../utils/formatting';
import * as CompanyRepository from '../../repositories/company-repository';
import * as DealMessageRepository from '../../repositories/deal-message-repository';
import * as DealRepository from '../../repositories/deal-repository';
import * as DealMessageService from '../../services/deal-message-service';

const router = Router();

type TwilioInboundPayload = {
  From?: string;
  To?: string;
  Body?: string;
  MessageSid?: string;
  SmsSid?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
};

const getString = (value: unknown) => (typeof value === 'string' ? value : undefined);

const isAllowedTwilioMediaUrl = (candidate: string) => {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' && parsed.hostname === 'api.twilio.com';
  } catch {
    return false;
  }
};

const requireWebhookSecret = (req: any) => {
  const secret = process.env.TWILIO_WEBHOOK_SECRET;
  if (!secret) {
    return;
  }

  const provided = getString(req.query?.secret);
  if (!provided || provided !== secret) {
    throw new ValidationError('Invalid webhook secret.');
  }
};

const fetchTwilioMedia = async (params: {
  url: string;
  accountSid: string;
  authToken: string;
}): Promise<{ buffer: Buffer; contentType: string } | null> => {
  const { url, accountSid, authToken } = params;

  if (!isAllowedTwilioMediaUrl(url)) {
    console.warn('Blocked Twilio media URL (unexpected host)', url);
    return null;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    console.warn('Twilio media fetch failed', response.status, response.statusText);
    return null;
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
};

const fileExtensionForContentType = (contentType: string): string => {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('heic')) return 'heic';
  return 'bin';
};

const findDealIdForInbound = async (params: {
  companyId: string;
  companyNumber: string;
  customerNumber: string;
}): Promise<string | null> => {
  const { companyId, companyNumber, customerNumber } = params;

  // Preferred: map to the most recent outbound message thread
  const byThread = await DealMessageRepository.findLatestDealIdByNumbers({
    companyId,
    fromNumber: companyNumber,
    toNumber: customerNumber,
  });
  if (byThread) {
    return byThread;
  }

  // Fallback: try to match deals/contacts by exact phone value
  const directDeal = await DealRepository.getDeals({
    company_id: companyId,
    exclude_archived: false,
    limit: 50,
    order: 'updated_at.desc',
  });

  const matches = directDeal.filter((deal) => {
    const dealPhone = deal.phone ?? '';
    const contactPhone = deal.contact?.phone ?? '';
    return dealPhone === customerNumber || contactPhone === customerNumber;
  });

  return matches[0]?.id ?? null;
};

// POST /webhooks/twilio/inbound-sms
router.post(
  '/inbound-sms',
  asyncHandler(async (req, res) => {
    requireWebhookSecret(req);

    const payload = (req.body ?? {}) as TwilioInboundPayload;
    const fromRaw = getString(payload.From) ?? '';
    const toRaw = getString(payload.To) ?? '';
    const bodyRaw = getString(payload.Body) ?? '';

    const fromNumber = fromRaw.trim();
    const toNumber = toRaw.trim();
    const body = bodyRaw.trim() || null;

    if (!fromNumber || !toNumber) {
      throw new ValidationError('Twilio webhook requires From and To.');
    }

    const normalizedToCandidate = formatSmsRecipient(toNumber);
    const company =
      (await CompanyRepository.getCompanyTwilioSettingsByPhoneNumber(toNumber)) ??
      (normalizedToCandidate
        ? await CompanyRepository.getCompanyTwilioSettingsByPhoneNumber(normalizedToCandidate)
        : null);
    if (!company || !company.twilio_enabled) {
      // Unknown To number; acknowledge so Twilio doesn't retry.
      return res.status(200).send('ok');
    }

    if (!company.twilio_account_sid || !company.twilio_auth_token) {
      return res.status(200).send('ok');
    }

    // Normalize numbers so conversation lookup is stable
    const normalizedFrom = formatSmsRecipient(fromNumber) || fromNumber;
    const normalizedTo = normalizedToCandidate || toNumber;

    const dealId = await findDealIdForInbound({
      companyId: company.id,
      companyNumber: normalizedTo,
      customerNumber: normalizedFrom,
    });

    if (!dealId) {
      console.warn('Unmatched inbound Twilio message', {
        companyId: company.id,
        to: normalizedTo,
        from: normalizedFrom,
      });
      return res.status(200).send('ok');
    }

    const messageSid = getString(payload.MessageSid) ?? getString(payload.SmsSid) ?? null;

    if (messageSid) {
      const alreadyStored = await DealMessageRepository.existsDealMessageByProviderId({
        provider: 'twilio',
        providerMessageId: messageSid,
      });
      if (alreadyStored) {
        return res.status(200).send('ok');
      }
    }

    const numMedia = Number(getString(payload.NumMedia) ?? '0');
    const mediaUrl0 = getString(payload.MediaUrl0) ?? null;
    const mediaType0 = getString(payload.MediaContentType0) ?? null;

    let attachment:
      | {
          buffer: Buffer;
          originalname: string;
          mimetype: string;
          size: number;
        }
      | undefined;

    if (numMedia > 0 && mediaUrl0) {
      const contentType = mediaType0 || 'application/octet-stream';
      if (contentType.startsWith('image/')) {
        const media = await fetchTwilioMedia({
          url: mediaUrl0,
          accountSid: company.twilio_account_sid,
          authToken: company.twilio_auth_token,
        });

        if (media) {
          const ext = fileExtensionForContentType(contentType);
          attachment = {
            buffer: media.buffer,
            originalname: `inbound-image.${ext}`,
            mimetype: contentType,
            size: media.buffer.length,
          };
        }
      }
    }

    if (!body && !attachment) {
      return res.status(200).send('ok');
    }

    await DealMessageService.createDealMessage({
      companyId: company.id,
      dealId,
      direction: 'inbound',
      body,
      authorUserId: null,
      fromNumber: normalizedFrom,
      toNumber: normalizedTo,
      provider: 'twilio',
      providerMessageId: messageSid,
      attachment,
    });

    return res.status(200).send('ok');
  })
);

export default router;
