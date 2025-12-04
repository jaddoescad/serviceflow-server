-- Proposal attachments table for quote image uploads
CREATE TABLE IF NOT EXISTS proposal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  thumbnail_key TEXT,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  uploaded_by_user_id UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_attachments_company_id ON proposal_attachments(company_id);
CREATE INDEX IF NOT EXISTS idx_proposal_attachments_deal_id ON proposal_attachments(deal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_attachments_quote_id ON proposal_attachments(quote_id);
