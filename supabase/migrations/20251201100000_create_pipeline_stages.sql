-- Create pipeline_stages table for dynamic, company-specific pipeline configuration
-- This replaces the hardcoded pipeline stages in server/src/config/pipelines.ts

-- Pipelines table (sales, jobs, or custom company pipelines)
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_key TEXT NOT NULL, -- 'sales', 'jobs', or custom key
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE, -- True for system-provided defaults
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, pipeline_key)
);

-- Pipeline stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL, -- 'cold_leads', 'estimate_scheduled', etc.
  name TEXT NOT NULL, -- Display name: 'Cold Leads', 'Estimate Scheduled'
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT, -- Optional color for UI theming
  is_default BOOLEAN NOT NULL DEFAULT FALSE, -- True for system-provided defaults
  is_win_stage BOOLEAN NOT NULL DEFAULT FALSE, -- True for stages that count as "won" deals
  is_loss_stage BOOLEAN NOT NULL DEFAULT FALSE, -- True for stages that count as "lost" deals
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, pipeline_id, stage_key)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pipelines_company_id ON pipelines(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_company_id ON pipeline_stages(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_stage_key ON pipeline_stages(stage_key);

-- Function to initialize default pipelines and stages for a company
CREATE OR REPLACE FUNCTION initialize_company_pipelines(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_sales_pipeline_id UUID;
  v_jobs_pipeline_id UUID;
BEGIN
  -- Check if pipelines already exist for this company
  IF EXISTS (SELECT 1 FROM pipelines WHERE company_id = p_company_id) THEN
    RETURN; -- Already initialized
  END IF;

  -- Create Sales Pipeline
  INSERT INTO pipelines (company_id, pipeline_key, name, description, position, is_default)
  VALUES (p_company_id, 'sales', 'Sales Pipeline', 'Track leads from initial contact to proposal acceptance', 0, TRUE)
  RETURNING id INTO v_sales_pipeline_id;

  -- Create Jobs Pipeline
  INSERT INTO pipelines (company_id, pipeline_key, name, description, position, is_default)
  VALUES (p_company_id, 'jobs', 'Jobs Pipeline', 'Track projects from acceptance to completion', 1, TRUE)
  RETURNING id INTO v_jobs_pipeline_id;

  -- Create Sales Pipeline Stages
  INSERT INTO pipeline_stages (company_id, pipeline_id, stage_key, name, position, color, is_default, is_loss_stage) VALUES
    (p_company_id, v_sales_pipeline_id, 'cold_leads', 'Cold Leads', 0, 'sky', TRUE, FALSE),
    (p_company_id, v_sales_pipeline_id, 'estimate_scheduled', 'Estimate Scheduled', 1, 'indigo', TRUE, FALSE),
    (p_company_id, v_sales_pipeline_id, 'in_draft', 'In Draft', 2, 'slate', TRUE, FALSE),
    (p_company_id, v_sales_pipeline_id, 'proposals_sent', 'Proposals Sent', 3, 'emerald', TRUE, FALSE),
    (p_company_id, v_sales_pipeline_id, 'proposals_rejected', 'Proposals Rejected', 4, 'rose', TRUE, TRUE);

  -- Create Jobs Pipeline Stages
  INSERT INTO pipeline_stages (company_id, pipeline_id, stage_key, name, position, color, is_default, is_win_stage) VALUES
    (p_company_id, v_jobs_pipeline_id, 'project_accepted', 'Project Accepted', 0, 'lime', TRUE, FALSE),
    (p_company_id, v_jobs_pipeline_id, 'project_scheduled', 'Project Scheduled', 1, 'teal', TRUE, FALSE),
    (p_company_id, v_jobs_pipeline_id, 'project_in_progress', 'Project In Progress', 2, 'blue', TRUE, FALSE),
    (p_company_id, v_jobs_pipeline_id, 'project_complete', 'Project Complete', 3, 'fuchsia', TRUE, TRUE);
END;
$$;

-- Function to get pipeline stages for a company and pipeline
CREATE OR REPLACE FUNCTION get_pipeline_stages(
  p_company_id UUID,
  p_pipeline_key TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Initialize pipelines if they don't exist
  PERFORM initialize_company_pipelines(p_company_id);

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.pipeline_position, t.stage_position), '[]'::json)
  INTO v_result
  FROM (
    SELECT
      ps.id,
      ps.company_id,
      ps.pipeline_id,
      p.pipeline_key,
      p.name AS pipeline_name,
      ps.stage_key,
      ps.name,
      ps.description,
      ps.position AS stage_position,
      p.position AS pipeline_position,
      ps.color,
      ps.is_default,
      ps.is_win_stage,
      ps.is_loss_stage
    FROM pipeline_stages ps
    JOIN pipelines p ON ps.pipeline_id = p.id
    WHERE ps.company_id = p_company_id
      AND (p_pipeline_key IS NULL OR p.pipeline_key = p_pipeline_key)
  ) t;

  RETURN v_result;
END;
$$;

-- Function to get stage keys for filtering (used by deal queries)
CREATE OR REPLACE FUNCTION get_pipeline_stage_keys(
  p_company_id UUID,
  p_pipeline_key TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage_keys TEXT[];
BEGIN
  -- Initialize pipelines if they don't exist
  PERFORM initialize_company_pipelines(p_company_id);

  SELECT ARRAY_AGG(ps.stage_key ORDER BY ps.position)
  INTO v_stage_keys
  FROM pipeline_stages ps
  JOIN pipelines p ON ps.pipeline_id = p.id
  WHERE ps.company_id = p_company_id
    AND p.pipeline_key = p_pipeline_key;

  RETURN COALESCE(v_stage_keys, ARRAY[]::TEXT[]);
END;
$$;

-- Trigger to auto-initialize pipelines when a company is created
CREATE OR REPLACE FUNCTION trigger_initialize_company_pipelines()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM initialize_company_pipelines(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS after_company_insert_init_pipelines ON companies;
CREATE TRIGGER after_company_insert_init_pipelines
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_company_pipelines();

-- Initialize pipelines for all existing companies
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM companies LOOP
    PERFORM initialize_company_pipelines(company_record.id);
  END LOOP;
END;
$$;
