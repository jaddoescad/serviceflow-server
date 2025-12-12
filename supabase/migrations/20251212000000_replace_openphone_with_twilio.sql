-- Replace OpenPhone integration with Twilio
-- Adds Twilio columns to companies and removes OpenPhone columns.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS twilio_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE companies
  DROP COLUMN IF EXISTS openphone_api_key,
  DROP COLUMN IF EXISTS openphone_phone_number_id,
  DROP COLUMN IF EXISTS openphone_phone_number,
  DROP COLUMN IF EXISTS openphone_enabled;

-- RPC to get quote with deal and company communication settings in one call
-- Used when sending a quote via email/SMS
CREATE OR REPLACE FUNCTION get_quote_send_context(
  p_quote_id UUID,
  p_deal_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote JSON;
  v_deal JSON;
  v_company_id UUID;
  v_email_settings JSON;
  v_twilio_settings JSON;
BEGIN
  -- Get quote with line items
  SELECT json_build_object(
    'id', q.id,
    'company_id', q.company_id,
    'deal_id', q.deal_id,
    'quote_number', q.quote_number,
    'title', q.title,
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
          'position', li.position,
          'is_change_order', li.is_change_order,
          'change_order_id', li.change_order_id
        ) ORDER BY li.position
      ) FROM quote_line_items li WHERE li.quote_id = q.id),
      '[]'::json
    )
  ), q.company_id INTO v_quote, v_company_id
  FROM quotes q
  WHERE q.id = p_quote_id;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Verify quote belongs to deal
  IF (v_quote->>'deal_id')::UUID != p_deal_id THEN
    RAISE EXCEPTION 'Quote does not belong to this deal';
  END IF;

  -- Get deal with contact info
  SELECT json_build_object(
    'id', d.id,
    'company_id', d.company_id,
    'first_name', d.first_name,
    'last_name', d.last_name,
    'email', d.email,
    'phone', d.phone,
    'stage', d.stage,
    'contact', CASE WHEN c.id IS NOT NULL THEN json_build_object(
      'id', c.id,
      'first_name', c.first_name,
      'last_name', c.last_name,
      'email', c.email,
      'phone', c.phone
    ) ELSE NULL END
  ) INTO v_deal
  FROM deals d
  LEFT JOIN contacts c ON d.contact_id = c.id
  WHERE d.id = p_deal_id;

  IF v_deal IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  -- Get company email settings
  SELECT json_build_object(
    'provider_account_email', ces.provider_account_email,
    'reply_email', ces.reply_email,
    'bcc_email', ces.bcc_email
  ) INTO v_email_settings
  FROM company_email_settings ces
  WHERE ces.company_id = v_company_id;

  -- Get company Twilio settings
  SELECT json_build_object(
    'twilio_account_sid', co.twilio_account_sid,
    'twilio_auth_token', co.twilio_auth_token,
    'twilio_phone_number', co.twilio_phone_number,
    'twilio_enabled', co.twilio_enabled
  ) INTO v_twilio_settings
  FROM companies co
  WHERE co.id = v_company_id;

  -- Return combined result
  RETURN json_build_object(
    'quote', v_quote,
    'deal', v_deal,
    'emailSettings', COALESCE(v_email_settings, '{}'::json),
    'twilioSettings', COALESCE(v_twilio_settings, '{}'::json)
  );
