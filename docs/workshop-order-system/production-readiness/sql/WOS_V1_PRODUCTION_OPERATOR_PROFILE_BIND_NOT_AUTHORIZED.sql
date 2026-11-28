-- WOS V1 PRODUCTION OPERATOR PROFILE BINDING TEMPLATE
-- INSTALL_NOT_AUTHORIZED
--
-- This file binds one already-invited, email-confirmed Supabase Auth user to
-- one active Production Operator Profile. It does not create Auth users,
-- send invitations, change Jake Wu's Sales role, or grant table privileges.
--
-- Required session settings:
--   wos_v1.production_operator_binding_authorized = 'yes'
--   wos_v1.production_project_ref = 'amqpvxrurenevniilhtl'
--   wos_v1.operator_auth_user_id = '<auth.users.id>'
--   wos_v1.operator_email = '<confirmed email>'
--   wos_v1.operator_org_id = '<organization_id>'

BEGIN;

DO $operator_bind$
DECLARE
  v_auth_user public.profiles%ROWTYPE;
  v_existing public.profiles%ROWTYPE;
  v_auth_user_id uuid;
  v_email text;
  v_org_id uuid;
  v_existing_count integer;
BEGIN
  IF current_setting(
      'wos_v1.production_operator_binding_authorized',
      true
    ) IS DISTINCT FROM 'yes'
    OR current_setting('wos_v1.production_project_ref', true)
      IS DISTINCT FROM 'amqpvxrurenevniilhtl'
  THEN
    RAISE EXCEPTION 'WOS_V1_OPERATOR_BINDING_NOT_AUTHORIZED';
  END IF;

  v_auth_user_id := nullif(
    current_setting('wos_v1.operator_auth_user_id', true),
    ''
  )::uuid;
  v_email := lower(btrim(
    coalesce(current_setting('wos_v1.operator_email', true), '')
  ));
  v_org_id := nullif(
    current_setting('wos_v1.operator_org_id', true),
    ''
  )::uuid;

  IF v_auth_user_id IS NULL
    OR v_org_id IS NULL
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'WOS_V1_OPERATOR_BINDING_INPUT_INVALID';
  END IF;

  IF v_auth_user_id = '9dabd373-ada3-48ca-a970-ee968f7f005e'::uuid
    OR v_email = 'jake.wu@hongda.cn'
  THEN
    RAISE EXCEPTION 'WOS_V1_JAKE_SALES_ROLE_MUST_REMAIN_UNCHANGED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users auth_user
    WHERE auth_user.id = v_auth_user_id
      AND lower(auth_user.email) = v_email
      AND auth_user.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'WOS_V1_OPERATOR_AUTH_USER_NOT_CONFIRMED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations organization
    WHERE organization.id = v_org_id
  ) THEN
    RAISE EXCEPTION 'WOS_V1_OPERATOR_ORGANIZATION_NOT_FOUND';
  END IF;

  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.profiles profile
  WHERE profile.user_id = v_auth_user_id;
  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'WOS_V1_OPERATOR_PROFILE_DUPLICATE';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.profiles profile
  WHERE profile.user_id = v_auth_user_id;
  IF FOUND THEN
    IF v_existing.org_id <> v_org_id
      OR v_existing.role NOT IN ('viewer', 'operator')
    THEN
      RAISE EXCEPTION 'WOS_V1_OPERATOR_EXISTING_PROFILE_REQUIRES_REVIEW';
    END IF;
    UPDATE public.profiles
    SET org_id = v_org_id,
        email = v_email,
        role = 'operator',
        department = 'Workshop',
        is_active = true,
        updated_at = clock_timestamp()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.profiles (
      user_id,
      org_id,
      full_name,
      email,
      role,
      department,
      is_active
    ) VALUES (
      v_auth_user_id,
      v_org_id,
      v_email,
      v_email,
      'operator',
      'Workshop',
      true
    );
  END IF;

  IF (
    SELECT count(*)
    FROM public.profiles profile
    WHERE profile.user_id = v_auth_user_id
      AND profile.org_id = v_org_id
      AND lower(profile.email) = v_email
      AND profile.role = 'operator'
      AND profile.is_active = true
  ) <> 1 THEN
    RAISE EXCEPTION 'WOS_V1_OPERATOR_BINDING_VERIFY_FAILED';
  END IF;
END;
$operator_bind$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
