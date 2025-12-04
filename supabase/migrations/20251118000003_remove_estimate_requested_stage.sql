-- Migrate data away from the removed "estimate_requested" stage
UPDATE deals
SET stage = 'warm_leads'
WHERE stage = 'estimate_requested';

UPDATE drip_sequences
SET stage_id = 'warm_leads'
WHERE stage_id = 'estimate_requested';

UPDATE deal_drip_jobs
SET stage_id = 'warm_leads'
WHERE stage_id = 'estimate_requested';