END;
$$;

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
  v_twilio_settings JSON;
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

  -- Get company Twilio settings
  SELECT json_build_object(
    'twilio_account_sid', co.twilio_account_sid,
    'twilio_auth_token', co.twilio_auth_token,
    'twilio_phone_number', co.twilio_phone_number,
    'twilio_enabled', co.twilio_enabled
  ) INTO v_twilio_settings
  FROM companies co
  WHERE co.id = v_company_id;

  -- Return combined result
  RETURN json_build_object(
    'invoice', v_invoice,
    'companyId', v_company_id,
    'emailSettings', COALESCE(v_email_settings, '{}'::json),
    'twilioSettings', COALESCE(v_twilio_settings, '{}'::json)
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
  v_twilio_settings JSON;
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

  -- Get company Twilio settings
  SELECT json_build_object(
    'twilio_account_sid', co.twilio_account_sid,
    'twilio_auth_token', co.twilio_auth_token,
    'twilio_phone_number', co.twilio_phone_number,
    'twilio_enabled', co.twilio_enabled
  ) INTO v_twilio_settings
  FROM companies co
  WHERE co.id = v_company_id;

  -- Return combined result
  RETURN json_build_object(
    'paymentRequest', v_payment_request,
    'companyId', v_company_id,
    'emailSettings', COALESCE(v_email_settings, '{}'::json),
    'twilioSettings', COALESCE(v_twilio_settings, '{}'::json)
  );
END;
$$;

-- RPC to get all user authentication context in one call
CREATE OR REPLACE FUNCTION get_user_auth_context(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user JSON;
  v_current_company_id UUID;
  v_organizations JSON;
  v_company JSON;
  v_members JSON;
  v_current_member JSON;
BEGIN
  -- 1. Get user profile with current_company_id
  SELECT json_build_object(
    'id', u.id,
    'current_company_id', u.current_company_id,
    'created_at', u.created_at,
    'updated_at', u.updated_at
  ), u.current_company_id
  INTO v_user, v_current_company_id
  FROM users u
  WHERE u.id = p_user_id;

  -- If no user profile exists, return early with empty context
  IF v_user IS NULL THEN
    RETURN json_build_object(
      'user', NULL,
      'organizations', '[]'::json,
      'company', NULL,
      'member', NULL,
      'companyMembers', '[]'::json
    );
  END IF;

  -- 2. Get all organizations (companies) this user belongs to
  SELECT COALESCE(json_agg(
    json_build_object(
      'companyId', cm.company_id,
      'companyName', c.name,
      'role', cm.role
    )
  ), '[]'::json) INTO v_organizations
  FROM company_members cm
  JOIN companies c ON cm.company_id = c.id
  WHERE cm.user_id = p_user_id;

  -- If no current company or user doesn't belong to it, return with just organizations
  IF v_current_company_id IS NULL THEN
    RETURN json_build_object(
      'user', v_user,
      'organizations', v_organizations,
      'company', NULL,
      'member', NULL,
      'companyMembers', '[]'::json
    );
  END IF;

  -- Verify user belongs to the current company
  IF NOT EXISTS (
    SELECT 1 FROM company_members
    WHERE user_id = p_user_id AND company_id = v_current_company_id
  ) THEN
    RETURN json_build_object(
      'user', v_user,
      'organizations', v_organizations,
      'company', NULL,
      'member', NULL,
      'companyMembers', '[]'::json
    );
  END IF;

  -- 3. Get company details
  SELECT json_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'name', c.name,
    'email', c.email,
    'owner_first_name', c.owner_first_name,
    'owner_last_name', c.owner_last_name,
    'phone_number', c.phone_number,
    'website', c.website,
    'twilio_enabled', c.twilio_enabled,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  ) INTO v_company
  FROM companies c
  WHERE c.id = v_current_company_id;

  -- 4. Get all company members
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', cm.id,
      'company_id', cm.company_id,
      'user_id', cm.user_id,
      'email', cm.email,
      'display_name', cm.display_name,
      'role', cm.role,
      'created_at', cm.created_at
    ) ORDER BY cm.created_at
  ), '[]'::json) INTO v_members
  FROM company_members cm
  WHERE cm.company_id = v_current_company_id;

  -- 5. Get current user's member record
  SELECT json_build_object(
    'id', cm.id,
    'company_id', cm.company_id,
    'user_id', cm.user_id,
    'email', cm.email,
    'display_name', cm.display_name,
    'role', cm.role,
    'created_at', cm.created_at
  ) INTO v_current_member
  FROM company_members cm
  WHERE cm.company_id = v_current_company_id
    AND cm.user_id = p_user_id;

  -- Return combined result
  RETURN json_build_object(
    'user', v_user,
    'organizations', v_organizations,
    'company', v_company,
    'member', v_current_member,
    'companyMembers', v_members
  );
END;
$$;

