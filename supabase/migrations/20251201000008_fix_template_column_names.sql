-- Fix get_invoice_detail RPC to return correct template column names
-- Client expects email_subject/email_body, not subject/body

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
  -- Get deal with contact and service_address
  SELECT json_build_object(
    'id', d.id,
    'company_id', d.company_id,
    'contact_id', d.contact_id,
    'first_name', d.first_name,
    'last_name', d.last_name,
    'email', d.email,
    'phone', d.phone,
    'lead_source', d.lead_source,
    'stage', d.stage,
    'salesperson', d.salesperson,
    'project_manager', d.project_manager,
    'assigned_to', d.assigned_to,
    'crew_id', d.crew_id,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'contact', CASE WHEN c.id IS NOT NULL THEN json_build_object(
      'id', c.id,
      'first_name', c.first_name,
      'last_name', c.last_name,
      'email', c.email,
      'phone', c.phone
    ) ELSE NULL END,
    'service_address', CASE WHEN ca.id IS NOT NULL THEN json_build_object(
      'id', ca.id,
      'address_line1', ca.address_line1,
      'address_line2', ca.address_line2,
      'city', ca.city,
      'state', ca.state,
      'postal_code', ca.postal_code
    ) ELSE NULL END
  ) INTO v_deal
  FROM deals d
  LEFT JOIN contacts c ON d.contact_id = c.id
  LEFT JOIN contact_addresses ca ON d.contact_address_id = ca.id
  WHERE d.id = p_deal_id;

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
    'notes', i.notes,
    'public_share_id', i.public_share_id,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'line_items', COALESCE(
      (SELECT json_agg(
        json_build_object(
          'id', li.id,
          'invoice_id', li.invoice_id,
          'name', li.name,
          'description', li.description,
          'quantity', li.quantity,
          'unit_price', li.unit_price,
          'position', li.position,
          'change_order_id', li.change_order_id
        ) ORDER BY li.position
      )
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
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', pr.id,
      'company_id', pr.company_id,
      'deal_id', pr.deal_id,
      'invoice_id', pr.invoice_id,
      'requested_by_user_id', pr.requested_by_user_id,
      'amount', pr.amount,
      'status', pr.status,
      'sent_at', pr.sent_at,
      'sent_via_text', pr.sent_via_text,
      'sent_via_email', pr.sent_via_email,
      'note', pr.note,
      'created_at', pr.created_at,
      'updated_at', pr.updated_at
    ) ORDER BY pr.created_at DESC
  ), '[]'::json) INTO v_payment_requests
  FROM invoice_payment_requests pr
  WHERE pr.invoice_id = p_invoice_id;

  -- Get payments
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', p.id,
      'company_id', p.company_id,
      'deal_id', p.deal_id,
      'invoice_id', p.invoice_id,
      'received_by_user_id', p.received_by_user_id,
      'amount', p.amount,
      'received_at', p.received_at,
      'method', p.method,
      'reference', p.reference,
      'note', p.note,
      'receipt_sent_at', p.receipt_sent_at,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) ORDER BY p.received_at DESC
  ), '[]'::json) INTO v_payments
  FROM invoice_payments p
  WHERE p.invoice_id = p_invoice_id;

  -- Get relevant communication templates with correct field names
  SELECT json_build_object(
    'invoiceSend', (
      SELECT json_build_object(
        'id', t.id,
        'company_id', t.company_id,
        'template_key', t.template_key,
        'name', t.name,
        'email_subject', t.email_subject,
        'email_body', t.email_body,
        'sms_body', t.sms_body
      )
      FROM communication_templates t
      WHERE t.company_id = p_company_id AND t.template_key = 'invoice_send'
      LIMIT 1
    ),
    'paymentRequest', (
      SELECT json_build_object(
        'id', t.id,
        'company_id', t.company_id,
        'template_key', t.template_key,
        'name', t.name,
        'email_subject', t.email_subject,
        'email_body', t.email_body,
        'sms_body', t.sms_body
      )
      FROM communication_templates t
      WHERE t.company_id = p_company_id AND t.template_key = 'invoice_payment_request'
      LIMIT 1
    ),
    'paymentReceipt', (
      SELECT json_build_object(
        'id', t.id,
        'company_id', t.company_id,
        'template_key', t.template_key,
        'name', t.name,
        'email_subject', t.email_subject,
        'email_body', t.email_body,
        'sms_body', t.sms_body
      )
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
