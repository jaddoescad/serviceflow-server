-- RPC to get all user authentication context in one call
-- Replaces multiple sequential API calls during auth initialization:
-- 1. getUser(userId)
-- 2. listUserOrganizations(userId)
-- 3. getCompany(companyId)
-- 4. listCompanyMembers(companyId)
-- All consolidated into a single database call
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
    'openphone_enabled', c.openphone_enabled,
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
