-- ============================================================================
-- TRANSACTIONAL RPC FUNCTIONS FOR SEEDING AND WORKFLOWS
-- These functions wrap multi-step operations in database transactions to ensure
-- data consistency. If any step fails, all changes are rolled back.
-- ============================================================================

-- ============================================================================
-- 1. SEED DRIP SEQUENCES WITH STEPS (Transaction)
-- Creates all drip sequences and their steps atomically for a company.
-- If any step fails, all sequences and steps are rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_drip_sequences_for_company(
  p_company_id UUID,
  p_sequences JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence JSONB;
  v_step JSONB;
  v_sequence_id UUID;
  v_inserted_count INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate company_id
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- Check if company already has sequences
  IF EXISTS (SELECT 1 FROM drip_sequences WHERE company_id = p_company_id LIMIT 1) THEN
    RETURN json_build_object(
      'insertedSequences', 0,
      'skipped', TRUE
    );
  END IF;

  -- Insert each sequence with its steps
  FOR v_sequence IN SELECT * FROM jsonb_array_elements(p_sequences)
  LOOP
    -- Create the sequence
    INSERT INTO drip_sequences (
      company_id,
      pipeline_id,
      stage_id,
      name,
      is_enabled,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      v_sequence->>'pipeline_id',
      v_sequence->>'stage_id',
      v_sequence->>'name',
      COALESCE((v_sequence->>'is_enabled')::BOOLEAN, TRUE),
      v_now,
      v_now
    )
    RETURNING id INTO v_sequence_id;

    -- Create all steps for this sequence
    FOR v_step IN SELECT * FROM jsonb_array_elements(v_sequence->'steps')
    LOOP
      INSERT INTO drip_steps (
        sequence_id,
        position,
        delay_type,
        delay_value,
        delay_unit,
        channel,
        email_subject,
        email_body,
        sms_body,
        created_at,
        updated_at
      ) VALUES (
        v_sequence_id,
        COALESCE((v_step->>'position')::INT, 1),
        COALESCE(v_step->>'delay_type', 'immediate'),
        COALESCE((v_step->>'delay_value')::INT, 0),
        COALESCE(v_step->>'delay_unit', 'minutes'),
        COALESCE(v_step->>'channel', 'email'),
        v_step->>'email_subject',
        v_step->>'email_body',
        v_step->>'sms_body',
        v_now,
        v_now
      );
    END LOOP;

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN json_build_object(
    'insertedSequences', v_inserted_count,
    'skipped', FALSE
  );
END;
$$;


-- ============================================================================
-- 2. SEED COMMUNICATION TEMPLATES (Transaction)
-- Creates all communication templates atomically for a company.
-- If any template fails, all are rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_communication_templates_for_company(
  p_company_id UUID,
  p_templates JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template JSONB;
  v_inserted_count INT := 0;
  v_existing_keys TEXT[];
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate company_id
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- Get existing template keys for this company
  SELECT ARRAY_AGG(template_key) INTO v_existing_keys
  FROM communication_templates
  WHERE company_id = p_company_id;

  -- Default to empty array if null
  v_existing_keys := COALESCE(v_existing_keys, ARRAY[]::TEXT[]);

  -- Insert each template that doesn't already exist
  FOR v_template IN SELECT * FROM jsonb_array_elements(p_templates)
  LOOP
    -- Skip if template key already exists
    IF v_template->>'template_key' = ANY(v_existing_keys) THEN
      CONTINUE;
    END IF;

    INSERT INTO communication_templates (
      company_id,
      template_key,
      name,
      description,
      email_subject,
      email_body,
      sms_body,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      v_template->>'template_key',
      v_template->>'name',
      v_template->>'description',
      v_template->>'email_subject',
      v_template->>'email_body',
      v_template->>'sms_body',
      v_now,
      v_now
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN json_build_object(
    'insertedTemplates', v_inserted_count,
    'skipped', v_inserted_count = 0
  );
END;
$$;


-- ============================================================================
-- 3. SEED PRODUCT TEMPLATES (Transaction)
-- Creates all product templates atomically for a company.
-- If any template fails, all are rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_product_templates_for_company(
  p_company_id UUID,
  p_created_by_user_id UUID DEFAULT NULL,
  p_templates JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template JSONB;
  v_inserted_count INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate company_id
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- Check if company already has product templates
  IF EXISTS (SELECT 1 FROM product_templates WHERE company_id = p_company_id LIMIT 1) THEN
    RETURN json_build_object(
      'insertedTemplates', 0,
      'skipped', TRUE
    );
  END IF;

  -- Insert each template
  FOR v_template IN SELECT * FROM jsonb_array_elements(p_templates)
  LOOP
    INSERT INTO product_templates (
      company_id,
      created_by_user_id,
      name,
      description,
      type,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      p_created_by_user_id,
      v_template->>'name',
      v_template->>'description',
      COALESCE(v_template->>'type', 'service'),
      v_now,
      v_now
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN json_build_object(
    'insertedTemplates', v_inserted_count,
    'skipped', FALSE
  );
END;
$$;


-- ============================================================================
-- 4. SEED DEAL SOURCES (Transaction)
-- Creates all deal sources atomically for a company using upsert.
-- If any source fails, all are rolled back.
-- ============================================================================
CREATE OR REPLACE FUNCTION seed_deal_sources_for_company(
  p_company_id UUID,
  p_created_by_user_id UUID DEFAULT NULL,
  p_sources JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source JSONB;
  v_upserted_count INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Validate company_id
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- Upsert each source
  FOR v_source IN SELECT * FROM jsonb_array_elements(p_sources)
  LOOP
    INSERT INTO deal_sources (
      company_id,
      name,
      is_default,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      v_source->>'name',
      COALESCE((v_source->>'is_default')::BOOLEAN, TRUE),
      p_created_by_user_id,
      v_now,
      v_now
    )
    ON CONFLICT (company_id, name) DO UPDATE SET
      is_default = EXCLUDED.is_default,
      updated_at = v_now;

    v_upserted_count := v_upserted_count + 1;
  END LOOP;

  RETURN json_build_object(
    'upsertedSources', v_upserted_count
  );
END;
$$;


-- ============================================================================
-- 5. UPDATE QUOTE AND DEAL AFTER SEND (Transaction)
-- Updates quote status to 'sent' and deal stage to 'proposals_sent' atomically.
-- Only updates if communication was actually sent.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_quote_and_deal_after_send(
  p_quote_id UUID,
  p_deal_id UUID,
  p_new_quote_status TEXT DEFAULT 'sent',
  p_new_deal_stage TEXT DEFAULT 'proposals_sent'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote RECORD;
  v_deal RECORD;
  v_quote_updated BOOLEAN := FALSE;
  v_deal_updated BOOLEAN := FALSE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Fetch quote
  SELECT * INTO v_quote
  FROM quotes
  WHERE id = p_quote_id;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Fetch deal
  SELECT * INTO v_deal
  FROM deals
  WHERE id = p_deal_id;

  IF v_deal IS NULL THEN
    RAISE EXCEPTION 'Deal not found';
  END IF;

  -- Verify quote belongs to deal
  IF v_quote.deal_id != p_deal_id THEN
    RAISE EXCEPTION 'Quote does not belong to this deal';
  END IF;

  -- Don't update if quote is already accepted
  IF v_quote.status = 'accepted' THEN
    RETURN json_build_object(
      'quoteStatus', v_quote.status,
      'dealStage', v_deal.stage,
      'quoteUpdated', FALSE,
      'dealUpdated', FALSE,
      'message', 'Quote already accepted, no updates made'
    );
  END IF;

  -- Update quote status
  IF v_quote.status != p_new_quote_status THEN
    UPDATE quotes
    SET status = p_new_quote_status, updated_at = v_now
    WHERE id = p_quote_id;
    v_quote_updated := TRUE;
  END IF;

  -- Update deal stage
  IF v_deal.stage != p_new_deal_stage THEN
    UPDATE deals
    SET stage = p_new_deal_stage, updated_at = v_now
    WHERE id = p_deal_id;
    v_deal_updated := TRUE;
  END IF;

  RETURN json_build_object(
    'quoteStatus', p_new_quote_status,
    'dealStage', p_new_deal_stage,
    'quoteUpdated', v_quote_updated,
    'dealUpdated', v_deal_updated
  );
END;
$$;


-- ============================================================================
-- 6. UPDATE PAYMENT REQUEST AFTER SEND (Transaction)
-- Updates payment request status to 'sent' with sent timestamp atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_payment_request_after_send(
  p_request_id UUID,
  p_sent_via_email BOOLEAN DEFAULT FALSE,
  p_sent_via_text BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Fetch payment request
  SELECT * INTO v_request
  FROM invoice_payment_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;

  -- Only update if status is 'created'
  IF v_request.status != 'created' THEN
    RETURN json_build_object(
      'requestId', p_request_id,
      'status', v_request.status,
      'updated', FALSE,
      'message', 'Payment request already sent or paid'
    );
  END IF;

  -- Update payment request
  UPDATE invoice_payment_requests
  SET
    status = 'sent',
    sent_at = v_now,
    sent_via_email = p_sent_via_email,
    sent_via_text = p_sent_via_text,
    updated_at = v_now
  WHERE id = p_request_id;

  RETURN json_build_object(
    'requestId', p_request_id,
    'status', 'sent',
    'sentAt', v_now,
    'sentViaEmail', p_sent_via_email,
    'sentViaText', p_sent_via_text,
    'updated', TRUE
  );
END;
$$;


-- ============================================================================
-- 7. UPDATE PAYMENT RECEIPT SENT TIMESTAMP (Transaction)
-- Updates the receipt_sent_at timestamp for a payment.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_payment_receipt_sent(
  p_payment_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Fetch payment
  SELECT * INTO v_payment
  FROM invoice_payments
  WHERE id = p_payment_id;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  -- Update receipt_sent_at
  UPDATE invoice_payments
  SET
    receipt_sent_at = v_now,
    updated_at = v_now
  WHERE id = p_payment_id;

  RETURN json_build_object(
    'paymentId', p_payment_id,
    'receiptSentAt', v_now,
    'updated', TRUE
  );
END;
$$;
