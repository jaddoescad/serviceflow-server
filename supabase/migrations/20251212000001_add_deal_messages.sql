-- DEAL MESSAGES (chat-style conversation per deal)
CREATE TABLE IF NOT EXISTS deal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  image_storage_key TEXT,
  image_original_filename TEXT,
  image_content_type TEXT,
  image_byte_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT deal_messages_body_or_image CHECK (
    (body IS NOT NULL AND char_length(btrim(body)) > 0) OR (image_storage_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS deal_messages_deal_id_created_at_idx
  ON deal_messages (deal_id, created_at);

-- Ensure a private storage bucket exists for message images
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-message-attachments', 'deal-message-attachments', FALSE)
ON CONFLICT (id) DO NOTHING;

