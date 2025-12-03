import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError } from '../../lib/errors';
import { toProposalAttachmentAssets } from '../../lib/proposal-attachments';
import { sanitizeUserId } from '../../utils/validation';
import { parsePaginationParams } from '../../lib/pagination';
import * as DealRepository from '../../repositories/deal-repository';
import * as AppointmentRepository from '../../repositories/appointment-repository';
import * as QuoteRepository from '../../repositories/quote-repository';
import * as RpcRepository from '../../repositories/rpc-repository';
import * as DripSequenceRepository from '../../repositories/drip-sequence-repository';
import { requireCompanyAccess, requireResourceAccess } from '../../middleware/authorization';

const router = Router();

/**
 * Normalizes the latest_appointment field to always be a single object or null
 */
const normalizeLatestAppointment = (deal: any) => {
  if (!deal) return deal;

  const latest = Array.isArray(deal.latest_appointment)
    ? deal.latest_appointment[0] ?? null
    : deal.latest_appointment ?? null;

  return { ...deal, latest_appointment: latest };
};

// GET / - List deals with optional filters - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, contact_id, order, limit, pipeline } = req.query;

    // company_id is validated by requireCompanyAccess middleware
    const pipelineValue = typeof pipeline === 'string' ? pipeline.trim() : '';

    // Exclude archived deals when fetching for pipeline/kanban view
    const excludeArchived = Boolean(pipelineValue);

    const deals = await DealRepository.getDeals({
      company_id: company_id as string,
      contact_id: contact_id as string,
      pipeline: pipelineValue,
      order: order as string,
      limit: limit ? Number(limit) : undefined,
      exclude_archived: excludeArchived,
    });

    const normalized = deals.map(normalizeLatestAppointment);
    res.json(normalized);
  })
);

// GET /paginated - List deals with server-side pagination
router.get(
  '/paginated',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, pipeline, stage, salesperson, lead_source } = req.query;

    if (!company_id) {
      throw new ValidationError('company_id is required');
    }

    const pagination = parsePaginationParams(req.query as Record<string, string>);

    const filters: DealRepository.DealListFilters = {
      company_id: company_id as string,
      pipeline: pipeline as string | undefined,
      stage: stage as string | undefined,
      salesperson: salesperson as string | undefined,
      lead_source: lead_source as string | undefined,
    };

    const [paginatedDeals, summary] = await Promise.all([
      DealRepository.getDealsPaginated(filters, pagination),
      DealRepository.getDealListSummary(company_id as string, pipeline as string | undefined),
    ]);

    // Normalize latest_appointment for each deal
    const normalizedData = paginatedDeals.data.map(normalizeLatestAppointment);

    res.json({
      data: normalizedData,
      pagination: paginatedDeals.pagination,
      summary,
    });
  })
);

// POST / - Create a new deal - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const payload = req.body;

    // Validation
    if (!payload.company_id || !payload.first_name || !payload.stage) {
      throw new ValidationError('company_id, first_name, and stage are required');
    }

    const deal = await DealRepository.createDeal(payload);
    res.json(deal);
  })
);

// GET /:id - Get deal by ID - requires access to deal's company
router.get(
  '/:id',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deal = await DealRepository.getDealById(id);

    if (!deal) {
      throw new NotFoundError('Deal not found');
    }

    res.json(normalizeLatestAppointment(deal));
  })
);

// GET /:id/details - Get deal details (composite endpoint with all related data via RPC)
router.get(
  '/:id/details',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const data = await RpcRepository.getDealDetail(id);

    // Sign proposal attachment URLs
    const proposalAttachments = await toProposalAttachmentAssets(data.proposalAttachments ?? []);

    res.json({
      ...data,
      proposalAttachments,
    });
  })
);

