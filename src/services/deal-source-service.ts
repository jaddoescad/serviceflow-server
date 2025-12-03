import * as RpcRepository from '../repositories/rpc-repository';

const DEFAULT_DEAL_SOURCES = [
  'Google',
  'Facebook',
  'Word of Mouth',
  'Angi',
  'Yard Sign',
  'Repeat Customer',
  'Website',
  'Instagram',
  'Phone Call',
  'Mail',
  'Other',
];

/**
 * Seed default deal sources for a company atomically.
 * If any source fails, all are rolled back.
 */
export const seedDefaultDealSourcesForCompany = async (
  companyId: string,
  createdByUserId: string | null = null
) => {
  // Use atomic RPC function to upsert all sources in a single transaction
  const result = await RpcRepository.seedDealSourcesForCompany({
    companyId,
    createdByUserId,
    sources: DEFAULT_DEAL_SOURCES.map(name => ({
      name,
      is_default: true,
    })),
  });

  return result;
};

export const DEFAULT_DEAL_SOURCE_OPTIONS = DEFAULT_DEAL_SOURCES;
