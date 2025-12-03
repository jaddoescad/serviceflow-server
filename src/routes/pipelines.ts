import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../lib/errors';
import * as PipelineService from '../services/pipeline-service';
import * as PipelineRepository from '../repositories/pipeline-repository';
import { requireCompanyAccess, requireCompanyAdmin } from '../middleware/authorization';

const router = Router();

/**
 * GET /pipelines
 * Get all pipelines with their stages for the authorized company
 */
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const companyId = req.authorizedCompanyId!;
    const pipelines = await PipelineService.getPipelinesWithStages(companyId);
    res.json(pipelines);
  })
);

/**
 * GET /pipelines/stages
 * Get all stages for the authorized company, optionally filtered by pipeline
 */
router.get(
  '/stages',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const companyId = req.authorizedCompanyId!;
    const pipelineKey = req.query.pipeline as string | undefined;
    const stages = await PipelineService.getPipelineStages(companyId, pipelineKey);
    res.json(stages);
  })
);

/**
 * GET /pipelines/stages/keys
 * Get stage keys for a pipeline (for deal filtering)
 */
router.get(
  '/stages/keys',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const companyId = req.authorizedCompanyId!;
    const pipelineKey = req.query.pipeline as string;

    if (!pipelineKey) {
      throw new ValidationError('pipeline query parameter is required');
    }

    const stageKeys = await PipelineService.getStageKeysForPipeline(companyId, pipelineKey);
    res.json(stageKeys);
  })
);

/**
 * PATCH /pipelines/:id
 * Update a pipeline's details (admin only)
 */
router.patch(
  '/:id',
  requireCompanyAdmin(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    // Verify pipeline belongs to company
    const pipeline = await PipelineRepository.getPipelineById(id);
    if (!pipeline) {
      throw new NotFoundError('Pipeline not found');
    }
    if (pipeline.company_id !== req.authorizedCompanyId) {
      throw new ForbiddenError('Access denied');
    }

    const updated = await PipelineService.updatePipeline(id, { name, description });
    res.json(updated);
  })
);

/**
 * POST /pipelines/stages
 * Create a new custom stage (admin only)
 */
router.post(
  '/stages',
  requireCompanyAdmin(),
  asyncHandler(async (req, res) => {
    const companyId = req.authorizedCompanyId!;
    const { pipeline_key, stage_key, name, description, color, is_win_stage, is_loss_stage } = req.body;

    if (!pipeline_key || !stage_key || !name) {
      throw new ValidationError('pipeline_key, stage_key, and name are required');
    }

    try {
      const stage = await PipelineService.createStage({
        companyId,
        pipelineKey: pipeline_key,
        stageKey: stage_key,
        name,
        description,
        color,
        isWinStage: is_win_stage,
        isLossStage: is_loss_stage,
      });

      res.status(201).json(stage);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ConflictError(error.message);
      }
      if (error instanceof Error && error.message.includes('must start with')) {
        throw new ValidationError(error.message);
      }
      throw error;
    }
  })
);

/**
 * PATCH /pipelines/stages/:id
 * Update a stage (admin only)
 */
router.patch(
  '/stages/:id',
  requireCompanyAdmin(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, color, is_win_stage, is_loss_stage } = req.body;

    // Verify stage belongs to company
    const stage = await PipelineRepository.getStageById(id);
    if (!stage) {
      throw new NotFoundError('Stage not found');
    }
    if (stage.company_id !== req.authorizedCompanyId) {
      throw new ForbiddenError('Access denied');
    }

    const updated = await PipelineService.updateStage(id, {
      name,
      description,
      color,
      isWinStage: is_win_stage,
      isLossStage: is_loss_stage,
    });

    res.json(updated);
  })
);

/**
 * DELETE /pipelines/stages/:id
 * Delete a custom stage (admin only)
 */
router.delete(
  '/stages/:id',
  requireCompanyAdmin(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify stage belongs to company
    const stage = await PipelineRepository.getStageById(id);
    if (!stage) {
      throw new NotFoundError('Stage not found');
    }
    if (stage.company_id !== req.authorizedCompanyId) {
      throw new ForbiddenError('Access denied');
    }

    try {
      await PipelineService.deleteStage(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot delete default')) {
        throw new ValidationError(error.message);
      }
      throw error;
    }
  })
);

/**
 * POST /pipelines/:id/stages/reorder
 * Reorder stages within a pipeline (admin only)
 */
router.post(
  '/:id/stages/reorder',
  requireCompanyAdmin(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { stage_order } = req.body;

    if (!Array.isArray(stage_order)) {
      throw new ValidationError('stage_order must be an array of stage IDs');
    }

    // Verify pipeline belongs to company
    const pipeline = await PipelineRepository.getPipelineById(id);
    if (!pipeline) {
      throw new NotFoundError('Pipeline not found');
    }
    if (pipeline.company_id !== req.authorizedCompanyId) {
      throw new ForbiddenError('Access denied');
    }

    const stages = await PipelineService.reorderStages(id, stage_order);
    res.json(stages);
  })
);

export default router;
