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
  THEN
    RAISE EXCEPTION 'RC03_COMPAT_PREREQUISITE_MISSING';
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
REVOKE ALL ON wos_v1_rc03_compat.storage_policy_backup,
  wos_v1_rc03_compat.bucket_backup,
  wos_v1_rc03_compat.table_acl_backup,
  wos_v1_rc03_compat.historical_rows
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
      AND (p.role IN ('admin','manager')
        OR (p.role='sales' AND (p.id=o.created_by_profile_id OR p.id=o.sales_owner_profile_id))
        OR (p.role='operator' AND o.workflow_status IN (
          'SUBMITTED','WORKSHOP_REVIEW','WAITING_MATERIAL'
        )))
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

CREATE FUNCTION wos_v1_rc03_compat.mirror_verified_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $mirror_verified_proof$
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
  )
  ON CONFLICT(image_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      order_id = EXCLUDED.order_id,
      actor_user_id = EXCLUDED.actor_user_id,
      storage_bucket = EXCLUDED.storage_bucket,
      storage_path = EXCLUDED.storage_path,
      storage_object_id = EXCLUDED.storage_object_id,
      storage_object_version = EXCLUDED.storage_object_version,
      storage_object_updated_at = EXCLUDED.storage_object_updated_at,
      verified_sha256 = EXCLUDED.verified_sha256,
      verified_at = EXCLUDED.verified_at,
      expires_at = EXCLUDED.expires_at;
  RETURN NEW;
END;
$mirror_verified_proof$;
REVOKE ALL ON FUNCTION wos_v1_rc03_compat.mirror_verified_proof()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rc03_mirror_verified_proof
AFTER INSERT OR UPDATE ON public.wos_verified_image_proofs
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
