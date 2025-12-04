-- Fix alias conflict in get_public_quote_share RPC
-- The alias 'co' was used for both companies table and change_orders table
-- causing 'column co.title does not exist' error
CREATE OR REPLACE FUNCTION get_public_quote_share(p_share_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote JSON;
  v_quote_id UUID;
  v_company JSON;
  v_deal JSON;
  v_contact JSON;
  v_service_address JSON;
  v_change_orders JSON;
  v_invoice JSON;
  v_filtered_line_items JSON;
BEGIN
  -- Get quote with company and deal info
  SELECT
    q.id,
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
      'updated_at', q.updated_at
    ),
    json_build_object(
      'id', comp.id,
      'name', comp.name,
      'email', comp.email,
      'phone_number', comp.phone_number,
      'website', comp.website,
      'owner_first_name', comp.owner_first_name,
      'owner_last_name', comp.owner_last_name
    ),
    CASE WHEN d.id IS NOT NULL THEN json_build_object(
      'id', d.id,
      'first_name', d.first_name,
      'last_name', d.last_name,
      'email', d.email,
      'phone', d.phone
    ) ELSE NULL END,
    CASE WHEN c.id IS NOT NULL THEN json_build_object(
      'id', c.id,
      'first_name', c.first_name,
      'last_name', c.last_name,
      'email', c.email,
      'phone', c.phone
    ) ELSE NULL END,
    CASE WHEN ca.id IS NOT NULL THEN json_build_object(
      'id', ca.id,
      'address_line1', ca.address_line1,
      'address_line2', ca.address_line2,
      'city', ca.city,
      'state', ca.state,
      'postal_code', ca.postal_code
    ) ELSE NULL END
  INTO v_quote_id, v_quote, v_company, v_deal, v_contact, v_service_address
  FROM quotes q
  LEFT JOIN companies comp ON q.company_id = comp.id
  LEFT JOIN deals d ON q.deal_id = d.id
  LEFT JOIN contacts c ON d.contact_id = c.id
  LEFT JOIN contact_addresses ca ON d.contact_address_id = ca.id
  WHERE q.public_share_id = p_share_id::uuid;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Get filtered line items (excluding change order items)
  SELECT COALESCE(json_agg(
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
  ), '[]'::json) INTO v_filtered_line_items
  FROM quote_line_items li
  WHERE li.quote_id = v_quote_id
    AND li.is_change_order = false
    AND li.change_order_id IS NULL;

  -- Get change orders for this quote (using 'cho' alias to avoid conflict)
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', cho.id,
      'quote_id', cho.quote_id,
      'change_order_number', cho.change_order_number,
      'title', cho.title,
      'description', cho.description,
      'status', cho.status,
      'accepted_at', cho.accepted_at,
      'signer_name', cho.signer_name,
      'created_at', cho.created_at,
      'updated_at', cho.updated_at,
      'items', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', coi.id,
            'change_order_id', coi.change_order_id,
            'name', coi.name,
            'description', coi.description,
            'quantity', coi.quantity,
            'unit_price', coi.unit_price,
            'position', coi.position
          ) ORDER BY coi.position
        ) FROM change_order_items coi WHERE coi.change_order_id = cho.id),
        '[]'::json
      )
    ) ORDER BY cho.created_at
  ), '[]'::json) INTO v_change_orders
  FROM change_orders cho
  WHERE cho.quote_id = v_quote_id;

  -- Get invoice for this quote (if exists)
  SELECT json_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'title', i.title,
    'status', i.status,
    'total_amount', i.total_amount,
    'balance_due', i.balance_due,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'share_id', i.share_id
  ) INTO v_invoice
  FROM invoices i
  WHERE i.quote_id = v_quote_id
  LIMIT 1;

  -- Build customer object
  DECLARE
    v_customer JSON;
    v_property_address TEXT;
  BEGIN
    -- Build customer name from deal or contact
    v_customer := json_build_object(
      'name', COALESCE(
        CASE
          WHEN v_deal IS NOT NULL THEN TRIM(CONCAT(v_deal->>'first_name', ' ', v_deal->>'last_name'))
          WHEN v_contact IS NOT NULL THEN TRIM(CONCAT(v_contact->>'first_name', ' ', v_contact->>'last_name'))
          ELSE 'Valued Customer'
        END
      ),
      'email', COALESCE(v_deal->>'email', v_contact->>'email'),
      'phone', COALESCE(v_deal->>'phone', v_contact->>'phone')
    );

    -- Build property address string
    IF v_service_address IS NOT NULL THEN
      v_property_address := CONCAT_WS(', ',
        NULLIF(v_service_address->>'address_line1', ''),
        NULLIF(v_service_address->>'address_line2', ''),
        NULLIF(v_service_address->>'city', ''),
        NULLIF(v_service_address->>'state', ''),
        NULLIF(v_service_address->>'postal_code', '')
      );
    ELSE
      v_property_address := NULL;
    END IF;

    -- Return combined result
    RETURN json_build_object(
      'quote', v_quote || json_build_object('line_items', v_filtered_line_items),
      'company', v_company,
      'customer', v_customer,
      'propertyAddress', v_property_address,
      'changeOrders', v_change_orders,
      'invoiceForQuote', v_invoice
    );
  END;
END;
$$;
