-- Fix get_deal_proposal_data RPC to use correct quotes columns
-- quotes has: id, company_id, deal_id, quote_number, title, client_message, disclaimer,
--             status, public_share_id, acceptance_signature, acceptance_signed_at, created_at, updated_at
-- No acceptance_signer_name column

CREATE OR REPLACE FUNCTION get_deal_proposal_data(
  p_deal_id UUID,
  p_quote_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal JSON;
  v_company_id UUID;
  v_quote JSON;
  v_quote_count INTEGER;
  v_attachments JSON;
  v_proposal_template JSON;
  v_work_order_template JSON;
  v_change_order_template JSON;
  v_product_templates JSON;
  v_company_branding JSON;
  v_company_settings JSON;
  v_invoice_for_quote JSON;
BEGIN
  -- Get deal with contact and service_address
  SELECT json_build_object(
    'id', d.id,
    'company_id', d.company_id,
    'contact_id', d.contact_id,
    'contact_address_id', d.contact_address_id,
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
    ) ELSE NULL END,
    'latest_appointment', (
      SELECT json_build_object(
        'id', a.id,
        'scheduled_start', a.scheduled_start,
        'scheduled_end', a.scheduled_end
      )
      FROM appointments a
      WHERE a.deal_id = d.id
      ORDER BY a.scheduled_start DESC
      LIMIT 1
    )
  ), d.company_id INTO v_deal, v_company_id
  FROM deals d
  LEFT JOIN contacts c ON d.contact_id = c.id
  LEFT JOIN contact_addresses ca ON d.contact_address_id = ca.id
  WHERE d.id = p_deal_id;

  IF v_deal IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  -- Get quote if quoteId provided (excluding change order line items)
  IF p_quote_id IS NOT NULL THEN
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
    ) INTO v_quote
    FROM quotes q
    WHERE q.id = p_quote_id;
  END IF;

  -- Get quote count for deal
  SELECT COUNT(*) INTO v_quote_count FROM quotes WHERE deal_id = p_deal_id;

  -- Get proposal attachments with correct column names
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', pa.id,
      'deal_id', pa.deal_id,
      'quote_id', pa.quote_id,
      'file_name', pa.original_filename,
      'storage_key', pa.storage_key,
      'content_type', pa.content_type,
      'size_bytes', pa.byte_size,
      'created_at', pa.uploaded_at
    ) ORDER BY pa.uploaded_at DESC
  ), '[]'::json) INTO v_attachments
  FROM proposal_attachments pa
  WHERE pa.deal_id = p_deal_id;

  -- Get proposal template
  SELECT json_build_object(
    'id', t.id,
    'company_id', t.company_id,
    'template_key', t.template_key,
    'name', t.name,
    'subject', t.email_subject,
    'body', t.email_body,
    'sms_body', t.sms_body
  ) INTO v_proposal_template
  FROM communication_templates t
  WHERE t.company_id = v_company_id AND t.template_key = 'proposal_quote'
  LIMIT 1;

  -- Get work order template
  SELECT json_build_object(
    'id', t.id,
    'company_id', t.company_id,
    'template_key', t.template_key,
    'name', t.name,
    'subject', t.email_subject,
    'body', t.email_body,
    'sms_body', t.sms_body
  ) INTO v_work_order_template
  FROM communication_templates t
  WHERE t.company_id = v_company_id AND t.template_key = 'work_order_dispatch'
  LIMIT 1;

  -- Get change order template
  SELECT json_build_object(
    'id', t.id,
    'company_id', t.company_id,
    'template_key', t.template_key,
    'name', t.name,
    'subject', t.email_subject,
    'body', t.email_body,
    'sms_body', t.sms_body
  ) INTO v_change_order_template
  FROM communication_templates t
  WHERE t.company_id = v_company_id AND t.template_key = 'change_order_send'
  LIMIT 1;

  -- Get product templates with correct columns
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', pt.id,
      'company_id', pt.company_id,
      'name', pt.name,
      'description', pt.description,
      'type', pt.type,
      'created_at', pt.created_at
    ) ORDER BY pt.name
  ), '[]'::json) INTO v_product_templates
  FROM product_templates pt
  WHERE pt.company_id = v_company_id;

  -- Get company branding
  SELECT json_build_object(
    'id', co.id,
    'name', co.name,
    'logo_storage_key', co.logo_storage_key,
    'website', co.website,
    'phone_number', co.phone_number,
    'email', co.email,
    'physical_company_name', co.physical_company_name,
    'physical_address_line1', co.physical_address_line1,
    'physical_address_line2', co.physical_address_line2,
    'physical_city', co.physical_city,
    'physical_state', co.physical_state,
    'physical_zip', co.physical_zip,
    'license_number', co.license_number
  ) INTO v_company_branding
  FROM companies co
  WHERE co.id = v_company_id;

  -- Get company settings
  SELECT json_build_object(
    'id', co.id,
    'tax_rate', co.tax_rate,
    'proposal_terms_template_key', co.proposal_terms_template_key,
    'proposal_terms_template_content', co.proposal_terms_template_content
  ) INTO v_company_settings
  FROM companies co
  WHERE co.id = v_company_id;

  -- Get invoice for quote if quote exists
  IF p_quote_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      'status', i.status,
      'total_amount', i.total_amount,
      'balance_due', i.balance_due
    ) INTO v_invoice_for_quote
    FROM invoices i
    WHERE i.quote_id = p_quote_id
    LIMIT 1;
  END IF;

  -- Return combined result
  RETURN json_build_object(
    'deal', v_deal,
    'quote', v_quote,
    'quoteCount', v_quote_count,
    'attachments', v_attachments,
    'proposalTemplate', v_proposal_template,
    'workOrderTemplate', v_work_order_template,
    'changeOrderTemplate', v_change_order_template,
    'productTemplates', v_product_templates,
    'quoteCompanyBranding', v_company_branding,
    'companySettings', v_company_settings,
    'invoiceForQuote', v_invoice_for_quote
  );
END;
$$;
