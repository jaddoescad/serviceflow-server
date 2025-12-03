import { supabase } from '../lib/supabase';
import type { StorageError as SupabaseStorageError } from '@supabase/storage-js';

/**
 * Storage Repository
 * Handles all file storage operations using Supabase Storage
 */

/**
 * Storage error with original error context
 */
export interface StorageErrorContext {
  message: string;
  statusCode?: string;
  error?: string;
}

export class StorageError extends Error {
  public originalError?: StorageErrorContext;

  constructor(message: string, originalError?: StorageErrorContext) {
    super(message);
    this.name = 'StorageError';
    this.originalError = originalError;
  }
}

/**
 * Upload a file to a storage bucket
 */
export async function uploadFile(params: {
  bucket: string;
  path: string;
  file: Buffer;
  contentType: string;
  cacheControl?: string;
  upsert?: boolean;
}): Promise<void> {
  const { bucket, path, file, contentType, cacheControl, upsert } = params;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      cacheControl,
      upsert,
    });

  if (error) {
    throw new StorageError(`Failed to upload file to ${bucket}/${path}`, error);
  }
}

/**
 * Remove files from a storage bucket
 */
export async function removeFiles(params: {
  bucket: string;
  paths: string[];
}): Promise<void> {
  const { bucket, paths } = params;

  if (paths.length === 0) {
    return;
  }

  const { error } = await supabase.storage
    .from(bucket)
    .remove(paths);

  if (error) {
    throw new StorageError(`Failed to remove files from ${bucket}`, error);
  }
}

/**
 * Create a signed URL for a file
 */
export async function createSignedUrl(params: {
  bucket: string;
  path: string;
  expiresIn: number;
}): Promise<string | null> {
  const { bucket, path, expiresIn } = params;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new StorageError(`Failed to create signed URL for ${bucket}/${path}`, error);
  }

  return data?.signedUrl ?? null;
}

/**
 * Get public URL for a file (for public buckets)
 */
export function getPublicUrl(params: {
  bucket: string;
  path: string;
}): string {
  const { bucket, path } = params;

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}
