-- Add is_primary column to contact_addresses table
-- This column was referenced in the RPC functions but never created in the schema

ALTER TABLE contact_addresses
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;

-- Add a comment for documentation
COMMENT ON COLUMN contact_addresses.is_primary IS 'Indicates if this is the primary address for the contact';
