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
