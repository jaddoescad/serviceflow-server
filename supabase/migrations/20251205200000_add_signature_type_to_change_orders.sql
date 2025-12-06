-- Add signature_type column to change_orders table
-- This allows storing whether the signature is typed text or a drawn image (base64)
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS signature_type TEXT DEFAULT 'type' CHECK (signature_type IN ('type', 'draw'));

-- Add comment for documentation
COMMENT ON COLUMN change_orders.signature_type IS 'Type of signature: "type" for typed name, "draw" for drawn signature (base64 PNG)';
