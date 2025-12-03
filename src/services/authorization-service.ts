import { supabase } from '../lib/supabase';

/**
 * Authorization Service
 * Handles company ownership lookups for resources
 */

type ResourceType = 'deal' | 'contact' | 'quote' | 'invoice' | 'crew' | 'appointment' |
  'deal_note' | 'drip_sequence' | 'drip_step' | 'product_template' | 'communication_template' |
  'proposal_attachment' | 'change_order' | 'work_order' | 'company_deal_source';

/**
 * Map resource types to their table names and company_id column
 */
const RESOURCE_TABLE_MAP: Record<ResourceType, { table: string; companyIdColumn: string }> = {
  deal: { table: 'deals', companyIdColumn: 'company_id' },
  contact: { table: 'contacts', companyIdColumn: 'company_id' },
  quote: { table: 'quotes', companyIdColumn: 'company_id' },
  invoice: { table: 'invoices', companyIdColumn: 'company_id' },
  crew: { table: 'crews', companyIdColumn: 'company_id' },
  appointment: { table: 'appointments', companyIdColumn: 'company_id' },
  deal_note: { table: 'deal_notes', companyIdColumn: 'company_id' },
  drip_sequence: { table: 'drip_sequences', companyIdColumn: 'company_id' },
  drip_step: { table: 'drip_steps', companyIdColumn: 'company_id' },
  product_template: { table: 'product_templates', companyIdColumn: 'company_id' },
  communication_template: { table: 'communication_templates', companyIdColumn: 'company_id' },
  proposal_attachment: { table: 'proposal_attachments', companyIdColumn: 'company_id' },
  change_order: { table: 'change_orders', companyIdColumn: 'company_id' },
  work_order: { table: 'work_orders', companyIdColumn: 'company_id' },
  company_deal_source: { table: 'company_deal_sources', companyIdColumn: 'company_id' },
};

/**
 * Cache for resource company lookups
 */
const resourceCompanyCache = new Map<string, { companyId: string | null; timestamp: number }>();
const CACHE_TTL_MS = 30_000; // 30 second cache

/**
 * Get the company_id for a resource by its ID
 */
export async function getResourceCompanyId(
  resourceType: ResourceType,
  resourceId: string
): Promise<string | null> {
  const cacheKey = `${resourceType}:${resourceId}`;
  const cached = resourceCompanyCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.companyId;
  }

  const config = RESOURCE_TABLE_MAP[resourceType];
  if (!config) {
    console.error(`Unknown resource type: ${resourceType}`);
    return null;
  }

  const { data, error } = await supabase
    .from(config.table)
    .select('company_id')
    .eq('id', resourceId)
    .single();

  if (error || !data) {
    resourceCompanyCache.set(cacheKey, { companyId: null, timestamp: Date.now() });
    return null;
  }

  const companyId = (data as { company_id: string }).company_id;
  resourceCompanyCache.set(cacheKey, { companyId, timestamp: Date.now() });

  return companyId;
}

/**
 * Clear resource cache (call when resource is deleted)
 */
export function clearResourceCache(resourceType: ResourceType, resourceId: string): void {
  const cacheKey = `${resourceType}:${resourceId}`;
  resourceCompanyCache.delete(cacheKey);
}

/**
 * Check if a user has access to a specific resource
 */
export async function userHasResourceAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  userCompanyIds: string[]
): Promise<boolean> {
  const companyId = await getResourceCompanyId(resourceType, resourceId);

  if (!companyId) {
    return false; // Resource not found
  }

  return userCompanyIds.includes(companyId);
}
