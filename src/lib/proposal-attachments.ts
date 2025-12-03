import crypto from 'node:crypto';
import path from 'node:path';

import * as StorageRepository from '../repositories/storage-repository';

export const PROPOSAL_ATTACHMENT_BUCKET = 'proposal-attachments';
export const PROPOSAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
export const PROPOSAL_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export type ProposalAttachmentRow = {
  id: string;
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
  updated_at: string;
};

const safeFileName = (filename: string) => {
  const base = path.basename(filename || 'attachment');
  const normalized = base.normalize('NFKD');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  const trimmed = cleaned.replace(/^-+|-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'attachment';
};

export const buildAttachmentStorageKey = (params: {
  companyId: string;
  dealId: string;
  quoteId: string;
  filename: string;
  prefix?: string;
}) => {
  const prefix = params.prefix ? `${params.prefix}-` : '';
  return `companies/${params.companyId}/deals/${params.dealId}/quotes/${params.quoteId}/${prefix}${crypto.randomUUID()}-${safeFileName(params.filename)}`;
};

const createSignedUrl = async (pathKey: string | null) => {
  if (!pathKey) return null;

  try {
    return await StorageRepository.createSignedUrl({
      bucket: PROPOSAL_ATTACHMENT_BUCKET,
      path: pathKey,
      expiresIn: PROPOSAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error('Failed to create signed URL for proposal attachment', error);
    return null;
  }
};

export const toProposalAttachmentAsset = async (attachment: ProposalAttachmentRow) => {
  const [signedUrl, thumbnailUrl] = await Promise.all([
    createSignedUrl(attachment.storage_key),
    createSignedUrl(attachment.thumbnail_key),
  ]);

  return {
    ...attachment,
    signed_url: signedUrl,
    thumbnail_url: thumbnailUrl,
  };
};

export const toProposalAttachmentAssets = async (attachments: ProposalAttachmentRow[] = []) => {
  return Promise.all(attachments.map((attachment) => toProposalAttachmentAsset(attachment)));
};
