-- RPC to get all deal detail data in one database call
CREATE OR REPLACE FUNCTION get_deal_detail(p_deal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal JSON;
  v_company_id UUID;
  v_quotes JSON;
  v_invoices JSON;
  v_contacts JSON;
  v_company_members JSON;
  v_crews JSON;
  v_deal_notes JSON;
  v_appointments JSON;
  v_attachments JSON;
  v_proposal_attachments JSON;
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
    'event_color', d.event_color,
    'send_email', d.send_email,
    'send_sms', d.send_sms,
    'disable_drips', d.disable_drips,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'contact', CASE WHEN c.id IS NOT NULL THEN json_build_object(
      'id', c.id,
      'company_id', c.company_id,
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

  -- Get quotes with line items
  SELECT COALESCE(json_agg(
    json_build_object(
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
            'position', li.position,
            'change_order_id', li.change_order_id,
            'is_change_order', li.is_change_order
          ) ORDER BY li.position
        ) FROM quote_line_items li WHERE li.quote_id = q.id),
        '[]'::json
      )
    ) ORDER BY q.created_at DESC
  ), '[]'::json) INTO v_quotes
  FROM quotes q
  WHERE q.deal_id = p_deal_id;

  -- Get invoices with line items
  SELECT COALESCE(json_agg(
    json_build_object(
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
        ) FROM invoice_line_items li WHERE li.invoice_id = i.id),
        '[]'::json
      )
    ) ORDER BY i.created_at DESC
  ), '[]'::json) INTO v_invoices
  FROM invoices i
  WHERE i.deal_id = p_deal_id;

  -- Get contacts for company
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', c.id,
      'company_id', c.company_id,
      'first_name', c.first_name,
      'last_name', c.last_name,
      'email', c.email,
      'phone', c.phone,
      'archived', c.archived,
      'created_at', c.created_at
    ) ORDER BY c.created_at DESC
  ), '[]'::json) INTO v_contacts
  FROM contacts c
  WHERE c.company_id = v_company_id AND c.archived = false;

  -- Get company members
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
  ), '[]'::json) INTO v_company_members
  FROM company_members cm
  WHERE cm.company_id = v_company_id;

  -- Get crews
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', cr.id,
      'company_id', cr.company_id,
      'name', cr.name,
      'created_at', cr.created_at
    ) ORDER BY cr.name
  ), '[]'::json) INTO v_crews
  FROM crews cr
  WHERE cr.company_id = v_company_id;

  -- Get deal notes
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', dn.id,
      'company_id', dn.company_id,
      'deal_id', dn.deal_id,
      'author_user_id', dn.author_user_id,
      'body', dn.body,
      'created_at', dn.created_at,
      'updated_at', dn.updated_at
    ) ORDER BY dn.created_at DESC
  ), '[]'::json) INTO v_deal_notes
  FROM deal_notes dn
  WHERE dn.deal_id = p_deal_id;

  -- Get appointments
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', a.id,
      'company_id', a.company_id,
      'deal_id', a.deal_id,
      'assigned_to', a.assigned_to,
      'crew_id', a.crew_id,
      'event_color', a.event_color,
      'scheduled_start', a.scheduled_start,
      'scheduled_end', a.scheduled_end,
      'appointment_notes', a.appointment_notes,
      'send_email', a.send_email,
      'send_sms', a.send_sms,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    ) ORDER BY a.scheduled_start DESC
  ), '[]'::json) INTO v_appointments
  FROM appointments a
  WHERE a.deal_id = p_deal_id;

  -- Get deal attachments
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', da.id,
      'deal_id', da.deal_id,
      'file_name', da.file_name,
      'storage_key', da.storage_key,
      'content_type', da.content_type,
      'size_bytes', da.size_bytes,
      'created_at', da.created_at
    ) ORDER BY da.created_at DESC
  ), '[]'::json) INTO v_attachments
  FROM deal_attachments da
  WHERE da.deal_id = p_deal_id;

  -- Get proposal attachments
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', pa.id,
      'deal_id', pa.deal_id,
      'quote_id', pa.quote_id,
      'file_name', pa.file_name,
      'storage_key', pa.storage_key,
      'content_type', pa.content_type,
      'size_bytes', pa.size_bytes,
      'position', pa.position,
      'created_at', pa.created_at
    ) ORDER BY pa.position, pa.created_at DESC
  ), '[]'::json) INTO v_proposal_attachments
  FROM proposal_attachments pa
  WHERE pa.deal_id = p_deal_id;

  -- Return combined result
  RETURN json_build_object(
    'deal', v_deal,
    'quotes', v_quotes,
    'invoices', v_invoices,
    'contacts', v_contacts,
    'companyMembers', v_company_members,
    'crews', v_crews,
    'dealNotes', v_deal_notes,
    'appointments', v_appointments,
    'attachments', v_attachments,
    'proposalAttachments', v_proposal_attachments
  );
END;
$$;
