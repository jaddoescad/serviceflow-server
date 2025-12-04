-- Update accept_quote_with_invoice RPC to handle signature_type parameter
CREATE OR REPLACE FUNCTION accept_quote_with_invoice(
  p_quote_id UUID,
  p_signature TEXT,
  p_accepted_at TIMESTAMPTZ DEFAULT NOW(),
  p_signature_type TEXT DEFAULT 'type'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote RECORD;
  v_deal_id UUID;
  v_company_id UUID;
  v_existing_invoice_id UUID;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_invoice_title TEXT;
  v_total_amount NUMERIC;
  v_line_items RECORD;
  v_issue_date TIMESTAMPTZ;
  v_due_date TIMESTAMPTZ;
  v_validated_signature_type TEXT;
BEGIN
  -- Validate signature_type
  v_validated_signature_type := CASE
    WHEN p_signature_type IN ('type', 'draw') THEN p_signature_type
    ELSE 'type'
  END;

  -- 1. Get and validate quote
  SELECT
    q.id,
    q.deal_id,
    q.company_id,
    q.status,
    q.title,
    q.quote_number
  INTO v_quote
  FROM quotes q
  WHERE q.id = p_quote_id;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.status = 'accepted' THEN
    RAISE EXCEPTION 'Quote already accepted';
  END IF;

  v_deal_id := v_quote.deal_id;
  v_company_id := v_quote.company_id;

  -- 2. Update quote with acceptance details (including signature_type)
  UPDATE quotes
  SET
    status = 'accepted',
    acceptance_signature = p_signature,
    signature_type = v_validated_signature_type,
    acceptance_signed_at = p_accepted_at,
    updated_at = p_accepted_at
  WHERE id = p_quote_id;

  -- 3. Update deal stage to project_accepted
  IF v_deal_id IS NOT NULL THEN
    UPDATE deals
    SET
      stage = 'project_accepted',
      updated_at = p_accepted_at
    WHERE id = v_deal_id;
  END IF;

  -- 4. Check if invoice already exists for this quote
  SELECT id INTO v_existing_invoice_id
  FROM invoices
  WHERE quote_id = p_quote_id
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    -- Invoice already exists, return it
    RETURN json_build_object(
      'quoteId', p_quote_id,
      'status', 'accepted',
      'signature', p_signature,
      'signatureType', v_validated_signature_type,
      'signedAt', p_accepted_at,
      'invoiceId', v_existing_invoice_id,
      'invoiceCreated', false
    );
  END IF;

  -- 5. Calculate total amount from line items (excluding change orders)
  SELECT COALESCE(SUM(
    COALESCE(li.quantity, 0) * COALESCE(li.unit_price, 0)
  ), 0) INTO v_total_amount
  FROM quote_line_items li
  WHERE li.quote_id = p_quote_id
    AND li.is_change_order = false
    AND li.change_order_id IS NULL;

  -- 6. Generate invoice number and set dates
  v_invoice_number := 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
  v_invoice_title := COALESCE(v_quote.title, v_quote.quote_number, v_invoice_number);
  v_issue_date := p_accepted_at;
  v_due_date := p_accepted_at + INTERVAL '14 days';

  -- 7. Create invoice
  INSERT INTO invoices (
    company_id,
    deal_id,
    quote_id,
    invoice_number,
    title,
    status,
    issue_date,
    due_date,
    total_amount,
    balance_due,
    created_at,
    updated_at
  ) VALUES (
    v_company_id,
    v_deal_id,
    p_quote_id,
    v_invoice_number,
    v_invoice_title,
    'unpaid',
    v_issue_date,
    v_due_date,
    v_total_amount,
    v_total_amount,
    p_accepted_at,
    p_accepted_at
  )
  RETURNING id INTO v_invoice_id;

  -- 8. Copy line items to invoice (excluding change orders)
  INSERT INTO invoice_line_items (
    invoice_id,
    name,
    description,
    quantity,
    unit_price,
    position,
    created_at,
    updated_at
  )
  SELECT
    v_invoice_id,
    li.name,
    li.description,
    li.quantity,
    li.unit_price,
    li.position,
    p_accepted_at,
    p_accepted_at
  FROM quote_line_items li
  WHERE li.quote_id = p_quote_id
    AND li.is_change_order = false
    AND li.change_order_id IS NULL
  ORDER BY li.position;

  -- 9. Return result
  RETURN json_build_object(
    'quoteId', p_quote_id,
    'status', 'accepted',
    'signature', p_signature,
    'signatureType', v_validated_signature_type,
    'signedAt', p_accepted_at,
    'invoiceId', v_invoice_id,
    'invoiceCreated', true,
    'invoiceNumber', v_invoice_number,
    'totalAmount', v_total_amount
  );
END;
$$;
