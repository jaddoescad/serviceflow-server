import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

/**
 * Pipeline type definitions
 */
export type Pipeline = {
  id: string;
  company_id: string;
  pipeline_key: string;
  name: string;
  description: string | null;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type PipelineStage = {
  id: string;
  company_id: string;
  pipeline_id: string;
  stage_key: string;
  name: string;
  description: string | null;
  position: number;
  color: string | null;
  is_default: boolean;
  is_win_stage: boolean;
  is_loss_stage: boolean;
  created_at: string;
  updated_at: string;
};

export type PipelineStageWithPipeline = PipelineStage & {
  pipeline_key: string;
  pipeline_name: string;
};

export type PipelineWithStages = Pipeline & {
  stages: PipelineStage[];
};

/**
 * Pipeline Repository
 * Handles all database operations for pipelines and pipeline stages
 */

/**
 * Get all pipelines for a company
 */
export async function getPipelines(companyId: string): Promise<Pipeline[]> {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('company_id', companyId)
    .order('position', { ascending: true });

  if (error) {
    throw new DatabaseError('Failed to fetch pipelines', error);
  }

  return data ?? [];
}

/**
 * Get a pipeline by ID
 */
export async function getPipelineById(pipelineId: string): Promise<Pipeline | null> {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('id', pipelineId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch pipeline', error);
  }

  return data;
}

/**
 * Get a pipeline by key for a company
 */
export async function getPipelineByKey(
  companyId: string,
  pipelineKey: string
): Promise<Pipeline | null> {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('company_id', companyId)
    .eq('pipeline_key', pipelineKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch pipeline', error);
  }

  return data;
}

/**
 * Get pipelines with their stages
 */
export async function getPipelinesWithStages(companyId: string): Promise<PipelineWithStages[]> {
  const { data, error } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('company_id', companyId)
    .order('position', { ascending: true });

  if (error) {
    throw new DatabaseError('Failed to fetch pipelines with stages', error);
  }

  // Sort stages by position within each pipeline
  return (data ?? []).map((pipeline) => ({
    ...pipeline,
    stages: (pipeline.stages ?? []).sort(
      (a: PipelineStage, b: PipelineStage) => a.position - b.position
    ),
  }));
}

/**
 * Update a pipeline
 */
export async function updatePipeline(
  pipelineId: string,
  updates: Partial<Pick<Pipeline, 'name' | 'description' | 'position'>>
): Promise<Pipeline> {
  const { data, error } = await supabase
    .from('pipelines')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pipelineId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update pipeline', error);
  }

  return data;
}

/**
 * Get all stages for a company, optionally filtered by pipeline
 */
export async function getPipelineStages(
  companyId: string,
  pipelineKey?: string
): Promise<PipelineStageWithPipeline[]> {
  // Use RPC function for proper initialization and querying
  const { data, error } = await supabase.rpc('get_pipeline_stages', {
    p_company_id: companyId,
    p_pipeline_key: pipelineKey || null,
  });

  if (error) {
    throw new DatabaseError('Failed to fetch pipeline stages', error);
  }

  // Map the RPC response to match our expected type
  // The RPC returns stage_position instead of position
  const stages = (data ?? []) as Array<{
    id: string;
    company_id: string;
    pipeline_id: string;
    pipeline_key: string;
    pipeline_name: string;
    stage_key: string;
    name: string;
    description: string | null;
    stage_position: number;
    color: string | null;
    is_default: boolean;
    is_win_stage: boolean;
    is_loss_stage: boolean;
  }>;

  return stages.map((stage) => ({
    id: stage.id,
    company_id: stage.company_id,
    pipeline_id: stage.pipeline_id,
    pipeline_key: stage.pipeline_key,
    pipeline_name: stage.pipeline_name,
    stage_key: stage.stage_key,
    name: stage.name,
    description: stage.description,
    position: stage.stage_position,
    color: stage.color,
    is_default: stage.is_default,
    is_win_stage: stage.is_win_stage,
    is_loss_stage: stage.is_loss_stage,
    created_at: '', // Not returned by RPC
    updated_at: '', // Not returned by RPC
  }));
}

/**
 * Get stage keys for a pipeline (for deal filtering)
 */
export async function getPipelineStageKeys(
  companyId: string,
  pipelineKey: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_pipeline_stage_keys', {
    p_company_id: companyId,
    p_pipeline_key: pipelineKey,
  });

  if (error) {
    throw new DatabaseError('Failed to fetch pipeline stage keys', error);
  }

  return data ?? [];
}

/**
 * Get a single stage by ID
 */
export async function getStageById(stageId: string): Promise<PipelineStage | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('id', stageId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch stage', error);
  }

  return data;
}

/**
 * Get a stage by key within a pipeline
 */
export async function getStageByKey(
  companyId: string,
  pipelineKey: string,
  stageKey: string
): Promise<PipelineStage | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select(`
      *,
      pipeline:pipelines!inner(pipeline_key)
    `)
    .eq('company_id', companyId)
    .eq('stage_key', stageKey)
    .eq('pipeline.pipeline_key', pipelineKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new DatabaseError('Failed to fetch stage', error);
  }

  return data;
}

/**
 * Create a new stage
 */
export async function createStage(stageData: {
  company_id: string;
  pipeline_id: string;
  stage_key: string;
  name: string;
  description?: string | null;
  position: number;
  color?: string | null;
  is_win_stage?: boolean;
  is_loss_stage?: boolean;
}): Promise<PipelineStage> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .insert([{
      ...stageData,
      is_default: false, // Custom stages are never default
      is_win_stage: stageData.is_win_stage ?? false,
      is_loss_stage: stageData.is_loss_stage ?? false,
    }])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create stage', error);
  }

  return data;
}

/**
 * Update a stage
 */
export async function updateStage(
  stageId: string,
  updates: Partial<Pick<PipelineStage, 'name' | 'description' | 'position' | 'color' | 'is_win_stage' | 'is_loss_stage'>>
): Promise<PipelineStage> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stageId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to update stage', error);
  }

  return data;
}

/**
 * Delete a stage (only non-default stages can be deleted)
 */
export async function deleteStage(stageId: string): Promise<void> {
  // First check if the stage is a default stage
  const stage = await getStageById(stageId);
  if (!stage) {
    throw new DatabaseError('Stage not found');
  }
  if (stage.is_default) {
    throw new DatabaseError('Cannot delete default stages');
  }

  const { error } = await supabase
    .from('pipeline_stages')
    .delete()
    .eq('id', stageId);

  if (error) {
    throw new DatabaseError('Failed to delete stage', error);
  }
}

/**
 * Reorder stages within a pipeline
 */
export async function reorderStages(
  pipelineId: string,
  stagePositions: { id: string; position: number }[]
): Promise<PipelineStage[]> {
  // Update each stage's position
  const updates = stagePositions.map(({ id, position }) =>
    supabase
      .from('pipeline_stages')
      .update({ position, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('pipeline_id', pipelineId)
  );

  const results = await Promise.all(updates);

  // Check for errors
  for (const result of results) {
    if (result.error) {
      throw new DatabaseError('Failed to reorder stages', result.error);
    }
  }

  // Fetch and return updated stages
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true });

  if (error) {
    throw new DatabaseError('Failed to fetch reordered stages', error);
  }

  return data ?? [];
}
