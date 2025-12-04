-- Fix incorrect pipeline stages in get_dashboard_data RPC
-- The original had wrong stage names (new_lead instead of cold_leads/warm_leads, etc.)
CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_company_id UUID,
  p_pipeline_id TEXT DEFAULT 'sales'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deals JSON;
  v_drip_sequences JSON;
  v_quotes JSON;
  v_pipeline_stages TEXT[];
BEGIN
  -- Define pipeline stages based on pipeline_id
  -- This mirrors the pipeline config in the server (src/config/pipelines.ts)
  IF p_pipeline_id = 'sales' THEN
    v_pipeline_stages := ARRAY['cold_leads', 'estimate_scheduled', 'in_draft', 'proposals_sent', 'proposals_rejected'];
  ELSIF p_pipeline_id = 'jobs' THEN
    v_pipeline_stages := ARRAY['project_accepted', 'project_scheduled', 'project_in_progress', 'project_complete'];
  ELSE
    -- Default to sales stages
    v_pipeline_stages := ARRAY['cold_leads', 'estimate_scheduled', 'in_draft', 'proposals_sent', 'proposals_rejected'];
  END IF;

  -- Get deals with contact, service_address, and latest_appointment
  SELECT COALESCE(json_agg(deal_data ORDER BY deal_data.created_at DESC), '[]'::json)
  INTO v_deals
  FROM (
    SELECT
      d.id,
      d.company_id,
      d.contact_id,
      d.contact_address_id,
      d.first_name,
      d.last_name,
      d.email,
      d.phone,
      d.lead_source,
      d.stage,
      d.salesperson,
      d.project_manager,
      d.assigned_to,
      d.crew_id,
      d.event_color,
      d.send_email,
      d.send_sms,
      d.disable_drips,
      d.created_at,
      d.updated_at,
      CASE WHEN c.id IS NOT NULL THEN json_build_object(
        'id', c.id,
        'company_id', c.company_id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'phone', c.phone,
        'addresses', COALESCE(
          (SELECT json_agg(addr.*) FROM contact_addresses addr WHERE addr.contact_id = c.id),
          '[]'::json
        )
      ) ELSE NULL END AS contact,
      CASE WHEN ca.id IS NOT NULL THEN json_build_object(
        'id', ca.id,
        'address_line1', ca.address_line1,
        'address_line2', ca.address_line2,
        'city', ca.city,
        'state', ca.state,
        'postal_code', ca.postal_code
      ) ELSE NULL END AS service_address,
      (
        SELECT json_build_object(
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
        )
        FROM appointments a
        WHERE a.deal_id = d.id
        ORDER BY a.scheduled_start DESC
        LIMIT 1
      ) AS latest_appointment
    FROM deals d
    LEFT JOIN contacts c ON d.contact_id = c.id
    LEFT JOIN contact_addresses ca ON d.contact_address_id = ca.id
    WHERE d.company_id = p_company_id
      AND d.stage = ANY(v_pipeline_stages)
  ) deal_data;

  -- Get drip sequences with steps
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', ds.id,
      'company_id', ds.company_id,
      'pipeline_id', ds.pipeline_id,
      'stage_id', ds.stage_id,
      'name', ds.name,
      'is_enabled', ds.is_enabled,
      'created_at', ds.created_at,
      'updated_at', ds.updated_at,
      'steps', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', st.id,
            'sequence_id', st.sequence_id,
            'position', st.position,
            'delay_type', st.delay_type,
            'delay_value', st.delay_value,
            'delay_unit', st.delay_unit,
            'channel', st.channel,
            'email_subject', st.email_subject,
            'email_body', st.email_body,
            'sms_body', st.sms_body,
            'created_at', st.created_at,
            'updated_at', st.updated_at
          ) ORDER BY st.position
        ) FROM drip_steps st WHERE st.sequence_id = ds.id),
        '[]'::json
      )
    )
  ), '[]'::json) INTO v_drip_sequences
  FROM drip_sequences ds
  WHERE ds.company_id = p_company_id
    AND ds.pipeline_id = p_pipeline_id;

  -- Get quotes with line items for summary calculation
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', q.id,
      'deal_id', q.deal_id,
      'status', q.status,
      'created_at', q.created_at,
      'updated_at', q.updated_at,
      'line_items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'quantity', li.quantity,
            'unit_price', li.unit_price,
            'is_change_order', li.is_change_order,
            'change_order_id', li.change_order_id
          )
        ) FROM quote_line_items li WHERE li.quote_id = q.id),
        '[]'::json
      )
    )
  ), '[]'::json) INTO v_quotes
  FROM quotes q
  WHERE q.company_id = p_company_id;

  -- Return combined result
  RETURN json_build_object(
    'deals', v_deals,
    'dripSequences', v_drip_sequences,
    'quotes', v_quotes
  );
END;
$$;
