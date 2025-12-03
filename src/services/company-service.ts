import * as CompanyRepository from '../repositories/company-repository';
import * as StorageRepository from '../repositories/storage-repository';
import { seedDefaultProductTemplatesForCompany } from './product-template-service';
import { seedDefaultDripsForCompany } from './drip-sequence-service';
import { seedDefaultCommunicationTemplatesForCompany } from './communication-template-service';
import { seedDefaultDealSourcesForCompany } from './deal-source-service';

/**
 * Company Service
 * Handles business logic for company-related operations
 */

/**
 * Update company branding with logo file upload
 */
export async function updateCompanyBranding(params: {
  companyId: string;
  websiteUrl?: string | null;
  reviewUrl?: string | null;
  removeLogo?: boolean;
  logoFile?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
}): Promise<{
  branding: CompanyRepository.CompanyBranding;
  signedUrl: string | null;
}> {
  const { companyId, websiteUrl, reviewUrl, removeLogo, logoFile } = params;

  const updates: any = {
    company_id: companyId,
    website: websiteUrl || null,
    review_url: reviewUrl || null,
  };

  if (removeLogo) {
    updates.logo_storage_key = null;
  }

  // Upload logo file if provided
  if (logoFile) {
    const fileExt = logoFile.originalname.split('.').pop();
    const fileName = `${companyId}-${Date.now()}.${fileExt}`;
    const filePath = `company-logos/${fileName}`;

    await StorageRepository.uploadFile({
      bucket: 'public_assets',
      path: filePath,
      file: logoFile.buffer,
      contentType: logoFile.mimetype,
      upsert: true,
    });

    updates.logo_storage_key = filePath;
  }

  // Update branding in database
  const branding = await CompanyRepository.upsertCompanyBranding(updates);

  // Generate signed URL for logo
  let signedUrl = null;
  if (branding.logo_storage_key) {
    signedUrl = await StorageRepository.createSignedUrl({
      bucket: 'public_assets',
      path: branding.logo_storage_key,
      expiresIn: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return { branding, signedUrl };
}

/**
 * Get signed URL for a company logo
 */
export async function getCompanyLogoSignedUrl(storageKey: string): Promise<string | null> {
  if (!storageKey) {
    return null;
  }

  return await StorageRepository.createSignedUrl({
    bucket: 'public_assets',
    path: storageKey,
    expiresIn: 60 * 60 * 24 * 365, // 1 year
  });
}

/**
 * Seed all default data for a new company
 * This includes: product templates, drips, communication templates, and deal sources
 */
export async function seedDefaultCompanyData(
  companyId: string,
  userId?: string | null
): Promise<void> {
  const errors: Array<{ type: string; error: any }> = [];

  // Seed product templates
  try {
    await seedDefaultProductTemplatesForCompany(companyId, userId ?? null);
  } catch (error) {
    console.error('Failed to seed default product templates for company:', error);
    errors.push({ type: 'product_templates', error });
  }

  // Seed drip sequences
  try {
    await seedDefaultDripsForCompany(companyId);
  } catch (error) {
    console.error('Failed to seed default drips for company:', error);
    errors.push({ type: 'drip_sequences', error });
  }

  // Seed communication templates
  try {
    await seedDefaultCommunicationTemplatesForCompany(companyId);
  } catch (error) {
    console.error('Failed to seed default communication templates for company:', error);
    errors.push({ type: 'communication_templates', error });
  }

  // Seed deal sources
  try {
    await seedDefaultDealSourcesForCompany(companyId, userId ?? null);
  } catch (error) {
    console.error('Failed to seed default deal sources for company:', error);
    errors.push({ type: 'deal_sources', error });
  }

  // If any seeding failed, throw an error with details
  if (errors.length > 0) {
    const errorTypes = errors.map(e => e.type).join(', ');
    throw new Error(`Failed to seed default data for company: ${errorTypes}`);
  }
}
