-- WOS V1 RC03 QA RUNTIME COMPATIBILITY FORWARD
-- QA ONLY / NOT INSTALLED / NOT AUTHORIZED

BEGIN;

DO $rc03_compat_preflight$
DECLARE
  v_expected text;
  v_actual text;
BEGIN
  IF current_setting('wos_v1.rc03_compat_install_authorized', true)
      IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'RC03_COMPAT_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF to_regnamespace('wos_v1_rc03_compat') IS NOT NULL THEN
    RAISE EXCEPTION 'RC03_COMPAT_SCHEMA_ALREADY_EXISTS';
  END IF;
  IF to_regnamespace('wos_qa_safety') IS NULL
    OR to_regclass('wos_qa_safety.p2_gate_open_receipts') IS NULL
    OR to_regclass('wos_qa_safety.p2_gate_close_receipts') IS NULL
    OR to_regclass('public.wos_qa_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_qa_orphan_cleanup_claims') IS NULL
    OR to_regprocedure('public.wos_qa_proof_write_guard()') IS NULL
    OR to_regprocedure(
      'public.wos_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'RC03_COMPAT_PREREQUISITE_MISSING';
  END IF;
  IF encode(
    sha256(convert_to(
      pg_get_functiondef('public.wos_qa_proof_write_guard()'::regprocedure),
      'UTF8'
    )),
    'hex'
  ) <> '9a91e8e6441e0beee2c4fa3d4d410582784d3d310939c99007ac65f06d7a63fd' THEN
    RAISE EXCEPTION 'RC03_LEGACY_PROOF_GUARD_DEFINITION_MISMATCH';
  END IF;
  IF to_regclass('public.wos_verified_image_proofs') IS NOT NULL
    OR to_regclass('public.wos_orphan_cleanup_claims') IS NOT NULL
    OR to_regclass('public.wos_office_revisions') IS NOT NULL
    OR to_regclass('public.wos_operator_action_receipts') IS NOT NULL
    OR to_regclass('public.wos_operator_review_receipts') IS NOT NULL
    OR to_regclass('public.wos_order_create_receipts') IS NOT NULL
  THEN
    RAISE EXCEPTION 'RC03_COMPAT_ALREADY_PARTIALLY_INSTALLED';
  END IF;
  IF to_regclass('public.wos_office_readiness_receipts') IS NULL
    OR to_regclass('public.wos_submission_receipts') IS NULL
    OR to_regclass('public.wos_workshop_inbox') IS NULL
    OR to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
    OR to_regclass('public.wos_visual_baselines') IS NULL
    OR to_regclass('public.wos_visual_baseline_items') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR to_regclass('storage.buckets') IS NULL
  THEN
    RAISE EXCEPTION 'RC03_COMPAT_QA_BASE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'wos-private'
      AND name = 'wos-private'
      AND public = false
      AND file_size_limit = 20971520
      AND allowed_mime_types @> ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp'
      ]
  ) THEN
    RAISE EXCEPTION 'RC03_COMPAT_BUCKET_MISMATCH';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
  ) < 4 THEN
    RAISE EXCEPTION 'RC03_COMPAT_STORAGE_POLICIES_MISSING';
  END IF;
  IF NOT pg_catalog.has_table_privilege(
    'authenticated',
    'public.wos_production_orders',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'RC03_COMPAT_EXPECTED_LEGACY_INSERT_GRANT_MISSING';
  END IF;

  v_expected := current_setting('wos_v1.rc03_expected_counts', true);
  IF v_expected IS NOT NULL AND v_expected <> '' THEN
    SELECT jsonb_build_object(
      'orders', (SELECT count(*) FROM public.wos_production_orders),
      'images', (SELECT count(*) FROM public.wos_reference_images),
      'proofs', (SELECT count(*) FROM public.wos_qa_verified_image_proofs),
      'trusted_receipts', (
        SELECT count(*) FROM public.wos_qa_trusted_proof_receipts
      ),
      'storage_objects', (
        SELECT count(*) FROM storage.objects WHERE bucket_id = 'wos-private'
      ),
      'baselines', (SELECT count(*) FROM public.wos_visual_baselines),
      'baseline_items', (
        SELECT count(*) FROM public.wos_visual_baseline_items
      )
    )::text INTO v_actual;
    IF v_actual::jsonb IS DISTINCT FROM v_expected::jsonb
    THEN
      RAISE EXCEPTION 'RC03_COMPAT_BASELINE_DRIFT';
    END IF;
  END IF;
END;
$rc03_compat_preflight$;

CREATE SCHEMA wos_v1_rc03_compat;
REVOKE ALL ON SCHEMA wos_v1_rc03_compat FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA wos_v1_rc03_compat TO service_role;

CREATE TABLE wos_v1_rc03_compat.storage_policy_backup (
  policy_name text PRIMARY KEY,
  permissive text NOT NULL,
  role_names name[] NOT NULL,
  command text NOT NULL,
  using_expression text,
  check_expression text,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE wos_v1_rc03_compat.bucket_backup (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  file_size_limit bigint,
  allowed_mime_types text[],
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE wos_v1_rc03_compat.table_acl_backup (
  table_name text NOT NULL,
  grantee name NOT NULL,
  privilege_type text NOT NULL,
  PRIMARY KEY(table_name, grantee, privilege_type)
);

CREATE TABLE wos_v1_rc03_compat.historical_rows (
  object_kind text NOT NULL,
  row_key text NOT NULL,
  row_hash text NOT NULL CHECK (row_hash ~ '^[a-f0-9]{32}$'),
  PRIMARY KEY(object_kind, row_key)
);
CREATE TABLE wos_v1_rc03_compat.function_definition_backup (
  function_name text PRIMARY KEY,
  definition_sha256 text NOT NULL CHECK(definition_sha256 ~ '^[a-f0-9]{64}$'),
  acl text NOT NULL
);
REVOKE ALL ON wos_v1_rc03_compat.storage_policy_backup,
  wos_v1_rc03_compat.bucket_backup,
  wos_v1_rc03_compat.table_acl_backup,
  wos_v1_rc03_compat.historical_rows,
  wos_v1_rc03_compat.function_definition_backup
FROM PUBLIC, anon, authenticated;

INSERT INTO wos_v1_rc03_compat.storage_policy_backup(
  policy_name, permissive, role_names, command,
  using_expression, check_expression
)
SELECT
  policy.policyname,
  policy.permissive,
  policy.roles,
  policy.cmd,
  policy.qual,
  policy.with_check
FROM pg_catalog.pg_policies policy
WHERE policy.schemaname = 'storage'
  AND policy.tablename = 'objects'
  AND policy.policyname LIKE 'wos\_%' ESCAPE '\';

INSERT INTO wos_v1_rc03_compat.bucket_backup(
  file_size_limit, allowed_mime_types
)
SELECT file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'wos-private';

INSERT INTO wos_v1_rc03_compat.table_acl_backup(
  table_name, grantee, privilege_type
)
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('wos_production_orders', 'wos_reference_images')
  AND grantee IN ('authenticated', 'anon');

INSERT INTO wos_v1_rc03_compat.function_definition_backup(
  function_name, definition_sha256, acl
)
SELECT
  procedure_row.oid::regprocedure::text,
  encode(
    sha256(convert_to(pg_get_functiondef(procedure_row.oid), 'UTF8')),
    'hex'
  ),
  COALESCE(procedure_row.proacl::text, '')
FROM pg_proc procedure_row
WHERE procedure_row.oid IN (
  'public.wos_qa_proof_write_guard()'::regprocedure,
  'public.wos_confirm_office_completeness(uuid,integer,text,text)'::regprocedure,
  'public.wos_submit_production_order(uuid,integer,text,uuid)'::regprocedure,
  'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure,
  'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
);
DO $verify_function_backup$
BEGIN
  IF (
    SELECT count(*)
    FROM wos_v1_rc03_compat.function_definition_backup
  ) <> 5 THEN
    RAISE EXCEPTION 'RC03_COMPAT_FUNCTION_BACKUP_INCOMPLETE';
  END IF;
END;
$verify_function_backup$;

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT 'order', id::text, md5(to_jsonb(source_row)::text)
FROM public.wos_production_orders source_row;

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT 'image', id::text, md5(to_jsonb(source_row)::text)
FROM public.wos_reference_images source_row;

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT 'proof', image_id::text, md5(to_jsonb(source_row)::text)
FROM public.wos_qa_verified_image_proofs source_row;

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT 'trusted_receipt', request_id::text, md5(to_jsonb(source_row)::text)
FROM public.wos_qa_trusted_proof_receipts source_row;

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT
  'storage_object',
  bucket_id || '/' || name,
  md5(to_jsonb(source_row)::text)
FROM storage.objects source_row
WHERE bucket_id = 'wos-private';

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT 'baseline', id::text, md5(to_jsonb(source_row)::text)
FROM public.wos_visual_baselines source_row;

INSERT INTO wos_v1_rc03_compat.historical_rows(
  object_kind, row_key, row_hash
)
SELECT
  'baseline_item',
  baseline_id::text || '/' || reference_image_id::text,
  md5(to_jsonb(source_row)::text)
FROM public.wos_visual_baseline_items source_row;

DO $drop_legacy_wos_policies$
DECLARE
  v_policy_name text;
BEGIN
  FOR v_policy_name IN
    SELECT policy_name
    FROM wos_v1_rc03_compat.storage_policy_backup
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON storage.objects',
      v_policy_name
    );
  END LOOP;
END;
$drop_legacy_wos_policies$;

CREATE POLICY wos_p8_private_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='wos-private'
  AND (storage.foldername(name))[1]='organizations'
  AND (storage.foldername(name))[3]='wos'
  AND (storage.foldername(name))[4]='production-order'
  AND (storage.foldername(name))[6]='images'
  AND (storage.foldername(name))[7] IN (
    'product','film-pattern','customer-approved-sample','signed-sample'
  )
  AND (storage.foldername(name))[8]='versions'
  AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
  AND (storage.foldername(name))[10] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.wos_production_orders o ON o.organization_id=p.org_id
    WHERE p.user_id=auth.uid() AND p.is_active
      AND p.role IN ('admin','manager','sales')
      AND p.org_id::text=(storage.foldername(storage.objects.name))[2]
      AND o.id::text=(storage.foldername(storage.objects.name))[5]
      AND o.workflow_status IN ('DRAFT','NEEDS_INFORMATION')
      AND o.version_label=(storage.foldername(storage.objects.name))[9]
      AND (p.role<>'sales' OR p.id=o.created_by_profile_id OR p.id=o.sales_owner_profile_id)
  )
);

