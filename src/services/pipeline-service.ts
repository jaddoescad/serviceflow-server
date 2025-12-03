import * as PipelineRepository from '../repositories/pipeline-repository';
import type {
  Pipeline,
  PipelineStage,
  PipelineStageWithPipeline,
  PipelineWithStages,
} from '../repositories/pipeline-repository';

/**
 * Pipeline Service
 * Handles business logic for pipeline and stage management
 */

/**
 * Get all pipelines with their stages for a company
 */
export async function getPipelinesWithStages(companyId: string): Promise<PipelineWithStages[]> {
  return PipelineRepository.getPipelinesWithStages(companyId);
}

/**
 * Get pipeline stages for a company, optionally filtered by pipeline key
 */
export async function getPipelineStages(
  companyId: string,
  pipelineKey?: string
): Promise<PipelineStageWithPipeline[]> {
  return PipelineRepository.getPipelineStages(companyId, pipelineKey);
}

/**
 * Get stage keys for deal filtering
 * This replaces the hardcoded getPipelineStages from config/pipelines.ts
 */
export async function getStageKeysForPipeline(
  companyId: string,
  pipelineKey: string
): Promise<string[]> {
  return PipelineRepository.getPipelineStageKeys(companyId, pipelineKey);
}

/**
 * Validate that a stage key exists for a company
 */
export async function validateStageKey(
  companyId: string,
  stageKey: string
): Promise<boolean> {
  const stages = await PipelineRepository.getPipelineStages(companyId);
  return stages.some((stage) => stage.stage_key === stageKey);
}

/**
 * Get the pipeline key for a given stage key
 */
export async function getPipelineKeyForStage(
  companyId: string,
  stageKey: string
): Promise<string | null> {
  const stages = await PipelineRepository.getPipelineStages(companyId);
  const stage = stages.find((s) => s.stage_key === stageKey);
  return stage?.pipeline_key ?? null;
}

/**
 * Update a pipeline's details
 */
export async function updatePipeline(
  pipelineId: string,
  updates: {
    name?: string;
    description?: string | null;
  }
): Promise<Pipeline> {
  return PipelineRepository.updatePipeline(pipelineId, updates);
}

/**
 * Create a new custom stage
 */
export async function createStage(params: {
  companyId: string;
  pipelineKey: string;
  stageKey: string;
  name: string;
  description?: string | null;
  color?: string | null;
  isWinStage?: boolean;
  isLossStage?: boolean;
}): Promise<PipelineStage> {
  // Get the pipeline
  const pipeline = await PipelineRepository.getPipelineByKey(params.companyId, params.pipelineKey);
  if (!pipeline) {
    throw new Error(`Pipeline '${params.pipelineKey}' not found`);
  }

  // Validate stage_key format (lowercase, underscores, alphanumeric)
  if (!/^[a-z][a-z0-9_]*$/.test(params.stageKey)) {
    throw new Error('Stage key must start with a letter and contain only lowercase letters, numbers, and underscores');
  }

  // Check for duplicate stage key
  const existingStages = await PipelineRepository.getPipelineStages(params.companyId, params.pipelineKey);
  if (existingStages.some((s) => s.stage_key === params.stageKey)) {
    throw new Error(`Stage key '${params.stageKey}' already exists in this pipeline`);
  }

  // Calculate position (add to end)
  const maxPosition = Math.max(...existingStages.map((s) => s.position), -1);

  return PipelineRepository.createStage({
    company_id: params.companyId,
    pipeline_id: pipeline.id,
    stage_key: params.stageKey,
    name: params.name,
    description: params.description,
    position: maxPosition + 1,
    color: params.color,
    is_win_stage: params.isWinStage,
    is_loss_stage: params.isLossStage,
  });
}

/**
 * Update a stage
 */
