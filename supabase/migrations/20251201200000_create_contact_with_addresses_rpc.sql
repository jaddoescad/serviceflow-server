-- ============================================================================
-- TRANSACTIONAL RPC FUNCTIONS FOR CONTACTS
-- These functions wrap contact creation/update with addresses in database
-- transactions to ensure data consistency. If any step fails, all changes
-- are rolled back.
-- ============================================================================

-- ============================================================================
-- 1. CREATE CONTACT WITH ADDRESSES (Transaction)
-- Creates a contact and its addresses atomically.
-- If address creation fails, contact creation is rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_contact_with_addresses(
  p_company_id UUID,
  p_first_name TEXT,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_addresses JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id UUID;
  v_address JSONB;
  v_address_ids UUID[] := '{}';
  v_address_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate required fields
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  IF p_first_name IS NULL OR TRIM(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name is required';
  END IF;

  -- 1. Create the contact
  INSERT INTO contacts (
    company_id,
    first_name,
    last_name,
    email,
    phone,
    notes,
    archived,
    created_at,
    updated_at
  ) VALUES (
    p_company_id,
    TRIM(p_first_name),
    NULLIF(TRIM(COALESCE(p_last_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_email, '')), ''),
    NULLIF(TRIM(COALESCE(p_phone, '')), ''),
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    FALSE,
    v_now,
    v_now
  )
  RETURNING id INTO v_contact_id;

  -- 2. Create addresses if provided
  IF jsonb_array_length(p_addresses) > 0 THEN
    FOR v_address IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      INSERT INTO contact_addresses (
        contact_id,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        is_primary,
        created_at,
        updated_at
      ) VALUES (
        v_contact_id,
        COALESCE(v_address->>'address_line1', v_address->>'addressLine1', ''),
        NULLIF(COALESCE(v_address->>'address_line2', v_address->>'addressLine2', ''), ''),
        COALESCE(v_address->>'city', ''),
        COALESCE(v_address->>'state', ''),
        COALESCE(v_address->>'postal_code', v_address->>'postalCode', ''),
        NULLIF(COALESCE(v_address->>'country', ''), ''),
        COALESCE((v_address->>'is_primary')::BOOLEAN, (v_address->>'isPrimary')::BOOLEAN, FALSE),
        v_now,
        v_now
      )
      RETURNING id INTO v_address_id;

      v_address_ids := array_append(v_address_ids, v_address_id);
    END LOOP;
  END IF;

  -- 3. Return the contact with addresses
  RETURN (
    SELECT json_build_object(
      'contact', json_build_object(
        'id', c.id,
        'company_id', c.company_id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'phone', c.phone,
        'notes', c.notes,
        'archived', c.archived,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      ),
      'addresses', COALESCE(
        (SELECT json_agg(json_build_object(
          'id', ca.id,
          'contact_id', ca.contact_id,
          'address_line1', ca.address_line1,
          'address_line2', ca.address_line2,
          'city', ca.city,
          'state', ca.state,
          'postal_code', ca.postal_code,
          'country', ca.country,
          'is_primary', ca.is_primary,
          'created_at', ca.created_at,
          'updated_at', ca.updated_at
        ))
        FROM contact_addresses ca
        WHERE ca.contact_id = v_contact_id),
        '[]'::JSON
      )
    )
    FROM contacts c
    WHERE c.id = v_contact_id
  );
END;
$$;


-- ============================================================================
-- 2. UPDATE CONTACT WITH ADDRESSES (Transaction)
-- Updates a contact and manages its addresses atomically.
-- Supports adding new addresses - existing addresses are preserved.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_contact_with_addresses(
  p_contact_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_addresses JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing RECORD;
  v_address JSONB;
  v_address_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate contact exists
  SELECT * INTO v_existing
  FROM contacts
  WHERE id = p_contact_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Update the contact (only update provided fields)
  UPDATE contacts
  SET
    first_name = COALESCE(NULLIF(TRIM(p_first_name), ''), first_name),
    last_name = CASE
      WHEN p_last_name IS NOT NULL THEN NULLIF(TRIM(p_last_name), '')
      ELSE last_name
    END,
    email = CASE
      WHEN p_email IS NOT NULL THEN NULLIF(TRIM(p_email), '')
      ELSE email
    END,
    phone = CASE
      WHEN p_phone IS NOT NULL THEN NULLIF(TRIM(p_phone), '')
      ELSE phone
    END,
    notes = CASE
      WHEN p_notes IS NOT NULL THEN NULLIF(TRIM(p_notes), '')
      ELSE notes
    END,
    updated_at = v_now
  WHERE id = p_contact_id;

  -- 2. Add new addresses if provided (does not delete existing)
  IF p_addresses IS NOT NULL AND jsonb_array_length(p_addresses) > 0 THEN
    FOR v_address IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      -- Check if this address has an ID (existing address to update)
      v_address_id := (v_address->>'id')::UUID;

      IF v_address_id IS NOT NULL THEN
        -- Update existing address
        UPDATE contact_addresses
        SET
          address_line1 = COALESCE(v_address->>'address_line1', v_address->>'addressLine1', address_line1),
          address_line2 = COALESCE(NULLIF(COALESCE(v_address->>'address_line2', v_address->>'addressLine2', ''), ''), address_line2),
          city = COALESCE(v_address->>'city', city),
          state = COALESCE(v_address->>'state', state),
          postal_code = COALESCE(v_address->>'postal_code', v_address->>'postalCode', postal_code),
          country = COALESCE(NULLIF(COALESCE(v_address->>'country', ''), ''), country),
          is_primary = COALESCE((v_address->>'is_primary')::BOOLEAN, (v_address->>'isPrimary')::BOOLEAN, is_primary),
          updated_at = v_now
        WHERE id = v_address_id AND contact_id = p_contact_id;
      ELSE
        -- Insert new address
        INSERT INTO contact_addresses (
          contact_id,
          address_line1,
          address_line2,
          city,
          state,
          postal_code,
          country,
          is_primary,
          created_at,
          updated_at
        ) VALUES (
          p_contact_id,
          COALESCE(v_address->>'address_line1', v_address->>'addressLine1', ''),
          NULLIF(COALESCE(v_address->>'address_line2', v_address->>'addressLine2', ''), ''),
          COALESCE(v_address->>'city', ''),
          COALESCE(v_address->>'state', ''),
          COALESCE(v_address->>'postal_code', v_address->>'postalCode', ''),
          NULLIF(COALESCE(v_address->>'country', ''), ''),
          COALESCE((v_address->>'is_primary')::BOOLEAN, (v_address->>'isPrimary')::BOOLEAN, FALSE),
          v_now,
          v_now
        );
      END IF;
    END LOOP;
  END IF;

  -- 3. Return the updated contact with all addresses
  RETURN (
    SELECT json_build_object(
      'contact', json_build_object(
        'id', c.id,
        'company_id', c.company_id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'phone', c.phone,
        'notes', c.notes,
        'archived', c.archived,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      ),
      'addresses', COALESCE(
        (SELECT json_agg(json_build_object(
          'id', ca.id,
          'contact_id', ca.contact_id,
          'address_line1', ca.address_line1,
          'address_line2', ca.address_line2,
          'city', ca.city,
          'state', ca.state,
          'postal_code', ca.postal_code,
          'country', ca.country,
          'is_primary', ca.is_primary,
          'created_at', ca.created_at,
          'updated_at', ca.updated_at
        ))
        FROM contact_addresses ca
        WHERE ca.contact_id = p_contact_id),
        '[]'::JSON
      )
    )
    FROM contacts c
    WHERE c.id = p_contact_id
  );
END;
$$;


-- ============================================================================
-- 3. ADD ADDRESSES TO CONTACT (Transaction)
-- Adds multiple addresses to a contact atomically.
-- If any address creation fails, all are rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION add_addresses_to_contact(
  p_contact_id UUID,
  p_addresses JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing RECORD;
  v_address JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate contact exists
  SELECT * INTO v_existing
  FROM contacts
  WHERE id = p_contact_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Validate addresses array
  IF p_addresses IS NULL OR jsonb_array_length(p_addresses) = 0 THEN
    RAISE EXCEPTION 'addresses array is required and must not be empty';
  END IF;

  -- Insert all addresses
  FOR v_address IN SELECT * FROM jsonb_array_elements(p_addresses)
  LOOP
    INSERT INTO contact_addresses (
      contact_id,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      is_primary,
      created_at,
      updated_at
    ) VALUES (
      p_contact_id,
      COALESCE(v_address->>'address_line1', v_address->>'addressLine1', ''),
      NULLIF(COALESCE(v_address->>'address_line2', v_address->>'addressLine2', ''), ''),
      COALESCE(v_address->>'city', ''),
      COALESCE(v_address->>'state', ''),
      COALESCE(v_address->>'postal_code', v_address->>'postalCode', ''),
      NULLIF(COALESCE(v_address->>'country', ''), ''),
      COALESCE((v_address->>'is_primary')::BOOLEAN, (v_address->>'isPrimary')::BOOLEAN, FALSE),
      v_now,
      v_now
    );
  END LOOP;

  -- Return all addresses for this contact
  RETURN (
    SELECT json_build_object(
      'contact_id', p_contact_id,
      'addresses', COALESCE(
        (SELECT json_agg(json_build_object(
          'id', ca.id,
          'contact_id', ca.contact_id,
          'address_line1', ca.address_line1,
          'address_line2', ca.address_line2,
          'city', ca.city,
          'state', ca.state,
          'postal_code', ca.postal_code,
          'country', ca.country,
          'is_primary', ca.is_primary,
          'created_at', ca.created_at,
          'updated_at', ca.updated_at
        ))
        FROM contact_addresses ca
        WHERE ca.contact_id = p_contact_id),
        '[]'::JSON
      )
    )
  );
END;
$$;
