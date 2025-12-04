-- Allow 'appointment_reminder' as a valid job_type
ALTER TABLE deal_drip_jobs DROP CONSTRAINT IF EXISTS deal_drip_jobs_job_type_check;

ALTER TABLE deal_drip_jobs ADD CONSTRAINT deal_drip_jobs_job_type_check
  CHECK (job_type IN ('drip', 'appointment_reminder'));
