-- Add provider metadata + phone number context to deal_messages
ALTER TABLE deal_messages
  ADD COLUMN IF NOT EXISTS from_number TEXT,
  ADD COLUMN IF NOT EXISTS to_number TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS deal_messages_company_numbers_created_at_idx
  ON deal_messages (company_id, from_number, to_number, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS deal_messages_provider_message_id_unique
  ON deal_messages (provider, provider_message_id);

