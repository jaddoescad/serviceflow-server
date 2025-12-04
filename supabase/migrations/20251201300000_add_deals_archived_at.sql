-- Add archived_at column to deals table for soft archiving
ALTER TABLE deals ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for filtering non-archived deals
CREATE INDEX IF NOT EXISTS idx_deals_archived_at ON deals(archived_at) WHERE archived_at IS NULL;

-- Comment for documentation
COMMENT ON COLUMN deals.archived_at IS 'Timestamp when deal was archived. NULL means deal is active.';
