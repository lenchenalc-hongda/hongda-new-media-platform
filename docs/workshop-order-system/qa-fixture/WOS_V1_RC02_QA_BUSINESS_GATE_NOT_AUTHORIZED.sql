-- WOS V1 RC02 QA BUSINESS GATE
-- NOT INSTALLED / NOT AUTHORIZED

BEGIN;

DO $rc02_preflight$
BEGIN
  IF current_setting('wos_v1.rc02_install_authorized', true)
      IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'RC02_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF to_regnamespace('wos_v1_rc02_safety') IS NOT NULL THEN
    RAISE EXCEPTION 'RC02_SCHEMA_ALREADY_EXISTS';
  END IF;
  IF to_regnamespace('wos_qa_safety') IS NULL
    OR to_regclass('wos_qa_safety.p2_gate_open_receipts') IS NULL
    OR to_regclass('wos_qa_safety.p2_gate_close_receipts') IS NULL
  THEN
    RAISE EXCEPTION 'RC02_LEGACY_SAFETY_SCHEMA_REQUIRED';
  END IF;
  IF to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
    OR to_regclass('public.wos_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_visual_baselines') IS NULL
    OR to_regclass('public.wos_visual_baseline_items') IS NULL
    OR to_regclass('public.wos_resource_readiness') IS NULL
    OR to_regclass('public.wos_confirmations') IS NULL
    OR to_regclass('public.wos_status_history') IS NULL
    OR to_regclass('public.wos_office_readiness_receipts') IS NULL
    OR to_regclass('public.wos_submission_receipts') IS NULL
    OR to_regclass('public.wos_workshop_inbox') IS NULL
    OR to_regclass('public.wos_office_revisions') IS NULL
    OR to_regclass('public.wos_operator_action_receipts') IS NULL
    OR to_regclass('public.wos_operator_review_receipts') IS NULL
    OR to_regclass('public.wos_order_create_receipts') IS NULL
    OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'RC02_PREREQUISITE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
  ) THEN
    RAISE EXCEPTION 'RC02_QA_ORGANIZATION_MISSING';
  END IF;
END;
$rc02_preflight$;

CREATE SCHEMA wos_v1_rc02_safety;
REVOKE ALL ON SCHEMA wos_v1_rc02_safety FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA wos_v1_rc02_safety TO authenticated, service_role;

