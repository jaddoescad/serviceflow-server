-- Remove estimate_scheduled drip sequences
-- The estimate_scheduled stage should not have automated drips

-- Delete drip steps for estimate_scheduled sequences first (foreign key constraint)
DELETE FROM drip_steps
WHERE sequence_id IN (
  SELECT id FROM drip_sequences WHERE stage_id = 'estimate_scheduled'
);

-- Delete the drip sequences for estimate_scheduled
DELETE FROM drip_sequences WHERE stage_id = 'estimate_scheduled';
