-- RPC to get invoice with company communication settings in one call
-- Used when sending invoices or payment requests via email/SMS
CREATE OR REPLACE FUNCTION get_invoice_send_context(
  p_invoice_id UUID,
  p_deal_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice JSON;
  v_company_id UUID;
  v_email_settings JSON;
  v_openphone_settings JSON;
BEGIN
  -- Get invoice with basic info
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
    'updated_at', i.updated_at
  ), i.company_id INTO v_invoice, v_company_id
  FROM invoices i
  WHERE i.id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Verify invoice belongs to deal
  IF (v_invoice->>'deal_id')::UUID != p_deal_id THEN
    RAISE EXCEPTION 'Invoice does not belong to this deal';
  END IF;

  -- Get company email settings
  SELECT json_build_object(
    'provider_account_email', ces.provider_account_email,
    'reply_email', ces.reply_email,
    'bcc_email', ces.bcc_email
  ) INTO v_email_settings
  FROM company_email_settings ces
  WHERE ces.company_id = v_company_id;

  -- Get company OpenPhone settings
  SELECT json_build_object(
    'openphone_api_key', co.openphone_api_key,
    'openphone_phone_number_id', co.openphone_phone_number_id,
    'openphone_phone_number', co.openphone_phone_number,
    'openphone_enabled', co.openphone_enabled
  ) INTO v_openphone_settings
  FROM companies co
  WHERE co.id = v_company_id;

  -- Return combined result
  RETURN json_build_object(
    'invoice', v_invoice,
    'companyId', v_company_id,
    'emailSettings', COALESCE(v_email_settings, '{}'::json),
    'openphoneSettings', COALESCE(v_openphone_settings, '{}'::json)
  );
END;
$$;

-- RPC to get payment request with company communication settings in one call
CREATE OR REPLACE FUNCTION get_payment_request_send_context(
  p_request_id UUID,
  p_invoice_id UUID,
  p_deal_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_request JSON;
  v_company_id UUID;
  v_email_settings JSON;
  v_openphone_settings JSON;
BEGIN
  -- Get payment request
  SELECT json_build_object(
    'id', pr.id,
    'company_id', pr.company_id,
    'deal_id', pr.deal_id,
    'invoice_id', pr.invoice_id,
    'requested_by_user_id', pr.requested_by_user_id,
    'amount', pr.amount,
    'note', pr.note,
    'status', pr.status,
    'sent_at', pr.sent_at,
    'sent_via_email', pr.sent_via_email,
    'sent_via_text', pr.sent_via_text,
    'created_at', pr.created_at,
    'updated_at', pr.updated_at
  ), pr.company_id INTO v_payment_request, v_company_id
  FROM invoice_payment_requests pr
  WHERE pr.id = p_request_id;

  IF v_payment_request IS NULL THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;

  -- Verify payment request belongs to invoice and deal
  IF (v_payment_request->>'invoice_id')::UUID != p_invoice_id THEN
    RAISE EXCEPTION 'Payment request does not belong to this invoice';
  END IF;

  IF (v_payment_request->>'deal_id')::UUID != p_deal_id THEN
    RAISE EXCEPTION 'Payment request does not belong to this deal';
  END IF;

  -- Get company email settings
  SELECT json_build_object(
    'provider_account_email', ces.provider_account_email,
    'reply_email', ces.reply_email,
    'bcc_email', ces.bcc_email
  ) INTO v_email_settings
  FROM company_email_settings ces
  WHERE ces.company_id = v_company_id;

  -- Get company OpenPhone settings
  SELECT json_build_object(
    'openphone_api_key', co.openphone_api_key,
    'openphone_phone_number_id', co.openphone_phone_number_id,
    'openphone_phone_number', co.openphone_phone_number,
    'openphone_enabled', co.openphone_enabled
  ) INTO v_openphone_settings
  FROM companies co
  WHERE co.id = v_company_id;

  -- Return combined result
  RETURN json_build_object(
    'paymentRequest', v_payment_request,
    'companyId', v_company_id,
    'emailSettings', COALESCE(v_email_settings, '{}'::json),
    'openphoneSettings', COALESCE(v_openphone_settings, '{}'::json)
  );
END;
$$;
