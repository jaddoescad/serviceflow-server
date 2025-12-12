import { randomUUID } from 'node:crypto';

import {
  buildDealMessageAttachmentStorageKey,
  createDealMessageAttachmentSignedUrl,
  DEAL_MESSAGE_ATTACHMENT_BUCKET,
} from '../lib/deal-messages';
import { sendTwilioMessage } from '../lib/twilio';
import { NotFoundError, ValidationError } from '../lib/errors';
import * as DealMessageRepository from '../repositories/deal-message-repository';
import * as DealRepository from '../repositories/deal-repository';
import * as StorageRepository from '../repositories/storage-repository';
import { ensureCommunicationChannelsConfigured } from './communication-service';
import { formatSmsRecipient } from '../utils/formatting';

export type DealMessageAsset = DealMessageRepository.DealMessage & {
  image_signed_url: string | null;
};

const toDealMessageAsset = async (
  message: DealMessageRepository.DealMessage
): Promise<DealMessageAsset> => {
  const image_signed_url = await createDealMessageAttachmentSignedUrl(message.image_storage_key ?? null);
  return {
    ...message,
    image_signed_url,
  };
};

export async function listDealMessages(dealId: string): Promise<DealMessageAsset[]> {
  const messages = await DealMessageRepository.getDealMessagesByDealId(dealId);
  return Promise.all(messages.map(toDealMessageAsset));
}

export async function createDealMessage(params: {
  companyId: string;
  dealId: string;
  direction: DealMessageRepository.DealMessageDirection;
  body: string | null;
  authorUserId: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  attachment?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}): Promise<DealMessageAsset> {
  const {
    companyId,
    dealId,
    direction,
    body,
    authorUserId,
    fromNumber,
    toNumber,
    provider,
    providerMessageId,
    attachment,
  } = params;

  const messageId = randomUUID();

  let storageKey: string | null = null;
  let cleanupKeys: string[] = [];

  if (attachment) {
    storageKey = buildDealMessageAttachmentStorageKey({
      companyId,
      dealId,
      messageId,
      filename: attachment.originalname || 'attachment',
    });

    await StorageRepository.uploadFile({
      bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET,
      path: storageKey,
      file: attachment.buffer,
      contentType: attachment.mimetype || 'application/octet-stream',
      upsert: false,
    });

    cleanupKeys = [storageKey];
  }

  let record: DealMessageRepository.DealMessage;
  try {
    record = await DealMessageRepository.createDealMessage({
      id: messageId,
      company_id: companyId,
      deal_id: dealId,
      direction,
      body,
      author_user_id: authorUserId,
      from_number: fromNumber ?? null,
      to_number: toNumber ?? null,
      provider: provider ?? null,
      provider_message_id: providerMessageId ?? null,
      image_storage_key: storageKey,
      image_original_filename: attachment?.originalname ?? null,
      image_content_type: attachment?.mimetype ?? null,
      image_byte_size: attachment?.size ?? null,
    });
  } catch (error) {
    if (cleanupKeys.length) {
      try {
        await StorageRepository.removeFiles({
          bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET,
          paths: cleanupKeys,
        });
      } catch (cleanupError) {
        console.error('Failed to cleanup deal message attachment after DB error', cleanupError);
      }
    }
    throw error;
  }

  return toDealMessageAsset(record);
}

export async function sendOutboundDealMessage(params: {
  companyId: string;
  dealId: string;
  body: string | null;
  authorUserId: string | null;
  attachment?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}): Promise<DealMessageAsset> {
  const { companyId, dealId, body, authorUserId, attachment } = params;

  const deal = await DealRepository.getDealById(dealId);
  if (!deal) {
    throw new NotFoundError('Deal not found');
  }

  const candidateTo = deal.phone ?? deal.contact?.phone ?? '';
  const toNumber = formatSmsRecipient(candidateTo);

  if (!toNumber) {
    throw new ValidationError('Customer phone number is missing or invalid.');
  }

  const communicationConfig = await ensureCommunicationChannelsConfigured({
    companyId,
    requireEmail: false,
    requireSms: true,
  });

  if (!communicationConfig.smsConfig) {
    throw new ValidationError('Twilio is not configured for this company.');
  }

  const fromNumber = communicationConfig.smsConfig.from;

  let attachmentUpload: {
    storageKey: string;
    signedUrl: string;
    originalFilename: string;
    contentType: string;
    byteSize: number;
  } | null = null;

  // Upload attachment first (Twilio needs a public URL to fetch)
  const messageId = randomUUID();
  if (attachment) {
    const storageKey = buildDealMessageAttachmentStorageKey({
      companyId,
      dealId,
      messageId,
      filename: attachment.originalname || 'attachment',
    });

    await StorageRepository.uploadFile({
      bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET,
      path: storageKey,
      file: attachment.buffer,
      contentType: attachment.mimetype || 'application/octet-stream',
      upsert: false,
    });

    const signedUrl = await createDealMessageAttachmentSignedUrl(storageKey);
    if (!signedUrl) {
      try {
        await StorageRepository.removeFiles({ bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET, paths: [storageKey] });
      } catch (cleanupError) {
        console.error('Failed to cleanup message attachment after signed URL error', cleanupError);
      }
      throw new Error('Failed to create signed URL for message attachment.');
    }

    attachmentUpload = {
      storageKey,
      signedUrl,
      originalFilename: attachment.originalname || 'attachment',
      contentType: attachment.mimetype || 'application/octet-stream',
      byteSize: attachment.size,
    };
  }

  const trimmedBody = body ? body.trim() : null;

  // Deliver via Twilio
  let twilioResponse: any;
  try {
    twilioResponse = await sendTwilioMessage({
      accountSid: communicationConfig.smsConfig.accountSid,
      authToken: communicationConfig.smsConfig.authToken,
      from: fromNumber,
      to: toNumber,
      body: trimmedBody ?? undefined,
      mediaUrls: attachmentUpload ? [attachmentUpload.signedUrl] : undefined,
    });
  } catch (error) {
    if (attachmentUpload) {
      try {
        await StorageRepository.removeFiles({ bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET, paths: [attachmentUpload.storageKey] });
      } catch (cleanupError) {
        console.error('Failed to cleanup message attachment after Twilio error', cleanupError);
      }
    }
    throw error;
  }

  // Persist message to DB
  let record: DealMessageRepository.DealMessage;
  try {
    record = await DealMessageRepository.createDealMessage({
      id: messageId,
      company_id: companyId,
      deal_id: dealId,
      direction: 'outbound',
      body: trimmedBody,
      author_user_id: authorUserId,
      from_number: fromNumber,
      to_number: toNumber,
      provider: 'twilio',
      provider_message_id: typeof twilioResponse?.sid === 'string' ? twilioResponse.sid : null,
      image_storage_key: attachmentUpload?.storageKey ?? null,
      image_original_filename: attachmentUpload?.originalFilename ?? null,
      image_content_type: attachmentUpload?.contentType ?? null,
      image_byte_size: attachmentUpload?.byteSize ?? null,
    });
  } catch (error) {
    if (attachmentUpload) {
      try {
        await StorageRepository.removeFiles({ bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET, paths: [attachmentUpload.storageKey] });
      } catch (cleanupError) {
        console.error('Failed to cleanup message attachment after DB error', cleanupError);
      }
    }
    throw error;
  }

  return toDealMessageAsset(record);
}
