-- Simplify create_or_update_quote_with_items response
-- Returns only what's needed: IDs for new records, success confirmation

CREATE OR REPLACE FUNCTION create_or_update_quote_with_items(
  p_quote_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_quote_number TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_client_message TEXT DEFAULT NULL,
  p_disclaimer TEXT DEFAULT NULL,
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
  v_public_share_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_client_id TEXT;
  v_position INT := 0;
  v_new_line_item_ids JSONB := '[]'::JSONB;
BEGIN
  -- Validate required fields for new quote
  IF p_quote_id IS NULL AND (p_company_id IS NULL OR p_deal_id IS NULL) THEN
    RAISE EXCEPTION 'company_id and deal_id are required for new quotes';
  END IF;

  -- Generate quote number if not provided
  v_resolved_quote_number := COALESCE(NULLIF(TRIM(p_quote_number), ''), 'Q-' || EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- 1. Create or update quote
  IF p_quote_id IS NOT NULL THEN
    -- Update existing quote
    UPDATE quotes
    SET
      title = COALESCE(NULLIF(TRIM(p_title), ''), title),
      status = COALESCE(p_status, status),
      quote_number = COALESCE(NULLIF(TRIM(p_quote_number), ''), quote_number),
      client_message = p_client_message,
      disclaimer = p_disclaimer,
      updated_at = NOW()
    WHERE id = p_quote_id
    RETURNING id, public_share_id INTO v_quote_id, v_public_share_id;

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
      client_message,
      disclaimer,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      p_deal_id,
      v_resolved_quote_number,
      COALESCE(NULLIF(TRIM(p_title), ''), v_resolved_quote_number),
      p_status,
      p_client_message,
      p_disclaimer,
      NOW(),
      NOW()
    )
    RETURNING id, quote_number, public_share_id INTO v_quote_id, v_resolved_quote_number, v_public_share_id;

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
    -- Check if this is a new item (no id provided)
    IF (v_item->>'id') IS NULL THEN
      v_item_id := gen_random_uuid();
      v_client_id := v_item->>'client_id';

      -- Track new line item IDs for response
      v_new_line_item_ids := v_new_line_item_ids || jsonb_build_object(
        'id', v_item_id,
        'client_id', v_client_id
      );
    ELSE
      v_item_id := (v_item->>'id')::UUID;
    END IF;

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

  -- 4. Return minimal response
  -- For new quotes: include id, quote_number, public_share_id
  -- For new line items: include their assigned IDs
  -- Otherwise: just success confirmation
  RETURN json_build_object(
    'success', TRUE,
    'id', v_quote_id,
    'quote_number', v_resolved_quote_number,
    'public_share_id', v_public_share_id,
    'is_new', v_is_new,
    'new_line_items', v_new_line_item_ids
  );
END;
$$;