CREATE TABLE wos_v1_rc02_safety.rc02_install_fingerprint (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  legacy_safety_fingerprint text NOT NULL
    CHECK (legacy_safety_fingerprint ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON wos_v1_rc02_safety.rc02_install_fingerprint
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION
  wos_v1_rc02_safety.rc02_legacy_safety_fingerprint()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
VOLATILE
AS $legacy_safety_fingerprint$
DECLARE
  v_part text;
  v_parts text[] := ARRAY[]::text[];
  v_row_hash text;
BEGIN
  FOR v_part IN
    SELECT format(
      'namespace|%s|%s|%s',
      namespace_row.oid,
      namespace_row.nspowner,
      COALESCE(namespace_row.nspacl::text, '')
    )
    FROM pg_catalog.pg_namespace namespace_row
    WHERE namespace_row.nspname = 'wos_qa_safety'
    ORDER BY namespace_row.oid
  LOOP
    v_parts := array_append(v_parts, v_part);
  END LOOP;

  FOR v_part IN
    SELECT format(
      'relation|%s|%s|%s|%s|%s',
      class_row.oid,
      class_row.relkind,
      class_row.relowner,
      class_row.relrowsecurity,
      COALESCE(class_row.relacl::text, '')
    )
    FROM pg_catalog.pg_class class_row
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = class_row.relnamespace
    WHERE namespace_row.nspname = 'wos_qa_safety'
    ORDER BY class_row.oid
  LOOP
    v_parts := array_append(v_parts, v_part);
  END LOOP;

  FOR v_part IN
    SELECT format(
      'function|%s|%s|%s|%s|%s',
      procedure_row.oid,
      procedure_row.proowner,
      procedure_row.prosecdef,
      md5(pg_catalog.pg_get_functiondef(procedure_row.oid)),
      COALESCE(procedure_row.proacl::text, '')
    )
    FROM pg_catalog.pg_proc procedure_row
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'wos_qa_safety'
    ORDER BY procedure_row.oid
  LOOP
    v_parts := array_append(v_parts, v_part);
  END LOOP;

  FOR v_part IN
    SELECT format(
      'trigger|%s|%s|%s|%s|%s',
      trigger_row.oid,
      trigger_row.tgrelid,
      trigger_row.tgname,
      trigger_row.tgenabled,
      md5(pg_catalog.pg_get_triggerdef(trigger_row.oid))
    )
    FROM pg_catalog.pg_trigger trigger_row
    JOIN pg_catalog.pg_class class_row
      ON class_row.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = class_row.relnamespace
    WHERE namespace_row.nspname = 'wos_qa_safety'
      AND trigger_row.tgisinternal = false
    ORDER BY trigger_row.oid
  LOOP
    v_parts := array_append(v_parts, v_part);
  END LOOP;

  FOR v_part IN
    SELECT format(
      'policy|%s|%s|%s|%s|%s|%s',
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.policyname,
      policy_row.permissive,
      COALESCE(policy_row.qual, ''),
      COALESCE(policy_row.with_check, '')
    )
    FROM pg_catalog.pg_policies policy_row
    WHERE policy_row.schemaname = 'wos_qa_safety'
    ORDER BY policy_row.tablename, policy_row.policyname
  LOOP
    v_parts := array_append(v_parts, v_part);
  END LOOP;

  FOR v_part IN
    SELECT table_row.tablename
    FROM pg_catalog.pg_tables table_row
    WHERE table_row.schemaname = 'wos_qa_safety'
    ORDER BY table_row.tablename
  LOOP
    EXECUTE format(
      'SELECT md5(COALESCE(string_agg(to_jsonb(source_row)::text, %L ORDER BY to_jsonb(source_row)::text), %L)) FROM %I.%I source_row',
      E'\n',
      '',
      'wos_qa_safety',
      v_part
    ) INTO v_row_hash;
    v_parts := array_append(
      v_parts,
      format('rows|%s|%s', v_part, v_row_hash)
    );
  END LOOP;

  RETURN encode(
    sha256(convert_to(array_to_string(v_parts, E'\n'), 'UTF8')),
    'hex'
  );
END;
$legacy_safety_fingerprint$;
REVOKE ALL ON FUNCTION
  wos_v1_rc02_safety.rc02_legacy_safety_fingerprint()
  FROM PUBLIC, anon, authenticated;

INSERT INTO wos_v1_rc02_safety.rc02_install_fingerprint(
  legacy_safety_fingerprint
) VALUES (
  wos_v1_rc02_safety.rc02_legacy_safety_fingerprint()
);

CREATE TABLE IF NOT EXISTS wos_v1_rc02_safety.rc02_business_grants (
  authorization_id text PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  office_user_id uuid NOT NULL,
  office_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  operator_user_id uuid NOT NULL,
  operator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  project_id uuid NOT NULL,
  create_payload_fingerprint text NOT NULL
    CHECK (create_payload_fingerprint ~ '^[a-f0-9]{64}$'),
  state text NOT NULL
    CHECK (state IN ('AUTHORIZED', 'ORDER_BOUND', 'CLOSED')),
  created_order_id uuid UNIQUE
    REFERENCES public.wos_production_orders(id),
  enabled_until timestamptz,
  approval_reference text NOT NULL DEFAULT 'NOT_AUTHORIZED',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  bound_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (state = 'AUTHORIZED'
      AND created_order_id IS NULL
      AND enabled_until IS NOT NULL
      AND enabled_until > created_at
      AND enabled_until <= created_at + interval '15 minutes'
      AND approval_reference <> 'NOT_AUTHORIZED')
    OR
    (state = 'ORDER_BOUND'
      AND created_order_id IS NOT NULL
      AND bound_at IS NOT NULL
      AND enabled_until IS NOT NULL
      AND bound_at <= enabled_until
      AND enabled_until <= created_at + interval '15 minutes'
      AND approval_reference <> 'NOT_AUTHORIZED')
    OR
    (state = 'CLOSED'
      AND enabled_until IS NULL
      AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rc02_one_active_authorization
  ON wos_v1_rc02_safety.rc02_business_grants ((true))
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND');

ALTER TABLE wos_v1_rc02_safety.rc02_business_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wos_v1_rc02_safety.rc02_business_grants
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON wos_v1_rc02_safety.rc02_business_grants
  TO service_role;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_validate_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $validate_grant$
BEGIN
  IF NEW.order_number NOT LIKE 'QA-NONPROD-%'
    OR length(NEW.authorization_id) NOT BETWEEN 20 AND 160
    OR length(NEW.order_number) NOT BETWEEN 20 AND 120
    OR length(NEW.approval_reference) NOT BETWEEN 12 AND 160
  THEN
    RAISE EXCEPTION 'RC02_GRANT_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = NEW.office_profile_id
      AND profile.user_id = NEW.office_user_id
      AND profile.org_id = NEW.organization_id
      AND profile.is_active = true
      AND profile.role IN ('admin', 'manager', 'sales')
  ) THEN
    RAISE EXCEPTION 'RC02_OFFICE_IDENTITY_INVALID' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = NEW.operator_profile_id
      AND profile.user_id = NEW.operator_user_id
      AND profile.org_id = NEW.organization_id
      AND profile.is_active = true
      AND profile.role IN ('admin', 'manager', 'operator')
  ) THEN
    RAISE EXCEPTION 'RC02_OPERATOR_IDENTITY_INVALID' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cpc_customer_references customer
    WHERE customer.id = NEW.customer_id
      AND customer.org_id = NEW.organization_id
      AND customer.status IN ('active', 'pending_review')
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.cpc_projects project
    WHERE project.id = NEW.project_id
      AND project.org_id = NEW.organization_id
      AND project.customer_reference_id = NEW.customer_id
      AND project.status = 'active'
      AND project.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'RC02_CPC_SCOPE_INVALID' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.state = 'CLOSED' THEN
      RAISE EXCEPTION 'RC02_CLOSED_GRANT_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
      OR NEW.request_id IS DISTINCT FROM OLD.request_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.office_user_id IS DISTINCT FROM OLD.office_user_id
      OR NEW.office_profile_id IS DISTINCT FROM OLD.office_profile_id
      OR NEW.operator_user_id IS DISTINCT FROM OLD.operator_user_id
      OR NEW.operator_profile_id IS DISTINCT FROM OLD.operator_profile_id
      OR NEW.order_number IS DISTINCT FROM OLD.order_number
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.create_payload_fingerprint
        IS DISTINCT FROM OLD.create_payload_fingerprint
      OR NEW.approval_reference IS DISTINCT FROM OLD.approval_reference
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'RC02_GRANT_SCOPE_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF NEW.created_order_id IS DISTINCT FROM OLD.created_order_id
      AND NOT (
        OLD.state = 'AUTHORIZED'
        AND NEW.state = 'ORDER_BOUND'
        AND OLD.created_order_id IS NULL
        AND NEW.created_order_id IS NOT NULL
      )
    THEN
      RAISE EXCEPTION 'RC02_ORDER_REBIND_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF NEW.bound_at IS DISTINCT FROM OLD.bound_at
      AND OLD.bound_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'RC02_BOUND_AT_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF NEW.enabled_until IS DISTINCT FROM OLD.enabled_until
      AND NOT (
        NEW.state = 'CLOSED'
        AND OLD.state IN ('AUTHORIZED', 'ORDER_BOUND')
        AND NEW.enabled_until IS NULL
      )
      AND (
        OLD.enabled_until IS NULL
        OR NEW.enabled_until > OLD.enabled_until
      )
    THEN
      RAISE EXCEPTION 'RC02_TTL_EXTENSION_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state
      AND NOT (
        (OLD.state = 'AUTHORIZED'
          AND NEW.state IN ('ORDER_BOUND', 'CLOSED'))
        OR
        (OLD.state = 'ORDER_BOUND' AND NEW.state = 'CLOSED')
      )
    THEN
      RAISE EXCEPTION 'RC02_STATE_TRANSITION_FORBIDDEN'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$validate_grant$;

REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_validate_grant()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rc02_validate_grant
BEFORE INSERT OR UPDATE
ON wos_v1_rc02_safety.rc02_business_grants
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_validate_grant();

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_create_allows(
  p_request_id uuid,
  p_order_number text,
  p_organization_id uuid,
  p_office_user_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_payload_fingerprint text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $create_allows$
  SELECT EXISTS (
    SELECT 1
    FROM wos_v1_rc02_safety.rc02_business_grants grant_row
    WHERE grant_row.request_id = p_request_id
      AND grant_row.order_number = p_order_number
      AND grant_row.organization_id = p_organization_id
      AND grant_row.office_user_id = p_office_user_id
      AND grant_row.customer_id = p_customer_id
      AND grant_row.project_id = p_project_id
      AND grant_row.create_payload_fingerprint = p_payload_fingerprint
      AND grant_row.state = 'AUTHORIZED'
      AND grant_row.enabled_until > clock_timestamp()
  );
$create_allows$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_order_allows(
  p_order_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $order_allows$
  SELECT EXISTS (
    SELECT 1
    FROM wos_v1_rc02_safety.rc02_business_grants grant_row
    JOIN public.profiles profile
      ON profile.user_id = p_actor_user_id
      AND profile.org_id = grant_row.organization_id
      AND profile.is_active = true
    WHERE grant_row.created_order_id = p_order_id
      AND grant_row.organization_id = p_organization_id
      AND grant_row.state = 'ORDER_BOUND'
      AND grant_row.enabled_until > clock_timestamp()
      AND p_actor_user_id IN (
        grant_row.office_user_id,
        grant_row.operator_user_id
      )
  );
$order_allows$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_lock_order_grant(
  p_order_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
VOLATILE
AS $lock_order_grant$
BEGIN
  PERFORM 1
  FROM wos_v1_rc02_safety.rc02_business_grants grant_row
  JOIN public.profiles profile
    ON profile.user_id = p_actor_user_id
    AND profile.org_id = grant_row.organization_id
    AND profile.is_active = true
  JOIN public.wos_production_orders production_order
    ON production_order.id = grant_row.created_order_id
    AND production_order.organization_id = grant_row.organization_id
  WHERE grant_row.created_order_id = p_order_id
    AND grant_row.organization_id = p_organization_id
    AND grant_row.state = 'ORDER_BOUND'
    AND grant_row.enabled_until > clock_timestamp()
    AND p_actor_user_id IN (
      grant_row.office_user_id,
      grant_row.operator_user_id
    )
  FOR SHARE OF grant_row;
  RETURN FOUND;
END;
$lock_order_grant$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_storage_insert_allows(
  p_bucket_id text,
  p_object_name text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $storage_insert_allows$
  SELECT COALESCE((
    SELECT
      p_bucket_id = 'wos-private'
      AND profile.is_active = true
      AND profile.role IN ('admin', 'manager', 'sales')
      AND production_order.order_number LIKE 'QA-NONPROD-%'
      AND production_order.workflow_status IN (
        'DRAFT',
        'NEEDS_INFORMATION'
      )
      AND production_order.version_label =
        (storage.foldername(p_object_name))[9]
      AND grant_row.state = 'ORDER_BOUND'
      AND grant_row.office_user_id = auth.uid()
      AND grant_row.enabled_until > clock_timestamp()
    FROM public.profiles profile
    JOIN public.wos_production_orders production_order
      ON production_order.id::text =
        (storage.foldername(p_object_name))[5]
      AND production_order.organization_id = profile.org_id
    JOIN wos_v1_rc02_safety.rc02_business_grants grant_row
      ON grant_row.created_order_id = production_order.id
      AND grant_row.organization_id = production_order.organization_id
    WHERE profile.user_id = auth.uid()
      AND profile.org_id::text = (storage.foldername(p_object_name))[2]
    LIMIT 1
  ), false);
$storage_insert_allows$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_operator_can_read(
  p_bucket_id text,
  p_object_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $operator_can_read$
DECLARE
  v_allowed boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.wos_production_orders production_order
      ON production_order.id::text =
        (storage.foldername(p_object_name))[5]
      AND production_order.organization_id = profile.org_id
    JOIN wos_v1_rc02_safety.rc02_business_grants grant_row
      ON grant_row.created_order_id = production_order.id
      AND grant_row.organization_id = production_order.organization_id
    JOIN public.wos_reference_images image
      ON image.organization_id = production_order.organization_id
      AND image.entity_type = 'PRODUCTION_ORDER'
      AND image.entity_id = production_order.id
    JOIN public.wos_visual_baselines baseline
      ON baseline.organization_id = production_order.organization_id
      AND baseline.entity_type = 'PRODUCTION_ORDER'
      AND baseline.entity_id = production_order.id
      AND baseline.version_label = production_order.version_label
    JOIN public.wos_visual_baseline_items baseline_item
      ON baseline_item.baseline_id = baseline.id
      AND baseline_item.reference_image_id = image.id
    JOIN public.wos_verified_image_proofs proof
      ON proof.image_id = image.id
      AND proof.organization_id = image.organization_id
      AND proof.order_id = image.entity_id
    JOIN storage.objects object
      ON object.bucket_id = p_bucket_id
      AND object.name = p_object_name
    WHERE p_bucket_id = 'wos-private'
      AND profile.is_active = true
      AND profile.role = 'operator'
      AND production_order.workflow_status IN (
        'SUBMITTED',
        'WORKSHOP_REVIEW',
        'NEEDS_INFORMATION',
        'WAITING_MATERIAL'
      )
      AND image.image_status = 'READY'
      AND image.superseded_at IS NULL
      AND image.version_label = production_order.version_label
      AND image.category =
        upper(replace((storage.foldername(p_object_name))[7], '-', '_'))
      AND image.id::text = (storage.foldername(p_object_name))[10]
      AND image.storage_path = p_object_name
      AND storage.filename(p_object_name) = 'source.png'
      AND grant_row.state = 'ORDER_BOUND'
      AND grant_row.enabled_until > clock_timestamp()
      AND baseline.status = 'CURRENT'
      AND baseline.superseded_at IS NULL
      AND baseline.version_label = production_order.version_label
      AND baseline_item.is_required = true
      AND proof.expires_at > clock_timestamp()
      AND proof.storage_bucket = image.storage_bucket
      AND proof.storage_path = image.storage_path
      AND object.id = proof.storage_object_id
      AND object.bucket_id = proof.storage_bucket
      AND object.name = proof.storage_path
      AND object.version IS NOT DISTINCT FROM proof.storage_object_version
      AND object.updated_at IS NOT DISTINCT FROM proof.storage_object_updated_at
      AND object.is_delete_marker = false
      AND object.archived_at IS NULL
      AND profile.user_id = auth.uid()
      AND profile.org_id::text =
        (storage.foldername(p_object_name))[2]
      AND (storage.foldername(p_object_name))[1] = 'organizations'
      AND (storage.foldername(p_object_name))[3] = 'wos'
      AND (storage.foldername(p_object_name))[4] = 'production-order'
      AND (storage.foldername(p_object_name))[6] = 'images'
      AND (storage.foldername(p_object_name))[8] = 'versions'
      AND (storage.foldername(p_object_name))[9] =
        production_order.version_label
  ) INTO v_allowed;
  RETURN v_allowed;
END;
$operator_can_read$;

REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_create_allows(
  uuid,text,uuid,uuid,uuid,uuid,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_order_allows(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_lock_order_grant(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_storage_insert_allows(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wos_v1_rc02_safety.rc02_storage_insert_allows(text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_operator_can_read(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wos_v1_rc02_safety.rc02_operator_can_read(text,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_order_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $order_insert_guard$
DECLARE
  v_request_id uuid;
  v_payload_fingerprint text;
BEGIN
  IF current_setting('wos.v1.rc02_maintenance', true) = 'yes' THEN
    RETURN NEW;
  END IF;
  v_request_id := NULLIF(
    current_setting('wos.v1.create_request_id', true), ''
  )::uuid;
  v_payload_fingerprint := NULLIF(
    current_setting('wos.v1.create_payload_fingerprint', true), ''
  );
  IF v_request_id IS NULL
    OR v_payload_fingerprint IS NULL
    OR NOT wos_v1_rc02_safety.rc02_create_allows(
      v_request_id,
      NEW.order_number,
      NEW.organization_id,
      auth.uid(),
      NEW.customer_id,
      NEW.project_id,
      v_payload_fingerprint
    )
  THEN
    RAISE EXCEPTION 'RC02_CREATE_GRANT_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$order_insert_guard$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_order_bind_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $order_bind_grant$
DECLARE
  v_request_id uuid;
  v_rows integer;
BEGIN
  IF current_setting('wos.v1.rc02_maintenance', true) = 'yes' THEN
    RETURN NEW;
  END IF;
  v_request_id := NULLIF(
    current_setting('wos.v1.create_request_id', true), ''
  )::uuid;
  UPDATE wos_v1_rc02_safety.rc02_business_grants
  SET state = 'ORDER_BOUND',
      created_order_id = NEW.id,
      bound_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE request_id = v_request_id
    AND state = 'AUTHORIZED'
    AND enabled_until > clock_timestamp();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RC02_CREATE_BIND_FAILED' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$order_bind_grant$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_order_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $order_update_guard$
BEGIN
  IF current_setting('wos.v1.rc02_maintenance', true) = 'yes' THEN
    RETURN NEW;
  END IF;
  IF NOT wos_v1_rc02_safety.rc02_lock_order_grant(
    NEW.id, NEW.organization_id, auth.uid()
  ) THEN
    RAISE EXCEPTION 'RC02_ORDER_GATE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$order_update_guard$;

REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_order_insert_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_order_bind_grant()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_order_update_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rc02_order_insert_guard
  ON public.wos_production_orders;
CREATE TRIGGER rc02_order_insert_guard
BEFORE INSERT ON public.wos_production_orders
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_order_insert_guard();

DROP TRIGGER IF EXISTS rc02_order_bind_grant
  ON public.wos_production_orders;
CREATE TRIGGER rc02_order_bind_grant
AFTER INSERT ON public.wos_production_orders
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_order_bind_grant();

DROP TRIGGER IF EXISTS rc02_order_update_guard
  ON public.wos_production_orders;
CREATE TRIGGER rc02_order_update_guard
BEFORE UPDATE ON public.wos_production_orders
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_order_update_guard();

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $child_guard$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_order_id uuid;
  v_organization_id uuid;
  v_actor_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'wos_visual_baseline_items' THEN
    SELECT baseline.entity_id, baseline.organization_id
    INTO v_order_id, v_organization_id
    FROM public.wos_visual_baselines baseline
    WHERE baseline.id = (v_row->>'baseline_id')::uuid;
  ELSE
    v_order_id := CASE
      WHEN TG_TABLE_NAME IN (
        'wos_verified_image_proofs',
        'wos_qa_verified_image_proofs',
        'wos_office_readiness_receipts',
        'wos_submission_receipts',
        'wos_workshop_inbox',
        'wos_office_revisions',
        'wos_operator_action_receipts',
        'wos_operator_review_receipts',
        'wos_order_create_receipts'
      )
        THEN (v_row->>'order_id')::uuid
      ELSE (v_row->>'entity_id')::uuid
    END;
    v_organization_id := (v_row->>'organization_id')::uuid;
  END IF;
  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    v_actor_user_id := NULLIF(
      current_setting('wos.qa.actor_user_id', true), ''
    )::uuid;
  END IF;
  IF TG_TABLE_NAME IN (
    'wos_verified_image_proofs',
    'wos_qa_verified_image_proofs'
  ) THEN
    v_actor_user_id := (v_row->>'actor_user_id')::uuid;
  END IF;
  IF current_setting('wos.v1.rc02_maintenance', true) = 'yes'
    AND v_actor_user_id IS NULL
  THEN
    RETURN NEW;
  END IF;
  IF v_order_id IS NULL OR v_organization_id IS NULL
    OR NOT wos_v1_rc02_safety.rc02_lock_order_grant(
      v_order_id, v_organization_id, v_actor_user_id
    )
  THEN
    RAISE EXCEPTION 'RC02_ORDER_GATE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$child_guard$;

REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_child_order_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rc02_reference_image_guard
  ON public.wos_reference_images;
CREATE TRIGGER rc02_reference_image_guard
BEFORE INSERT OR UPDATE ON public.wos_reference_images
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

CREATE OR REPLACE FUNCTION
  wos_v1_rc02_safety.rc02_current_image_baseline_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $current_image_baseline_guard$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_baseline_id uuid;
BEGIN
  IF NEW.entity_type <> 'PRODUCTION_ORDER'
    OR NEW.image_status <> 'READY'
    OR NEW.superseded_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = NEW.entity_id
    AND production_order.organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.version_label <> NEW.version_label
    OR (
      SELECT count(DISTINCT image.category)
      FROM public.wos_reference_images image
      WHERE image.organization_id = NEW.organization_id
        AND image.entity_type = 'PRODUCTION_ORDER'
        AND image.entity_id = NEW.entity_id
        AND image.version_label = NEW.version_label
        AND image.image_status = 'READY'
        AND image.superseded_at IS NULL
        AND image.category IN (
          'PRODUCT',
          'FILM_PATTERN',
          'CUSTOMER_APPROVED_SAMPLE',
          'SIGNED_SAMPLE'
        )
    ) <> 4
  THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.wos_visual_baselines baseline
    WHERE baseline.organization_id = NEW.organization_id
      AND baseline.entity_type = 'PRODUCTION_ORDER'
      AND baseline.entity_id = NEW.entity_id
      AND baseline.version_label = NEW.version_label
      AND baseline.status = 'CURRENT'
      AND baseline.superseded_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.wos_visual_baselines
  SET status = 'SUPERSEDED',
      superseded_at = clock_timestamp()
  WHERE organization_id = NEW.organization_id
    AND entity_type = 'PRODUCTION_ORDER'
    AND entity_id = NEW.entity_id
    AND status = 'CURRENT'
    AND superseded_at IS NULL;

  v_baseline_id := gen_random_uuid();
  INSERT INTO public.wos_visual_baselines(
    id, organization_id, entity_type, entity_id,
    version_label, status
  ) VALUES (
    v_baseline_id, NEW.organization_id, 'PRODUCTION_ORDER', NEW.entity_id,
    NEW.version_label, 'CURRENT'
  );
  INSERT INTO public.wos_visual_baseline_items(
    baseline_id, reference_image_id, display_order, is_required
  )
  SELECT
    v_baseline_id,
    image.id,
    row_number() OVER (ORDER BY image.category)::integer,
    true
  FROM public.wos_reference_images image
  WHERE image.organization_id = NEW.organization_id
    AND image.entity_type = 'PRODUCTION_ORDER'
    AND image.entity_id = NEW.entity_id
    AND image.version_label = NEW.version_label
    AND image.image_status = 'READY'
    AND image.superseded_at IS NULL;
  RETURN NEW;
END;
$current_image_baseline_guard$;
REVOKE ALL ON FUNCTION
  wos_v1_rc02_safety.rc02_current_image_baseline_guard()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rc02_current_image_baseline_guard
AFTER INSERT OR UPDATE OF image_status, version_label, storage_path
ON public.wos_reference_images
FOR EACH ROW
EXECUTE FUNCTION wos_v1_rc02_safety.rc02_current_image_baseline_guard();

DROP TRIGGER IF EXISTS rc02_readiness_receipt_guard
  ON public.wos_office_readiness_receipts;
CREATE TRIGGER rc02_readiness_receipt_guard
BEFORE INSERT OR UPDATE ON public.wos_office_readiness_receipts
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_submission_receipt_guard
  ON public.wos_submission_receipts;
CREATE TRIGGER rc02_submission_receipt_guard
BEFORE INSERT OR UPDATE ON public.wos_submission_receipts
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_workshop_inbox_guard
  ON public.wos_workshop_inbox;
CREATE TRIGGER rc02_workshop_inbox_guard
BEFORE INSERT OR UPDATE ON public.wos_workshop_inbox
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_office_revision_guard
  ON public.wos_office_revisions;
CREATE TRIGGER rc02_office_revision_guard
BEFORE INSERT OR UPDATE ON public.wos_office_revisions
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_operator_action_receipt_guard
  ON public.wos_operator_action_receipts;
CREATE TRIGGER rc02_operator_action_receipt_guard
BEFORE INSERT OR UPDATE ON public.wos_operator_action_receipts
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_operator_review_receipt_guard
  ON public.wos_operator_review_receipts;
CREATE TRIGGER rc02_operator_review_receipt_guard
BEFORE INSERT OR UPDATE ON public.wos_operator_review_receipts
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_order_create_receipt_guard
  ON public.wos_order_create_receipts;
CREATE TRIGGER rc02_order_create_receipt_guard
BEFORE INSERT OR UPDATE ON public.wos_order_create_receipts
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DO $proof_guards$
BEGIN
  IF to_regclass('public.wos_verified_image_proofs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS rc02_verified_proof_guard
      ON public.wos_verified_image_proofs;
    CREATE TRIGGER rc02_verified_proof_guard
    BEFORE INSERT OR UPDATE ON public.wos_verified_image_proofs
    FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();
  END IF;
  IF to_regclass('public.wos_qa_verified_image_proofs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS rc02_verified_proof_guard
      ON public.wos_qa_verified_image_proofs;
    CREATE TRIGGER rc02_verified_proof_guard
    BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
    FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();
  END IF;
END;
$proof_guards$;

DROP TRIGGER IF EXISTS rc02_resource_guard
  ON public.wos_resource_readiness;
CREATE TRIGGER rc02_resource_guard
BEFORE INSERT OR UPDATE ON public.wos_resource_readiness
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_visual_baseline_guard
  ON public.wos_visual_baselines;
CREATE TRIGGER rc02_visual_baseline_guard
BEFORE INSERT OR UPDATE ON public.wos_visual_baselines
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_visual_baseline_item_guard
  ON public.wos_visual_baseline_items;
CREATE TRIGGER rc02_visual_baseline_item_guard
BEFORE INSERT OR UPDATE ON public.wos_visual_baseline_items
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_confirmation_guard
  ON public.wos_confirmations;
CREATE TRIGGER rc02_confirmation_guard
BEFORE INSERT OR UPDATE ON public.wos_confirmations
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

DROP TRIGGER IF EXISTS rc02_status_history_guard
  ON public.wos_status_history;
CREATE TRIGGER rc02_status_history_guard
BEFORE INSERT ON public.wos_status_history
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_child_order_guard();

CREATE TABLE IF NOT EXISTS wos_v1_rc02_safety.rc02_policy_backup (
  policy_name text PRIMARY KEY,
  permissive text NOT NULL,
  role_names text[] NOT NULL,
  command text NOT NULL,
  using_expression text,
  check_expression text,
  backed_up_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON wos_v1_rc02_safety.rc02_policy_backup
  FROM PUBLIC, anon, authenticated;

INSERT INTO wos_v1_rc02_safety.rc02_policy_backup(
  policy_name, permissive, role_names, command,
  using_expression, check_expression
)
SELECT policy.policyname,
  policy.permissive,
  policy.roles,
  policy.cmd,
  policy.qual,
  policy.with_check
FROM pg_catalog.pg_policies policy
WHERE policy.schemaname = 'storage'
  AND policy.tablename = 'objects'
  AND policy.cmd = 'INSERT'
  AND 'authenticated' = ANY (policy.roles)
  AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
ON CONFLICT(policy_name) DO NOTHING;

DO $drop_wos_insert_policies$
DECLARE
  v_policy_name text;
BEGIN
  FOR v_policy_name IN
    SELECT policy_name
    FROM wos_v1_rc02_safety.rc02_policy_backup
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON storage.objects',
      v_policy_name
    );
  END LOOP;
END;
$drop_wos_insert_policies$;

CREATE POLICY wos_qa_rc02_private_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND (storage.foldername(name))[6] = 'images'
  AND (storage.foldername(name))[7] IN (
    'product',
    'film-pattern',
    'customer-approved-sample',
    'signed-sample'
  )
  AND (storage.foldername(name))[8] = 'versions'
  AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
  AND (storage.foldername(name))[10] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND storage.filename(name) = 'source.png'
  AND wos_v1_rc02_safety.rc02_storage_insert_allows(bucket_id, name)
);

CREATE POLICY wos_v1_rc02_operator_private_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'wos-private'
  AND wos_v1_rc02_safety.rc02_operator_can_read(bucket_id, name)
);

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_storage_no_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $no_upsert$
BEGIN
  IF auth.uid() IS NOT NULL
    AND NEW.bucket_id = 'wos-private'
    AND NEW.name LIKE 'organizations/%/wos/production-order/%/images/%'
    AND EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = NEW.bucket_id
        AND object.name = NEW.name
    )
  THEN
    RAISE EXCEPTION 'RC02_STORAGE_UPSERT_FORBIDDEN' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$no_upsert$;

CREATE OR REPLACE FUNCTION wos_v1_rc02_safety.rc02_storage_gate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $storage_gate_guard$
DECLARE
  v_folders text[];
BEGIN
  IF auth.uid() IS NULL
    OR NEW.bucket_id <> 'wos-private'
    OR NEW.name NOT LIKE 'organizations/%/wos/production-order/%/images/%'
  THEN
    RETURN NEW;
  END IF;
  v_folders := storage.foldername(NEW.name);
  IF v_folders[2] !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR v_folders[5] !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN NEW;
  END IF;
  IF NOT wos_v1_rc02_safety.rc02_lock_order_grant(
    v_folders[5]::uuid,
    v_folders[2]::uuid,
    auth.uid()
  ) THEN
    RAISE EXCEPTION 'RC02_ORDER_GATE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$storage_gate_guard$;

REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_storage_no_upsert()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wos_v1_rc02_safety.rc02_storage_gate_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rc02_storage_no_upsert ON storage.objects;
CREATE TRIGGER rc02_storage_no_upsert
BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_storage_no_upsert();

DROP TRIGGER IF EXISTS rc02_storage_gate_guard ON storage.objects;
CREATE TRIGGER rc02_storage_gate_guard
BEFORE INSERT ON storage.objects
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc02_safety.rc02_storage_gate_guard();

DO $rc02_postflight$
BEGIN
  IF (
    SELECT count(*)
    FROM wos_v1_rc02_safety.rc02_business_grants
    WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
  ) <> 0 THEN
    RAISE EXCEPTION 'RC02_INSTALL_MUST_START_EMPTY';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'wos_qa_rc02_private_insert'
  ) THEN
    RAISE EXCEPTION 'RC02_STORAGE_POLICY_MISSING';
  END IF;
END;
$rc02_postflight$;

COMMIT;

-- NOT INSTALLED / NOT AUTHORIZED
