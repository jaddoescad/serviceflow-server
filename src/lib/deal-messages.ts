import crypto from 'node:crypto';
import path from 'node:path';

import * as StorageRepository from '../repositories/storage-repository';

export const DEAL_MESSAGE_ATTACHMENT_BUCKET = 'deal-message-attachments';
export const DEAL_MESSAGE_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
export const DEAL_MESSAGE_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

const safeFileName = (filename: string) => {
  const base = path.basename(filename || 'attachment');
  const normalized = base.normalize('NFKD');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  const trimmed = cleaned.replace(/^-+|-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'attachment';
};

export const buildDealMessageAttachmentStorageKey = (params: {
  companyId: string;
  dealId: string;
  messageId: string;
  filename: string;
}) => {
  return `companies/${params.companyId}/deals/${params.dealId}/messages/${params.messageId}/${crypto.randomUUID()}-${safeFileName(params.filename)}`;
};

export const createDealMessageAttachmentSignedUrl = async (pathKey: string | null) => {
  if (!pathKey) return null;

  try {
    return await StorageRepository.createSignedUrl({
      bucket: DEAL_MESSAGE_ATTACHMENT_BUCKET,
      path: pathKey,
      expiresIn: DEAL_MESSAGE_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error('Failed to create signed URL for deal message attachment', error);
    return null;
  }
};

