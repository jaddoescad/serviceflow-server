// Pipeline stage definitions for server-side filtering.
//
// NOTE: Pipeline stages are now stored in the database (pipelines and pipeline_stages tables).
// Use PipelineRepository.getPipelineStageKeys() for dynamic, company-specific stages.
//
// These static definitions are kept for backward compatibility and as fallback defaults.
// They match the default stages created by initialize_company_pipelines() in the database.

export const DEFAULT_PIPELINE_STAGES = {
  sales: [
    'cold_leads',
    'estimate_scheduled',
    'in_draft',
    'proposals_sent',
    'proposals_rejected',
  ],
  jobs: [
    'project_accepted',
    'project_scheduled',
    'project_in_progress',
    'project_complete',
  ],
} as const;

// Legacy alias for backward compatibility
export const PIPELINE_STAGES = DEFAULT_PIPELINE_STAGES;

type PipelineKey = keyof typeof DEFAULT_PIPELINE_STAGES;

/**
 * @deprecated Use PipelineRepository.getPipelineStageKeys() for company-specific stages
 * This function returns default stages and should only be used as a fallback
 */
export const getPipelineStages = (pipeline?: string): string[] | null => {
  const key = pipeline && pipeline in DEFAULT_PIPELINE_STAGES ? (pipeline as PipelineKey) : null;
  return key ? [...DEFAULT_PIPELINE_STAGES[key]] : null;
};

/**
 * @deprecated Use PipelineRepository.getPipelineStageKeys() for company-specific stages
 * This function returns default stages and should only be used as a fallback
 */
export const getPipelineStageSet = (pipeline?: string): Set<string> | null => {
  const stages = getPipelineStages(pipeline);
  return stages ? new Set(stages) : null;
};

