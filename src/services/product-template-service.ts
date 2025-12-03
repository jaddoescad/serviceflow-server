import * as RpcRepository from '../repositories/rpc-repository';

type DefaultProductTemplate = {
  name: string;
  description?: string | null;
  type: 'service' | 'product';
};

const STANDARD_SERVICE_DESCRIPTION = [
  'Professional Standards – Dedicated project managers and lead painters ensuring consistent quality control.',
  'Premium Products – We use top-tier Sherwin-Williams and Benjamin Moore paints for lasting results.',
  'Detailed Prep Work – Proper sanding, filling, and caulking before every coat for a flawless finish.',
  'Clean & Respectful – We protect your space with drop cloths, plastic coverings, and daily clean-up.',
  'On-Time & Reliable – Clear scheduling and communication; we show up when we say we will.',
  'Fully Insured & WSIB Covered – Peace of mind knowing your home and our crew are protected.',
  'Warranty Guaranteed – 2–3 year workmanship warranty against peeling, blistering, or flaking.',
  'Eco-Friendly Options – Low-VOC paints available for healthier homes and environments.',
  'Local & Responsive – Ottawa-based team, always available for questions before, during, and after your project.',
].join('\n');

export const DEFAULT_SERVICE_TEMPLATES: DefaultProductTemplate[] = [
  { name: 'Cabinet Refinishing', description: 'Product #135868\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Exterior Door & Frame', description: 'Product #136694\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Exterior Garage Door & Frame', description: 'Product #136695\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Exterior Painting', description: 'Product #135869\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Exterior Preperation', description: 'Product #136692\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Paint Product', description: 'Product #136320\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Painting - Ceiling', description: 'Product #135870\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Painting - Doors', description: 'Product #135871\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Painting - Trim', description: 'Product #135872\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Painting - Walls', description: 'Product #135873\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Painting - Closets & Closet Doors', description: 'Product #136287\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Interior Preparation', description: 'Product #136285\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
  { name: 'Why Choose Ottawa Painters', description: 'Product #144004\n' + STANDARD_SERVICE_DESCRIPTION, type: 'service' },
];

/**
 * Seed default product templates for a company atomically.
 * If any template fails, all are rolled back.
 */
export const seedDefaultProductTemplatesForCompany = async (
  companyId: string,
  createdByUserId?: string | null,
) => {
  if (!companyId) {
    throw new Error('companyId is required to seed default product templates');
  }

  // Use atomic RPC function to seed all templates in a single transaction
  const result = await RpcRepository.seedProductTemplatesForCompany({
    companyId,
    createdByUserId: createdByUserId ?? null,
    templates: DEFAULT_SERVICE_TEMPLATES,
  });

  return result;
};
