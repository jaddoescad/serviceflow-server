-- ============================================================================
-- TRANSACTIONAL RPC FUNCTIONS
-- These functions wrap multi-step operations in database transactions to ensure
-- data consistency. If any step fails, all changes are rolled back.
-- ============================================================================

-- ============================================================================
-- 1. CREATE COMPANY WITH MEMBER (Transaction)
-- Creates a company and adds the creator as an admin member atomically.
-- If member creation fails, company is rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_company_with_member(
  p_user_id UUID,
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_owner_first_name TEXT DEFAULT NULL,
  p_owner_last_name TEXT DEFAULT NULL,
  p_employee_count TEXT DEFAULT NULL,
  p_phone_number TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
  v_member_id UUID;
  v_display_name TEXT;
BEGIN
  -- 1. Create the company
  INSERT INTO companies (
    user_id,
    name,
    email,
    owner_first_name,
    owner_last_name,
    employee_count,
    phone_number,
    website,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_name,
    p_email,
    p_owner_first_name,
    p_owner_last_name,
    p_employee_count,
    p_phone_number,
    p_website,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_company_id;

  -- 2. Create display name
  v_display_name := TRIM(COALESCE(p_owner_first_name, '') || ' ' || COALESCE(p_owner_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := NULL;
  END IF;

  -- 3. Add creator as admin member
  INSERT INTO company_members (
    company_id,
    user_id,
    role,
    email,
    display_name,
    created_at,
    updated_at
  ) VALUES (
    v_company_id,
    p_user_id,
    'admin',
    p_email,
    v_display_name,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_member_id;

  -- 4. Return result
  RETURN json_build_object(
    'company', json_build_object(
      'id', v_company_id,
      'user_id', p_user_id,
      'name', p_name,
      'email', p_email,
      'owner_first_name', p_owner_first_name,
      'owner_last_name', p_owner_last_name,
      'employee_count', p_employee_count,
      'phone_number', p_phone_number,
      'website', p_website
    ),
    'member', json_build_object(
      'id', v_member_id,
      'company_id', v_company_id,
      'user_id', p_user_id,
      'role', 'admin'
    )
  );
END;
$$;


-- ============================================================================
-- 2. CREATE OR UPDATE QUOTE WITH LINE ITEMS (Transaction)
-- Creates/updates a quote and manages line items atomically.
-- ============================================================================
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

  -- Generate quote number if not provided
  v_resolved_quote_number := COALESCE(p_quote_number, 'Q-' || EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- 1. Create or update quote
  IF p_quote_id IS NOT NULL THEN
    -- Update existing quote
    UPDATE quotes
    SET
      title = COALESCE(p_title, title),
      status = COALESCE(p_status, status),
      quote_number = COALESCE(p_quote_number, quote_number),
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
      COALESCE(p_title, v_resolved_quote_number),
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
      is_change_order,
      change_order_id,
      created_at,
      updated_at
    ) VALUES (
      v_item_id,
      v_quote_id,
      COALESCE(v_item->>'name', 'Item'),
      v_item->>'description',
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0),
      v_position,
      FALSE,
      NULL,
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

  -- 4. Return the quote with line items
  RETURN (
    SELECT json_build_object(
      'quote', row_to_json(q),
      'line_items', COALESCE(
        (SELECT json_agg(row_to_json(li) ORDER BY li.position)
         FROM quote_line_items li
         WHERE li.quote_id = v_quote_id),
        '[]'::JSON
      ),
      'is_new', v_is_new
    )
    FROM quotes q
    WHERE q.id = v_quote_id
  );
END;
$$;


-- ============================================================================
-- 3. CREATE OR UPDATE CHANGE ORDER WITH ITEMS (Transaction)
-- Creates/updates a change order and manages line items atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_or_update_change_order_with_items(
  p_company_id UUID,
  p_quote_id UUID,
  p_change_order_number TEXT,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_invoice_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote RECORD;
  v_change_order_id UUID;
  v_existing_id UUID;
  v_item JSONB;
  v_position INT := 0;
BEGIN
  -- 1. Validate quote exists and belongs to company
  SELECT id, deal_id, company_id
  INTO v_quote
  FROM quotes
  WHERE id = p_quote_id;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found for change order';
  END IF;

  IF v_quote.deal_id IS NULL THEN
    RAISE EXCEPTION 'Quote is missing a deal_id';
  END IF;

  IF v_quote.company_id IS NOT NULL AND v_quote.company_id != p_company_id THEN
    RAISE EXCEPTION 'Quote does not belong to the provided company';
  END IF;

  -- 2. Check if change order exists by number
  SELECT id INTO v_existing_id
  FROM change_orders
  WHERE company_id = p_company_id
    AND change_order_number = p_change_order_number;

  -- 3. Create or update change order
  IF v_existing_id IS NOT NULL THEN
    UPDATE change_orders
    SET
      deal_id = v_quote.deal_id,
      quote_id = p_quote_id,
      invoice_id = p_invoice_id,
      status = 'pending',
      updated_at = NOW()
    WHERE id = v_existing_id
    RETURNING id INTO v_change_order_id;
  ELSE
    INSERT INTO change_orders (
      company_id,
      deal_id,
      quote_id,
      invoice_id,
      change_order_number,
      status,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      v_quote.deal_id,
      p_quote_id,
      p_invoice_id,
      p_change_order_number,
      'pending',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_change_order_id;
  END IF;

  -- 4. Delete old items for this change order
  DELETE FROM quote_line_items
  WHERE change_order_id = v_change_order_id;

  -- 5. Insert new items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_position := COALESCE((v_item->>'position')::INT, v_position);

    INSERT INTO quote_line_items (
      quote_id,
      change_order_id,
      is_change_order,
      name,
      description,
      quantity,
      unit_price,
      position,
      created_at,
      updated_at
    ) VALUES (
      p_quote_id,
      v_change_order_id,
      TRUE,
      COALESCE(v_item->>'name', 'Change Order Item'),
      v_item->>'description',
      GREATEST(1, COALESCE((v_item->>'quantity')::NUMERIC, (v_item->>'qty')::NUMERIC, 1)),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0),
      v_position,
      NOW(),
      NOW()
    );

    v_position := v_position + 1;
  END LOOP;

  -- 6. Return the change order with items
  RETURN (
    SELECT json_build_object(
      'change_order', row_to_json(co),
      'items', COALESCE(
        (SELECT json_agg(row_to_json(li) ORDER BY li.position)
         FROM quote_line_items li
         WHERE li.change_order_id = v_change_order_id),
        '[]'::JSON
      )
    )
    FROM change_orders co
    WHERE co.id = v_change_order_id
  );
END;
$$;


-- ============================================================================
-- 4. ACCEPT CHANGE ORDER WITH INVOICE UPDATE (Transaction)
-- Accepts a change order, adds items to invoice, and updates totals atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_change_order_with_invoice(
  p_change_order_id UUID,
  p_invoice_id UUID,
  p_signer_name TEXT DEFAULT NULL,
  p_signer_email TEXT DEFAULT NULL,
  p_signature_text TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_change_order RECORD;
  v_invoice RECORD;
  v_delta NUMERIC := 0;
  v_new_total NUMERIC;
  v_new_balance NUMERIC;
  v_new_status TEXT;
  v_start_position INT;
  v_item RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Fetch and validate change order
  SELECT co.*,
         COALESCE(
           (SELECT json_agg(row_to_json(li))
            FROM quote_line_items li
            WHERE li.change_order_id = co.id),
           '[]'::JSON
         ) as items_json
  INTO v_change_order
  FROM change_orders co
  WHERE co.id = p_change_order_id;

  IF v_change_order IS NULL THEN
    RAISE EXCEPTION 'Change order not found';
  END IF;

  IF v_change_order.status = 'accepted' THEN
    RAISE EXCEPTION 'Change order already accepted';
  END IF;

  -- 2. Fetch and validate invoice
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- 3. Calculate change order total (delta)
  SELECT COALESCE(SUM(
    GREATEST(1, COALESCE(quantity, 1)) * COALESCE(unit_price, 0)
  ), 0) INTO v_delta
  FROM quote_line_items
  WHERE change_order_id = p_change_order_id;

  IF v_delta = 0 THEN
    RAISE EXCEPTION 'Add at least one item before accepting a change order';
  END IF;

  -- 4. Get starting position for invoice line items
  SELECT COALESCE(MAX(position), -1) + 1 INTO v_start_position
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  -- 5. Add change order items to invoice
  INSERT INTO invoice_line_items (
    invoice_id,
    change_order_id,
    name,
    description,
    quantity,
    unit_price,
    position,
    created_at,
    updated_at
  )
  SELECT
    p_invoice_id,
    p_change_order_id,
    name,
    description,
    GREATEST(1, COALESCE(quantity, 1)),
    COALESCE(unit_price, 0),
    v_start_position + ROW_NUMBER() OVER (ORDER BY position) - 1,
    v_now,
    v_now
  FROM quote_line_items
  WHERE change_order_id = p_change_order_id;

  -- 6. Calculate new invoice totals
  v_new_total := GREATEST(0, COALESCE(v_invoice.total_amount, 0) + v_delta);
  v_new_balance := GREATEST(0, COALESCE(v_invoice.balance_due, 0) + v_delta);

  -- 7. Determine new invoice status
  IF v_new_balance <= 0.01 THEN
    v_new_status := 'paid';
  ELSIF v_new_balance < v_new_total THEN
    IF v_invoice.due_date IS NOT NULL AND v_invoice.due_date < v_now THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'partial';
    END IF;
  ELSE
    IF v_invoice.due_date IS NOT NULL AND v_invoice.due_date < v_now THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'unpaid';
    END IF;
  END IF;

  -- 8. Update invoice
  UPDATE invoices
  SET
    total_amount = v_new_total,
    balance_due = v_new_balance,
    status = v_new_status,
    updated_at = v_now
  WHERE id = p_invoice_id;

  -- 9. Update change order
  UPDATE change_orders
  SET
    status = 'accepted',
    accepted_at = v_now,
    signer_name = p_signer_name,
    signer_email = p_signer_email,
    signature_text = p_signature_text,
    invoice_id = p_invoice_id,
    updated_at = v_now
  WHERE id = p_change_order_id;

  -- 10. Return result
  RETURN json_build_object(
    'changeOrderId', p_change_order_id,
    'invoiceId', p_invoice_id,
    'delta', v_delta,
    'newInvoiceTotal', v_new_total,
    'newInvoiceBalance', v_new_balance,
    'newInvoiceStatus', v_new_status,
    'acceptedAt', v_now
  );
END;
$$;


-- ============================================================================
-- 5. RECORD PAYMENT AND UPDATE INVOICE (Transaction)
-- Records a payment and updates invoice balance/status atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION record_payment_with_invoice_update(
  p_invoice_id UUID,
  p_deal_id UUID,
  p_company_id UUID,
  p_user_id UUID,
  p_amount NUMERIC,
  p_received_at TIMESTAMPTZ,
  p_method TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_payment_request_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice RECORD;
  v_payment_id UUID;
  v_total_paid NUMERIC;
  v_new_balance NUMERIC;
  v_new_status TEXT;
  v_payment_request RECORD;
  v_payment_request_marked_paid BOOLEAN := FALSE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Fetch and validate invoice
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.deal_id != p_deal_id THEN
    RAISE EXCEPTION 'Invoice does not belong to this deal';
  END IF;

  -- 2. Validate payment request if provided
  IF p_payment_request_id IS NOT NULL THEN
    SELECT * INTO v_payment_request
    FROM invoice_payment_requests
    WHERE id = p_payment_request_id;

    IF v_payment_request IS NULL THEN
      RAISE EXCEPTION 'Payment request not found';
    END IF;

    IF v_payment_request.invoice_id != p_invoice_id THEN
      RAISE EXCEPTION 'Payment request does not belong to this invoice';
    END IF;

    IF v_payment_request.deal_id != p_deal_id THEN
      RAISE EXCEPTION 'Payment request does not belong to this deal';
    END IF;

    IF v_payment_request.status = 'paid' THEN
      RAISE EXCEPTION 'This payment request is already marked as paid';
    END IF;
  END IF;

  -- 3. Insert payment record
  INSERT INTO invoice_payments (
    company_id,
    deal_id,
    invoice_id,
    received_by_user_id,
    amount,
    received_at,
    method,
    reference,
    note,
    receipt_sent_at,
    created_at,
    updated_at
  ) VALUES (
    p_company_id,
    p_deal_id,
    p_invoice_id,
    p_user_id,
    p_amount,
    p_received_at,
    p_method,
    p_reference,
    p_note,
    NULL,
    v_now,
    v_now
  )
  RETURNING id INTO v_payment_id;

  -- 4. Mark payment request as paid if provided
  IF p_payment_request_id IS NOT NULL THEN
    UPDATE invoice_payment_requests
    SET status = 'paid', updated_at = v_now
    WHERE id = p_payment_request_id;
    v_payment_request_marked_paid := TRUE;
  END IF;

  -- 5. Calculate total paid for this invoice
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id;

  -- 6. Calculate new balance
  v_new_balance := GREATEST(0, COALESCE(v_invoice.total_amount, 0) - v_total_paid);

  -- 7. Determine new status
  IF v_new_balance <= 0 THEN
    v_new_status := 'paid';
  ELSIF v_new_balance < COALESCE(v_invoice.total_amount, 0) THEN
    IF v_invoice.status = 'overdue' THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'partial';
    END IF;
  ELSE
    IF v_invoice.status = 'overdue' THEN
      v_new_status := 'overdue';
    ELSE
      v_new_status := 'unpaid';
    END IF;
  END IF;

  -- 8. Update invoice
  UPDATE invoices
  SET
    balance_due = v_new_balance,
    status = v_new_status,
    updated_at = v_now
  WHERE id = p_invoice_id;

  -- 9. Return result
  RETURN json_build_object(
    'paymentId', v_payment_id,
    'invoiceId', p_invoice_id,
    'amount', p_amount,
    'totalPaid', v_total_paid,
    'newBalance', v_new_balance,
    'newStatus', v_new_status,
    'paymentRequestMarkedPaid', v_payment_request_marked_paid,
    'invoiceMarkedPaid', v_new_status = 'paid' AND v_invoice.status != 'paid'
  );
END;
$$;


-- ============================================================================
-- 6. CREATE INVOICE WITH LINE ITEMS (Transaction)
-- Creates an invoice and its line items atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_invoice_with_items(
  p_company_id UUID,
  p_deal_id UUID,
  p_quote_id UUID DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'unpaid',
  p_issue_date TIMESTAMPTZ DEFAULT NULL,
  p_due_date TIMESTAMPTZ DEFAULT NULL,
  p_line_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_total_amount NUMERIC := 0;
  v_item JSONB;
  v_position INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Generate invoice number if not provided
  v_invoice_number := COALESCE(p_invoice_number, 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT);

  -- Calculate total amount from line items
  SELECT COALESCE(SUM(
    COALESCE((item->>'quantity')::NUMERIC, 1) *
    COALESCE((item->>'unit_price')::NUMERIC, (item->>'unitPrice')::NUMERIC, 0)
  ), 0) INTO v_total_amount
  FROM jsonb_array_elements(p_line_items) AS item;

  -- 1. Create invoice
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
    p_company_id,
    p_deal_id,
    p_quote_id,
    v_invoice_number,
    COALESCE(p_title, v_invoice_number),
    p_status,
    COALESCE(p_issue_date, v_now),
    COALESCE(p_due_date, v_now + INTERVAL '14 days'),
    v_total_amount,
    v_total_amount,
    v_now,
    v_now
  )
  RETURNING id INTO v_invoice_id;

  -- 2. Insert line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    v_position := COALESCE((v_item->>'position')::INT, v_position);

    INSERT INTO invoice_line_items (
      invoice_id,
      name,
      description,
      quantity,
      unit_price,
      position,
      created_at,
      updated_at
    ) VALUES (
      v_invoice_id,
      COALESCE(v_item->>'name', 'Item'),
      v_item->>'description',
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0),
      v_position,
      v_now,
      v_now
    );

    v_position := v_position + 1;
  END LOOP;

  -- 3. Return result
  RETURN (
    SELECT json_build_object(
      'invoice', row_to_json(i),
      'line_items', COALESCE(
        (SELECT json_agg(row_to_json(li) ORDER BY li.position)
         FROM invoice_line_items li
         WHERE li.invoice_id = v_invoice_id),
        '[]'::JSON
      )
    )
    FROM invoices i
    WHERE i.id = v_invoice_id
  );
END;
$$;
