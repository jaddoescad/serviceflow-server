-- Fix empty quote_number handling in create_or_update_quote_with_items
-- NULLIF converts empty strings to NULL so COALESCE can provide defaults

CREATE OR REPLACE FUNCTION create_or_update_quote_with_items(
  p_quote_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_quote_number TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_line_items JSONB DEFAULT '[]'::JSONB,
  p_deleted_line_item_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_resolved_quote_number TEXT;
  v_item JSONB;
  v_item_id UUID;
  v_position INT := 0;
BEGIN
  -- Validate required fields for new quote
  IF p_quote_id IS NULL AND (p_company_id IS NULL OR p_deal_id IS NULL) THEN
    RAISE EXCEPTION 'company_id and deal_id are required for new quotes';
  END IF;

  -- Generate quote number if not provided (treat empty string as null)
  v_resolved_quote_number := COALESCE(NULLIF(TRIM(p_quote_number), ''), 'Q-' || EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- 1. Create or update quote
  IF p_quote_id IS NOT NULL THEN
    -- Update existing quote (preserve existing values if new values are empty)
    UPDATE quotes
    SET
      title = COALESCE(NULLIF(TRIM(p_title), ''), title),
      status = COALESCE(p_status, status),
      quote_number = COALESCE(NULLIF(TRIM(p_quote_number), ''), quote_number),
      updated_at = NOW()
    WHERE id = p_quote_id
    RETURNING id INTO v_quote_id;

    IF v_quote_id IS NULL THEN
      RAISE EXCEPTION 'Quote not found';
    END IF;
  ELSE
    -- Create new quote
    v_is_new := TRUE;
    INSERT INTO quotes (
      company_id,
      deal_id,
      quote_number,
      title,
      status,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      p_deal_id,
      v_resolved_quote_number,
      COALESCE(NULLIF(TRIM(p_title), ''), v_resolved_quote_number),
      p_status,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_quote_id;

    -- Update deal stage to 'in_draft' for new quotes
    UPDATE deals
    SET stage = 'in_draft', updated_at = NOW()
    WHERE id = p_deal_id;
  END IF;

  -- 2. Delete removed line items
  IF array_length(p_deleted_line_item_ids, 1) > 0 THEN
    DELETE FROM quote_line_items
    WHERE id = ANY(p_deleted_line_item_ids)
      AND quote_id = v_quote_id;
  END IF;

  -- 3. Upsert line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    v_item_id := COALESCE((v_item->>'id')::UUID, gen_random_uuid());
    v_position := COALESCE((v_item->>'position')::INT, v_position);

    INSERT INTO quote_line_items (
      id,
      quote_id,
      name,
      description,
      quantity,
      unit_price,
      position,
      created_at,
      updated_at
    ) VALUES (
      v_item_id,
      v_quote_id,
      COALESCE(v_item->>'name', ''),
      v_item->>'description',
      COALESCE((v_item->>'quantity')::INT, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0),
      v_position,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      quantity = EXCLUDED.quantity,
      unit_price = EXCLUDED.unit_price,
      position = EXCLUDED.position,
      updated_at = NOW();

    v_position := v_position + 1;
  END LOOP;

  -- 4. Return the saved quote with line items
  RETURN (
    SELECT json_build_object(
      'id', q.id,
      'company_id', q.company_id,
      'deal_id', q.deal_id,
      'quote_number', q.quote_number,
      'title', q.title,
      'client_message', q.client_message,
      'disclaimer', q.disclaimer,
      'status', q.status,
      'public_share_id', q.public_share_id,
      'acceptance_signature', q.acceptance_signature,
      'acceptance_signed_at', q.acceptance_signed_at,
      'created_at', q.created_at,
      'updated_at', q.updated_at,
      'line_items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', li.id,
            'quote_id', li.quote_id,
            'name', li.name,
            'description', li.description,
            'quantity', li.quantity,
            'unit_price', li.unit_price,
            'position', li.position
          ) ORDER BY li.position
        ) FROM quote_line_items li
        WHERE li.quote_id = q.id
        AND (li.is_change_order IS NULL OR li.is_change_order = false)
        AND li.change_order_id IS NULL),
        '[]'::json
      )
    )
    FROM quotes q
    WHERE q.id = v_quote_id
  );
END;
$$;
