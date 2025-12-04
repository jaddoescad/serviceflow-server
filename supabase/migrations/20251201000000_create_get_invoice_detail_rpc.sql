-- RPC to get all invoice detail data in one database call
CREATE OR REPLACE FUNCTION get_invoice_detail(
  p_deal_id UUID,
  p_invoice_id UUID,
  p_company_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal JSON;
  v_invoice JSON;
  v_payment_requests JSON;
  v_payments JSON;
  v_templates JSON;
BEGIN
  -- Get deal with contact
  SELECT row_to_json(d.*) INTO v_deal
  FROM (
    SELECT
      deals.*,
      row_to_json(contacts.*) as contact
    FROM deals
    LEFT JOIN contacts ON deals.contact_id = contacts.id
    WHERE deals.id = p_deal_id
  ) d;

  IF v_deal IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  -- Get invoice with line items
  SELECT json_build_object(
    'id', i.id,
    'company_id', i.company_id,
    'deal_id', i.deal_id,
    'quote_id', i.quote_id,
    'invoice_number', i.invoice_number,
    'title', i.title,
    'status', i.status,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'total_amount', i.total_amount,
    'balance_due', i.balance_due,
    'share_id', i.share_id,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'line_items', COALESCE(
      (SELECT json_agg(li.* ORDER BY li.position)
       FROM invoice_line_items li
       WHERE li.invoice_id = i.id),
      '[]'::json
    )
  ) INTO v_invoice
  FROM invoices i
  WHERE i.id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Verify invoice belongs to deal
  IF (v_invoice->>'deal_id')::UUID != p_deal_id THEN
    RAISE EXCEPTION 'Invoice does not belong to this deal';
  END IF;

  -- Get payment requests
  SELECT COALESCE(json_agg(pr.* ORDER BY pr.created_at DESC), '[]'::json) INTO v_payment_requests
  FROM invoice_payment_requests pr
  WHERE pr.invoice_id = p_invoice_id;

  -- Get payments
  SELECT COALESCE(json_agg(p.* ORDER BY p.received_at DESC), '[]'::json) INTO v_payments
  FROM invoice_payments p
  WHERE p.invoice_id = p_invoice_id;

  -- Get relevant communication templates
  SELECT json_build_object(
    'invoiceSend', (
      SELECT row_to_json(t.*)
      FROM communication_templates t
      WHERE t.company_id = p_company_id AND t.template_key = 'invoice_send'
      LIMIT 1
    ),
    'paymentRequest', (
      SELECT row_to_json(t.*)
      FROM communication_templates t
      WHERE t.company_id = p_company_id AND t.template_key = 'invoice_payment_request'
      LIMIT 1
    ),
    'paymentReceipt', (
      SELECT row_to_json(t.*)
      FROM communication_templates t
      WHERE t.company_id = p_company_id AND t.template_key = 'payment_receipt'
      LIMIT 1
    )
  ) INTO v_templates;

  -- Return combined result
  RETURN json_build_object(
    'deal', v_deal,
    'invoice', v_invoice,
    'paymentRequests', v_payment_requests,
    'payments', v_payments,
    'templates', v_templates
  );
END;
$$;
