CREATE TABLE IF NOT EXISTS deal_drip_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES drip_sequences(id) ON DELETE SET NULL,
  step_id UUID REFERENCES drip_steps(id) ON DELETE SET NULL,
  stage_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  message_subject TEXT,
  message_body TEXT,
  sms_body TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_drip_jobs_company_id ON deal_drip_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_deal_drip_jobs_deal_id ON deal_drip_jobs(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_drip_jobs_status_send_at ON deal_drip_jobs(status, send_at);
