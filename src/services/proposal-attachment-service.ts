import {
  buildAttachmentStorageKey,
  PROPOSAL_ATTACHMENT_BUCKET,
  toProposalAttachmentAsset,
} from '../lib/proposal-attachments';
import * as ProposalAttachmentRepository from '../repositories/proposal-attachment-repository';
import * as QuoteRepository from '../repositories/quote-repository';
import * as StorageRepository from '../repositories/storage-repository';

/**
 * Proposal Attachment Service
 * Handles business logic for proposal attachments including storage operations
 */

export type UploadProposalAttachmentParams = {
  quoteId: string;
  dealId: string;
  companyId?: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  thumbnail?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
  uploadedByUserId?: string | null;
};

/**
 * Upload a proposal attachment with optional thumbnail
 */
export async function uploadProposalAttachment(
  params: UploadProposalAttachmentParams
): Promise<any> {
  const { quoteId, dealId, companyId, file, thumbnail, uploadedByUserId } = params;

  // Resolve company ID if not provided
  let resolvedCompanyId = companyId;
  if (!resolvedCompanyId) {
    const quote = await QuoteRepository.getQuoteById(quoteId);
    if (!quote?.company_id) {
      throw new Error('Could not find quote for this attachment');
    }
    resolvedCompanyId = quote.company_id;
  }

  // Build storage key for main file
  const storageKey = buildAttachmentStorageKey({
    companyId: resolvedCompanyId,
    dealId,
    quoteId,
    filename: file.originalname || 'attachment',
  });

  // Upload main file
  await StorageRepository.uploadFile({
    bucket: PROPOSAL_ATTACHMENT_BUCKET,
    path: storageKey,
    file: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
    upsert: false,
  });

  // Upload thumbnail if provided
  let thumbnailKey: string | null = null;
  if (thumbnail) {
    const candidateThumbKey = buildAttachmentStorageKey({
      companyId: resolvedCompanyId,
      dealId,
      quoteId,
      filename: thumbnail.originalname || `thumb-${file.originalname}`,
      prefix: 'thumb',
    });

    try {
      await StorageRepository.uploadFile({
        bucket: PROPOSAL_ATTACHMENT_BUCKET,
        path: candidateThumbKey,
        file: thumbnail.buffer,
        contentType: thumbnail.mimetype || 'image/png',
        upsert: false,
      });
      thumbnailKey = candidateThumbKey;
    } catch (error) {
      console.error('Failed to upload attachment thumbnail', error);
    }
  }

  // Create database record
  let record;
  try {
    record = await ProposalAttachmentRepository.createProposalAttachment({
      company_id: resolvedCompanyId,
      deal_id: dealId,
      quote_id: quoteId,
      storage_key: storageKey,
      thumbnail_key: thumbnailKey,
      original_filename: file.originalname || 'attachment',
      content_type: file.mimetype || 'application/octet-stream',
      byte_size: file.size,
      uploaded_by_user_id: uploadedByUserId ?? null,
    });
  } catch (error) {
    // Cleanup uploaded files if DB record creation fails
    try {
      await StorageRepository.removeFiles({
        bucket: PROPOSAL_ATTACHMENT_BUCKET,
        paths: [storageKey, ...(thumbnailKey ? [thumbnailKey] : [])],
      });
    } catch (cleanupError) {
      console.error('Failed to cleanup files after DB error', cleanupError);
    }
    throw new Error('Failed to save attachment record');
  }

  // Convert to asset format for response
  const asset = await toProposalAttachmentAsset(record);
  return asset;
}

/**
 * Delete a proposal attachment from storage and database
 */
export async function deleteProposalAttachment(attachmentId: string): Promise<void> {
  // Get attachment record
  const attachment = await ProposalAttachmentRepository.getProposalAttachmentById(attachmentId);

  if (!attachment) {
    throw new Error('Attachment not found');
  }

  // Remove files from storage
  const keysToRemove = [attachment.storage_key];
  if (attachment.thumbnail_key) {
    keysToRemove.push(attachment.thumbnail_key);
  }

  try {
    await StorageRepository.removeFiles({
      bucket: PROPOSAL_ATTACHMENT_BUCKET,
      paths: keysToRemove,
    });
  } catch (error) {
    console.error('Failed to remove attachment files from storage', error);
  }

  // Delete database record
  await ProposalAttachmentRepository.deleteProposalAttachment(attachmentId);
}