export async function updateStage(
  stageId: string,
  updates: {
    name?: string;
    description?: string | null;
    color?: string | null;
    isWinStage?: boolean;
    isLossStage?: boolean;
  }
): Promise<PipelineStage> {
  const updateData: Parameters<typeof PipelineRepository.updateStage>[1] = {};

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }
  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }
  if (updates.isWinStage !== undefined) {
    updateData.is_win_stage = updates.isWinStage;
  }
  if (updates.isLossStage !== undefined) {
    updateData.is_loss_stage = updates.isLossStage;
  }

  return PipelineRepository.updateStage(stageId, updateData);
}

/**
 * Delete a custom stage
 */
export async function deleteStage(stageId: string): Promise<void> {
  return PipelineRepository.deleteStage(stageId);
}

/**
 * Reorder stages within a pipeline
 */
export async function reorderStages(
  pipelineId: string,
  stageOrder: string[]
): Promise<PipelineStage[]> {
  const stagePositions = stageOrder.map((id, index) => ({
    id,
    position: index,
  }));

  return PipelineRepository.reorderStages(pipelineId, stagePositions);
}

/**
 * Get stage display info (for UI theming)
 * Returns color classes based on stage color
 */
export function getStageTheme(color: string | null): {
  backgroundClass: string;
  borderClass: string;
  textClass: string;
  countTextClass: string;
} {
  const colorMap: Record<string, { backgroundClass: string; borderClass: string; textClass: string; countTextClass: string }> = {
    sky: { backgroundClass: 'bg-sky-50', borderClass: 'border-sky-200', textClass: 'text-sky-800', countTextClass: 'text-sky-600' },
    indigo: { backgroundClass: 'bg-indigo-50', borderClass: 'border-indigo-200', textClass: 'text-indigo-800', countTextClass: 'text-indigo-600' },
    slate: { backgroundClass: 'bg-slate-100', borderClass: 'border-slate-200', textClass: 'text-slate-800', countTextClass: 'text-slate-600' },
    emerald: { backgroundClass: 'bg-emerald-50', borderClass: 'border-emerald-200', textClass: 'text-emerald-800', countTextClass: 'text-emerald-600' },
    rose: { backgroundClass: 'bg-rose-50', borderClass: 'border-rose-200', textClass: 'text-rose-800', countTextClass: 'text-rose-600' },
    lime: { backgroundClass: 'bg-lime-50', borderClass: 'border-lime-200', textClass: 'text-lime-800', countTextClass: 'text-lime-600' },
    teal: { backgroundClass: 'bg-teal-50', borderClass: 'border-teal-200', textClass: 'text-teal-800', countTextClass: 'text-teal-600' },
    blue: { backgroundClass: 'bg-blue-50', borderClass: 'border-blue-200', textClass: 'text-blue-800', countTextClass: 'text-blue-600' },
    fuchsia: { backgroundClass: 'bg-fuchsia-50', borderClass: 'border-fuchsia-200', textClass: 'text-fuchsia-800', countTextClass: 'text-fuchsia-600' },
    amber: { backgroundClass: 'bg-amber-50', borderClass: 'border-amber-200', textClass: 'text-amber-800', countTextClass: 'text-amber-600' },
    violet: { backgroundClass: 'bg-violet-50', borderClass: 'border-violet-200', textClass: 'text-violet-800', countTextClass: 'text-violet-600' },
    cyan: { backgroundClass: 'bg-cyan-50', borderClass: 'border-cyan-200', textClass: 'text-cyan-800', countTextClass: 'text-cyan-600' },
    orange: { backgroundClass: 'bg-orange-50', borderClass: 'border-orange-200', textClass: 'text-orange-800', countTextClass: 'text-orange-600' },
    pink: { backgroundClass: 'bg-pink-50', borderClass: 'border-pink-200', textClass: 'text-pink-800', countTextClass: 'text-pink-600' },
  };

  return colorMap[color ?? 'slate'] ?? colorMap.slate;
}