CREATE POLICY wos_p8_private_select
ON storage.objects FOR SELECT TO authenticated
USING (
  (
    bucket_id='wos-private'
    AND (storage.foldername(name))[1]='organizations'
    AND (storage.foldername(name))[3]='wos'
    AND (storage.foldername(name))[4]='production-order'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.wos_production_orders o ON o.organization_id=p.org_id
      WHERE p.user_id=auth.uid() AND p.is_active
        AND p.org_id::text=(storage.foldername(storage.objects.name))[2]
        AND o.id::text=(storage.foldername(storage.objects.name))[5]
        AND (
          p.role IN ('admin','manager')
          OR (
            p.role='sales'
            AND p.id IN (o.created_by_profile_id,o.sales_owner_profile_id)
          )
        )
    )
  )
);

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png']
WHERE id = 'wos-private';

REVOKE INSERT, UPDATE, DELETE ON public.wos_production_orders
FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wos_reference_images
FROM anon, authenticated;

CREATE TABLE public.wos_verified_image_proofs (
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'wos-private'
    CHECK (storage_bucket = 'wos-private'),
  storage_path text NOT NULL UNIQUE,
  storage_object_id uuid NOT NULL,
  storage_object_version text NOT NULL
    CHECK (length(storage_object_version) BETWEEN 1 AND 512),
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL CHECK (verified_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (
    expires_at > verified_at
    AND expires_at <= verified_at + interval '30 minutes'
  )
);
CREATE INDEX wos_v1_rc03_verified_proof_order_idx
  ON public.wos_verified_image_proofs(order_id, expires_at);
ALTER TABLE public.wos_verified_image_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_verified_image_proofs
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wos_verified_image_proofs
TO service_role;

CREATE FUNCTION wos_v1_rc03_compat.reject_verified_proof_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $reject_verified_proof_update$
BEGIN
  IF NEW.image_id IS DISTINCT FROM OLD.image_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.storage_object_id IS DISTINCT FROM OLD.storage_object_id
    OR NEW.storage_object_version IS DISTINCT FROM OLD.storage_object_version
    OR NEW.storage_object_updated_at IS DISTINCT FROM OLD.storage_object_updated_at
    OR NEW.verified_sha256 IS DISTINCT FROM OLD.verified_sha256
  THEN
    RAISE EXCEPTION 'RC03_PROOF_IDENTITY_UPDATE_FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.verified_at IS DISTINCT FROM OLD.verified_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'RC03_PROOF_RENEWAL_UNSUPPORTED'
      USING ERRCODE = '0A000';
  END IF;
  RAISE EXCEPTION 'RC03_PROOF_UPDATE_FORBIDDEN'
    USING ERRCODE = '42501';
END;
$reject_verified_proof_update$;
REVOKE ALL ON FUNCTION wos_v1_rc03_compat.reject_verified_proof_update()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rc03_reject_verified_proof_update
BEFORE UPDATE ON public.wos_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc03_compat.reject_verified_proof_update();

CREATE TABLE public.wos_orphan_cleanup_claims (
  storage_object_id uuid PRIMARY KEY,
  storage_path text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  object_version text,
  object_updated_at timestamptz NOT NULL,
  claim_token uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('CLAIMED', 'REMOVED', 'RELEASED')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  last_result text,
  CHECK (
    lease_expires_at > claimed_at
    AND lease_expires_at <= claimed_at + interval '10 minutes'
  )
);
CREATE INDEX wos_v1_rc03_cleanup_lease_idx
  ON public.wos_orphan_cleanup_claims(state, lease_expires_at);
ALTER TABLE public.wos_orphan_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_orphan_cleanup_claims
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wos_orphan_cleanup_claims
TO service_role;

ALTER FUNCTION public.wos_qa_proof_write_guard()
  SET SCHEMA wos_v1_rc03_compat;
ALTER FUNCTION wos_v1_rc03_compat.wos_qa_proof_write_guard()
  RENAME TO wos_qa_proof_write_guard_original;

CREATE FUNCTION public.wos_qa_proof_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $rc04_proof_guard$
DECLARE
  v_obj storage.objects%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_expected_path text;
BEGIN
  IF pg_catalog.current_setting('wos.v1.rc03_proof_mirror', true) = '1' THEN
    IF TG_OP IS DISTINCT FROM 'INSERT' THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_UPDATE_FORBIDDEN'
        USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.wos_qa_verified_image_proofs proof
      WHERE proof.image_id = NEW.image_id
    ) THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_WOULD_REPLACE_HISTORY'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_order
    FROM public.wos_production_orders production_order
    WHERE production_order.id = NEW.order_id
      AND production_order.organization_id = NEW.organization_id;
    IF NOT FOUND
      OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
      OR v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')
      OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
    THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_ORDER_NOT_ELIGIBLE'
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_profile
    FROM public.profiles profile
    WHERE profile.user_id = NEW.actor_user_id
      AND profile.is_active = true
      AND profile.role IN ('admin', 'manager', 'sales')
      AND profile.org_id = v_order.organization_id
    LIMIT 1;
    IF NOT FOUND
      OR (
        v_profile.role = 'sales'
        AND v_profile.id NOT IN (
          v_order.created_by_profile_id,
          v_order.sales_owner_profile_id
        )
      )
    THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_ACTOR_NOT_AUTHORIZED'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM wos_v1_rc02_safety.rc02_business_grants grant_row
      WHERE grant_row.created_order_id = v_order.id
        AND grant_row.organization_id = v_order.organization_id
        AND grant_row.office_user_id = NEW.actor_user_id
        AND grant_row.state = 'ORDER_BOUND'
        AND grant_row.enabled_until > clock_timestamp()
        AND grant_row.closed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_GATE_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
    v_expected_path := pg_catalog.format(
      'organizations/%s/wos/production-order/%s/images/__CATEGORY__/versions/%s/%s/source.png',
      v_order.organization_id,
      v_order.id,
      v_order.version_label,
      NEW.image_id
    );
    IF NEW.storage_bucket <> 'wos-private'
      OR NEW.storage_path NOT IN (
        pg_catalog.replace(v_expected_path, '__CATEGORY__', 'product'),
        pg_catalog.replace(v_expected_path, '__CATEGORY__', 'film-pattern'),
        pg_catalog.replace(v_expected_path, '__CATEGORY__', 'customer-approved-sample'),
        pg_catalog.replace(v_expected_path, '__CATEGORY__', 'signed-sample')
      )
    THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_PATH_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_obj
    FROM storage.objects object
    WHERE object.id = NEW.storage_object_id
      AND object.bucket_id = NEW.storage_bucket
      AND object.name = NEW.storage_path
      AND object.owner_id = NEW.actor_user_id::text
      AND object.version = NEW.storage_object_version
      AND object.updated_at = NEW.storage_object_updated_at
      AND object.is_delete_marker = false
      AND object.archived_at IS NULL;
    IF NOT FOUND OR v_obj.metadata->>'mimetype' <> 'image/png' THEN
      RAISE EXCEPTION 'RC03_PROOF_MIRROR_OBJECT_CHANGED'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.wos_qa_orphan_cleanup_claims claim
      WHERE claim.storage_object_id = v_obj.id
        AND claim.state = 'CLAIMED'
        AND claim.lease_expires_at > clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS'
        USING ERRCODE = 'PT409';
    END IF;
    RETURN NEW;
  END IF;

  -- Normal legacy-QA writes retain the exact pre-RC03 behavior.
  IF pg_catalog.current_setting('wos.qa.trusted_proof_rpc', true)
      IS DISTINCT FROM '1'
    OR pg_catalog.current_setting('wos.qa.actor_user_id', true)
      IS DISTINCT FROM NEW.actor_user_id::text
  THEN
    RAISE EXCEPTION 'TRUSTED_PROOF_RPC_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order
  FROM public.wos_production_orders
  WHERE id = NEW.order_id AND organization_id = NEW.organization_id;
  IF NOT FOUND OR v_order.order_number NOT LIKE 'QA-NONPROD-%' THEN
    RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_AUTHORIZED' USING ERRCODE = '23514';
  END IF;
  IF v_order.workflow_status = 'DRAFT' THEN
    NULL;
  ELSIF v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
    AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
  THEN
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE user_id = NEW.actor_user_id
      AND is_active = true
      AND role IN ('admin', 'manager', 'sales')
      AND (auth.uid() IS NULL OR user_id = auth.uid())
    LIMIT 1;
    IF v_profile.id IS NULL
      OR v_profile.org_id <> v_order.organization_id
      OR (
        v_profile.role = 'sales'
        AND v_profile.id NOT IN (
          v_order.created_by_profile_id,
          v_order.sales_owner_profile_id
        )
      )
      OR NOT public.wos_qa_revision_gate_allows(
        v_order.id, v_order.organization_id, v_profile.id
      )
    THEN
      RAISE EXCEPTION 'QA_REVISION_PROOF_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_EDITABLE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_obj
  FROM storage.objects
  WHERE id = NEW.storage_object_id
    AND name = NEW.storage_path
    AND bucket_id = 'wos-private'
    AND is_delete_marker = false
    AND archived_at IS NULL;
  IF NOT FOUND
    OR v_obj.version IS DISTINCT FROM NEW.storage_object_version
    OR v_obj.updated_at IS DISTINCT FROM NEW.storage_object_updated_at
    OR v_obj.owner_id IS DISTINCT FROM NEW.actor_user_id::text
  THEN
    RAISE EXCEPTION 'QA_PROOF_OBJECT_CHANGED' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.wos_qa_orphan_cleanup_claims claim
    WHERE claim.storage_object_id = v_obj.id
      AND claim.state = 'CLAIMED'
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$rc04_proof_guard$;
REVOKE ALL ON FUNCTION public.wos_qa_proof_write_guard()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_proof_write_guard()
TO service_role;

DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard
  ON public.wos_qa_verified_image_proofs;
CREATE TRIGGER wos_qa_trusted_proof_guard
BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION public.wos_qa_proof_write_guard();

CREATE FUNCTION wos_v1_rc03_compat.mirror_verified_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $mirror_verified_proof$
DECLARE
  v_previous_mirror text;
  v_previous_rpc text;
  v_previous_actor text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'RC03_PROOF_MIRROR_UPDATE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.wos_qa_verified_image_proofs proof
    WHERE proof.image_id = NEW.image_id
  ) THEN
    RAISE EXCEPTION 'RC03_PROOF_MIRROR_WOULD_REPLACE_HISTORY'
      USING ERRCODE = '23505';
  END IF;

  v_previous_mirror := COALESCE(
    pg_catalog.current_setting('wos.v1.rc03_proof_mirror', true), ''
  );
  v_previous_rpc := COALESCE(
    pg_catalog.current_setting('wos.qa.trusted_proof_rpc', true), ''
  );
  v_previous_actor := COALESCE(
    pg_catalog.current_setting('wos.qa.actor_user_id', true), ''
  );
  PERFORM pg_catalog.set_config('wos.v1.rc03_proof_mirror', '1', true);
  PERFORM pg_catalog.set_config('wos.qa.trusted_proof_rpc', '1', true);
  PERFORM pg_catalog.set_config(
    'wos.qa.actor_user_id', NEW.actor_user_id::text, true
  );
  BEGIN
    INSERT INTO public.wos_qa_verified_image_proofs(
      image_id, organization_id, order_id, actor_user_id,
      storage_bucket, storage_path, storage_object_id,
      storage_object_version, storage_object_updated_at,
      verified_sha256, verified_at, expires_at
    ) VALUES (
      NEW.image_id, NEW.organization_id, NEW.order_id, NEW.actor_user_id,
      NEW.storage_bucket, NEW.storage_path, NEW.storage_object_id,
      NEW.storage_object_version, NEW.storage_object_updated_at,
      NEW.verified_sha256, NEW.verified_at, NEW.expires_at
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'wos.v1.rc03_proof_mirror', v_previous_mirror, true
    );
    PERFORM pg_catalog.set_config(
      'wos.qa.trusted_proof_rpc', v_previous_rpc, true
    );
    PERFORM pg_catalog.set_config(
      'wos.qa.actor_user_id', v_previous_actor, true
    );
    RAISE;
  END;
  PERFORM pg_catalog.set_config(
    'wos.v1.rc03_proof_mirror', v_previous_mirror, true
  );
  PERFORM pg_catalog.set_config(
    'wos.qa.trusted_proof_rpc', v_previous_rpc, true
  );
  PERFORM pg_catalog.set_config(
    'wos.qa.actor_user_id', v_previous_actor, true
  );
  RETURN NEW;
END;
$mirror_verified_proof$;
REVOKE ALL ON FUNCTION wos_v1_rc03_compat.mirror_verified_proof()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rc03_mirror_verified_proof
AFTER INSERT ON public.wos_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION wos_v1_rc03_compat.mirror_verified_proof();

DO $rc03_compat_postflight$
BEGIN
  IF (
    SELECT count(*) FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'wos\_%' ESCAPE '\'
  ) <> 2 THEN
    RAISE EXCEPTION 'RC03_COMPAT_POLICY_COUNT_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'wos-private'
      AND allowed_mime_types = ARRAY['image/png']
  ) THEN
    RAISE EXCEPTION 'RC03_COMPAT_BUCKET_NOT_PNG_ONLY';
  END IF;
  IF pg_catalog.has_table_privilege(
    'authenticated',
    'public.wos_production_orders',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'RC03_COMPAT_ORDER_INSERT_STILL_GRANTED';
  END IF;
END;
$rc03_compat_postflight$;

COMMIT;

-- QA ONLY / NOT INSTALLED / NOT AUTHORIZED
