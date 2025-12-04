-- ============================================================================
-- Improve accept_change_order_with_invoice RPC
-- - Add invoice ownership validation (invoice must belong to same company)
-- - Add SELECT FOR UPDATE to prevent concurrent acceptance
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
  -- 1. Fetch and validate change order with row lock to prevent concurrent acceptance
  SELECT co.*,
         COALESCE(
           (SELECT json_agg(row_to_json(li))
            FROM quote_line_items li
            WHERE li.change_order_id = co.id),
           '[]'::JSON
         ) as items_json
  INTO v_change_order
  FROM change_orders co
  WHERE co.id = p_change_order_id
  FOR UPDATE;

  IF v_change_order IS NULL THEN
    RAISE EXCEPTION 'Change order not found';
  END IF;

  IF v_change_order.status = 'accepted' THEN
    RAISE EXCEPTION 'Change order already accepted';
  END IF;

  -- 2. Fetch and validate invoice with row lock
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- 3. Validate invoice belongs to the same company as the change order
  IF v_invoice.company_id IS DISTINCT FROM v_change_order.company_id THEN
    RAISE EXCEPTION 'Invoice does not belong to the same company as the change order';
  END IF;

  -- 4. Calculate change order total (delta)
  SELECT COALESCE(SUM(
    GREATEST(1, COALESCE(quantity, 1)) * COALESCE(unit_price, 0)
  ), 0) INTO v_delta
  FROM quote_line_items
  WHERE change_order_id = p_change_order_id;

  IF v_delta = 0 THEN
    RAISE EXCEPTION 'Add at least one item before accepting a change order';
  END IF;

  -- 5. Get starting position for invoice line items
  SELECT COALESCE(MAX(position), -1) + 1 INTO v_start_position
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  -- 6. Add change order items to invoice
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

  -- 7. Calculate new invoice totals
  v_new_total := GREATEST(0, COALESCE(v_invoice.total_amount, 0) + v_delta);
  v_new_balance := GREATEST(0, COALESCE(v_invoice.balance_due, 0) + v_delta);

  -- 8. Determine new invoice status
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

  -- 9. Update invoice
  UPDATE invoices
  SET
    total_amount = v_new_total,
    balance_due = v_new_balance,
    status = v_new_status,
    updated_at = v_now
  WHERE id = p_invoice_id;

  -- 10. Update change order
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

  -- 11. Return result
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