// GET /:id/proposal-data - Get proposal data for deal (used in proposal generation via RPC)
router.get(
  '/:id/proposal-data',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { quoteId } = req.query;

    const data = await RpcRepository.getDealProposalData(id, quoteId as string | undefined);

    // Sign proposal attachment URLs
    const signedAttachments = await toProposalAttachmentAssets(data.attachments ?? []);

    res.json({
      deal: data.deal,
      quote: data.quote,
      attachments: signedAttachments,
      quoteCount: data.quoteCount,
      proposalTemplate: data.proposalTemplate,
      workOrderTemplate: data.workOrderTemplate,
      changeOrderTemplate: data.changeOrderTemplate,
      productTemplates: data.productTemplates || [],
      quoteCompanyBranding: data.quoteCompanyBranding,
      companySettings: data.companySettings,
      invoiceForQuote: data.invoiceForQuote,
    });
  })
);

// PATCH /:id/stage - Update deal stage
router.patch(
  '/:id/stage',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { stage } = req.body ?? {};

    if (!stage || typeof stage !== 'string') {
      throw new ValidationError('stage is required');
    }

    // Validate stage transitions
    if (stage === 'estimate_scheduled') {
      const count = await AppointmentRepository.countAppointmentsByDealId(id);
      if (count < 1) {
        throw new ValidationError('Create an appointment before moving this deal to Estimate Scheduled.');
      }
    }

    // Stages that require at least one proposal/quote
    const proposalRequiredStages = ['in_draft', 'proposals_sent', 'proposals_rejected'];
    if (proposalRequiredStages.includes(stage)) {
      const quoteCount = await QuoteRepository.countQuotesByDealId(id);
      if (quoteCount < 1) {
        throw new ValidationError('Create a proposal before moving this deal to this stage.');
      }
    }

    const deal = await DealRepository.updateDealStage(id, stage);
    res.json(deal);
  })
);

// PATCH /:id - Update deal details (contact info, address, metadata)
router.patch(
  '/:id',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.body ?? {};

    // Check if deal exists
    const existingDeal = await DealRepository.getDealById(id);
    if (!existingDeal) {
      throw new NotFoundError('Deal not found');
    }

    // Allow updating basic fields; keep stage unchanged here.
    const updatePayload = {
      contact_id: payload.contact_id ?? null,
      contact_address_id: payload.contact_address_id ?? null,
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email,
      phone: payload.phone,
      lead_source: payload.lead_source,
      salesperson: payload.salesperson,
      project_manager: payload.project_manager,
      assigned_to: sanitizeUserId(payload.assigned_to),
      crew_id: payload.crew_id ?? null,
      disable_drips: payload.disable_drips ?? false,
      service_address: payload.service_address ?? undefined,
    };

    const deal = await DealRepository.updateDeal(id, updatePayload);
    res.json(deal);
  })
);

// DELETE /:id - Delete a deal permanently
router.delete(
  '/:id',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if deal exists
    const existingDeal = await DealRepository.getDealById(id);
    if (!existingDeal) {
      throw new NotFoundError('Deal not found');
    }

    // Cancel any pending drip jobs for this deal before deletion
    await DripSequenceRepository.cancelPendingDripJobsForDeal(id, 'Deal deleted');

    await DealRepository.deleteDeal(id);
    res.json({ success: true, message: 'Deal deleted successfully' });
  })
);

// POST /:id/archive - Archive a deal (soft delete)
router.post(
  '/:id/archive',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if deal exists
    const existingDeal = await DealRepository.getDealById(id);
    if (!existingDeal) {
      throw new NotFoundError('Deal not found');
    }

    // Cancel any pending drip jobs for this deal
    await DripSequenceRepository.cancelPendingDripJobsForDeal(id, 'Deal archived');

    const deal = await DealRepository.archiveDeal(id);
    res.json(deal);
  })
);

// POST /:id/unarchive - Unarchive a deal
router.post(
  '/:id/unarchive',
  requireResourceAccess({ resourceType: 'deal' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deal = await DealRepository.unarchiveDeal(id);
    res.json(deal);
  })
);

export default router;
