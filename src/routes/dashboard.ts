import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError } from '../lib/errors';
import * as DealRepository from '../repositories/deal-repository';
import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import * as QuoteRepository from '../repositories/quote-repository';
import * as RpcRepository from '../repositories/rpc-repository';
import { requireCompanyAccess } from '../middleware/authorization';
import type { DashboardDeal, DashboardQuote, Appointment, DealWithRelations } from '../types/api';

const router = Router();

/**
 * Raw deal type from database with potentially array-wrapped latest_appointment
 */
type RawDeal = Omit<DashboardDeal, 'latest_appointment'> & {
  latest_appointment?: Appointment | Appointment[] | null;
};

/**
 * Normalizes the latest_appointment field to always be a single object or null
 */
const normalizeLatestAppointment = (deal: RawDeal | null): DashboardDeal | null => {
  if (!deal) return deal;

  const latest = Array.isArray(deal.latest_appointment)
    ? deal.latest_appointment[0] ?? null
    : deal.latest_appointment ?? null;

  return { ...deal, latest_appointment: latest };
};

/**
 * Proposal summary type for dashboard
 */
interface ProposalSummary {
  dealId: string;
  quoteCount: number;
  totalAmount: number;
  latestStatus: string;
  latestUpdatedAt: string;
  latestQuoteId: string | null;
}

/**
 * Quote line item for summary calculation
 */
interface QuoteLineItemForSummary {
  quantity?: number;
  unit_price?: number;
  is_change_order?: boolean;
  change_order_id?: string | null;
}

/**
 * Quote type for summary building
 */
interface QuoteForSummary {
  id: string;
  deal_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  line_items?: QuoteLineItemForSummary[];
}

/**
 * Build proposal summaries from quotes
 */
const buildProposalSummaries = (quotes: QuoteForSummary[]): ProposalSummary[] => {
  const summaries = new Map<string, ProposalSummary>();

  for (const quote of quotes ?? []) {
    const dealId = quote.deal_id;
    if (!dealId) continue;

    const lineItems = Array.isArray(quote.line_items)
      ? quote.line_items.filter((item) => !item.is_change_order && !item.change_order_id)
      : [];
    const totalAmount = lineItems.reduce((sum, item) => {
      const quantity = Number(item?.quantity ?? 0);
      const unitPrice = Number(item?.unit_price ?? 0);
      return sum + quantity * unitPrice;
    }, 0);

    const updatedAt = quote.updated_at ?? quote.created_at ?? new Date().toISOString();
    const updatedAtTime = Date.parse(updatedAt) || 0;
    const existing = summaries.get(dealId);
    const existingTime = existing ? Date.parse(existing.latestUpdatedAt) || 0 : -Infinity;
    const isLatest = updatedAtTime >= existingTime;

    const next: ProposalSummary = existing
      ? {
          ...existing,
          quoteCount: existing.quoteCount + 1,
          totalAmount: existing.totalAmount + totalAmount, // Sum all quote totals
        }
      : {
          dealId,
          quoteCount: 1,
          totalAmount,
          latestStatus: quote.status,
          latestUpdatedAt: updatedAt,
          latestQuoteId: quote.id,
        };

    if (isLatest) {
      // Only update latest status/quote info, not totalAmount (which is now a sum)
      next.latestStatus = quote.status;
      next.latestUpdatedAt = updatedAt;
      next.latestQuoteId = quote.id;
    }

    summaries.set(dealId, next);
  }

  return Array.from(summaries.values());
};

// GET /:companyId - Get all dashboard data in a single request - requires company membership
router.get(
  '/:companyId',
  requireCompanyAccess({ companyIdParam: 'companyId' }),
  asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { pipeline_id = 'sales' } = req.query;

    if (!companyId) {
      throw new ValidationError('companyId is required');
    }

    // Try RPC first, fall back to parallel queries if RPC not available
    const rpcData = await RpcRepository.getDashboardData(companyId, pipeline_id as string);

    if (rpcData) {
      // RPC available - use optimized single call
      const normalizedDeals = (rpcData.deals ?? []).map(normalizeLatestAppointment);
      const proposalSummaries = buildProposalSummaries(rpcData.quotes ?? []);

      return res.json({
        deals: normalizedDeals,
        dripSequences: rpcData.dripSequences ?? [],
        proposalSummaries,
      });
    }

    // Fallback: fetch all data in parallel (original approach)
    const [deals, dripSequences, quotes] = await Promise.all([
      DealRepository.getDeals({ company_id: companyId, exclude_archived: true }),
      DripSequenceRepository.getDripSequences({
        company_id: companyId,
        pipeline_id: pipeline_id as string,
      }),
      QuoteRepository.getQuotesWithSummary(companyId),
    ]);

    // Normalize deals
    const normalizedDeals = deals.map(normalizeLatestAppointment);

    // Build proposal summaries
    const proposalSummaries = buildProposalSummaries(quotes);

    res.json({
      deals: normalizedDeals,
      dripSequences,
      proposalSummaries,
    });
  })
);

export default router;
