-- Add notes column to contacts table
-- This column is expected by the create_contact_with_addresses and update_contact_with_addresses RPC functions

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
