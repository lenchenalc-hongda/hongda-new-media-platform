-- WOS V1 PRODUCTION RUNTIME FORWARD DRAFT
-- INSTALL_NOT_AUTHORIZED
--
-- Apply only after the reviewed Production schema bootstrap, WOS Foundation
-- and production-compatible P7 candidate. This file does not grant any RPC
-- to anon/authenticated. A separate exact-SQL activation is required.
--
-- The explicit GUC protects against accidental Production execution:
--   SET LOCAL wos_v1.production_migration_authorized = 'yes';

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_prod_bootstrap_ci'
    AND current_setting('wos_v1.production_migration_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_MIGRATION_NOT_AUTHORIZED';
  END IF;
  IF to_regclass('public.wos_order_create_receipts') IS NOT NULL
    OR to_regclass('public.wos_operator_action_receipts') IS NOT NULL
    OR to_regclass('public.wos_office_revisions') IS NOT NULL
    OR to_regclass('public.wos_operator_review_receipts') IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_ALREADY_PARTIALLY_INSTALLED';
  END IF;
  IF to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.wos_sampling_requests') IS NULL
    OR to_regclass('public.wos_resource_readiness') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
    OR to_regclass('public.wos_visual_baselines') IS NULL
    OR to_regclass('public.wos_visual_baseline_items') IS NULL
    OR to_regclass('public.wos_blockers') IS NULL
    OR to_regclass('public.wos_confirmations') IS NULL
    OR to_regclass('public.wos_sampling_technical_records') IS NULL
    OR to_regclass('public.wos_status_history') IS NULL
    OR to_regclass('public.wos_office_readiness_receipts') IS NULL
    OR to_regclass('public.wos_submission_receipts') IS NULL
    OR to_regclass('public.wos_workshop_inbox') IS NULL
    OR to_regclass('public.wos_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_orphan_cleanup_claims') IS NULL
    OR to_regclass('public.organizations') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.cpc_customer_references') IS NULL
    OR to_regclass('public.cpc_projects') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR to_regclass('storage.buckets') IS NULL
    OR to_regprocedure(
      'public.wos_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure('public.wos_submit_production_order(uuid,integer,text,uuid)')
      IS NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_P7_PREREQUISITE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'wos-private'
      AND name = 'wos-private'
      AND public = false
      AND file_size_limit = 20971520
      AND allowed_mime_types = ARRAY['image/png']
  ) THEN
    RAISE EXCEPTION 'WOS_V1_PRIVATE_BUCKET_MISSING_OR_MISMATCHED';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
  ) <> 2
    OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'wos_p8_private_insert'
      AND policy.cmd = 'INSERT'
      AND policy.permissive = 'PERMISSIVE'
      AND policy.roles = ARRAY['authenticated']::name[]
      AND md5(COALESCE(policy.with_check, ''))
        = '4178cd6c4759bd9d0ad33560415f6bc8'
      AND md5(COALESCE(policy.qual, ''))
        = 'd41d8cd98f00b204e9800998ecf8427e'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname = 'wos_p8_private_select'
      AND policy.cmd = 'SELECT'
      AND policy.permissive = 'PERMISSIVE'
      AND policy.roles = ARRAY['authenticated']::name[]
      AND md5(COALESCE(policy.with_check, ''))
        = 'd41d8cd98f00b204e9800998ecf8427e'
      AND md5(COALESCE(policy.qual, ''))
        = '365f79545fe118582bc24a32ccc15f57'
  ) THEN
    RAISE EXCEPTION 'WOS_V1_PRIVATE_STORAGE_RLS_MISMATCH';
  END IF;
  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'UPDATE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_reference_images',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_reference_images',
      'UPDATE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_reference_images',
      'DELETE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'wos_production_orders',
          'wos_sampling_requests',
          'wos_reference_images'
        )
        AND policyname IN (
          'wos_production_orders_insert_draft_same_org',
          'wos_sampling_requests_insert_draft_same_org',
          'wos_reference_images_insert_same_org'
        )
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_FOUNDATION_CONTAINMENT_REQUIRED';
  END IF;
END;
$guard$;

-- Preserve the exact P7 functions under private backup names so rollback can
-- restore definitions and ACLs without reconstructing either from memory.
ALTER FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) RENAME TO wos_v1_pre_runtime_confirm_office_completeness;
ALTER FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) RENAME TO wos_v1_pre_runtime_submit_production_order;
ALTER FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) RENAME TO wos_v1_pre_runtime_record_trusted_image_proof;

CREATE TABLE public.wos_order_create_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.wos_operator_action_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action IN ('ACCEPT', 'RETURN_FOR_INFORMATION')),
  expected_version integer NOT NULL CHECK (expected_version > 0),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (order_id, action, expected_version)
);

CREATE TABLE public.wos_office_revisions (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action IN ('SAVE_CORRECTION', 'RESUBMIT_CORRECTION')),
  expected_version integer NOT NULL CHECK (expected_version > 0),
  new_version integer NOT NULL CHECK (new_version = expected_version + 1),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL,
  patch jsonb NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (order_id, new_version)
);

CREATE TABLE public.wos_operator_review_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  office_revision_request_id uuid NOT NULL
    REFERENCES public.wos_office_revisions(request_id),
  expected_version integer NOT NULL CHECK (expected_version > 0),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (order_id, expected_version)
);

CREATE INDEX wos_operator_action_receipts_history_idx
  ON public.wos_operator_action_receipts
  (organization_id, order_id, created_at DESC);
CREATE INDEX wos_office_revisions_history_idx
  ON public.wos_office_revisions
  (organization_id, order_id, created_at DESC);
CREATE INDEX wos_operator_review_receipts_history_idx
  ON public.wos_operator_review_receipts
  (organization_id, order_id, created_at DESC);

ALTER TABLE public.wos_order_create_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_operator_action_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_office_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_operator_review_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.wos_order_create_receipts,
  public.wos_operator_action_receipts,
  public.wos_office_revisions,
  public.wos_operator_review_receipts
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.wos_v1_assert_current_image_set(
  p_order_id uuid,
  p_organization_id uuid,
  p_version_label text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $image_set$
DECLARE
  v_image_count integer;
  v_distinct_categories integer;
  v_categories text[];
  v_required_categories constant text[] := ARRAY[
    'PRODUCT', 'FILM_PATTERN', 'CUSTOMER_APPROVED_SAMPLE', 'SIGNED_SAMPLE'
  ];
BEGIN
  SELECT
    count(*)::integer,
    count(DISTINCT image.category)::integer,
    array_agg(image.category ORDER BY image.category)
  INTO v_image_count, v_distinct_categories, v_categories
  FROM public.wos_reference_images image
  WHERE image.organization_id = p_organization_id
    AND image.entity_type = 'PRODUCTION_ORDER'
    AND image.entity_id = p_order_id
    AND image.version_label = p_version_label
    AND image.image_status = 'READY'
    AND image.superseded_at IS NULL
    AND image.storage_bucket = 'wos-private'
    AND image.storage_path = (
      'organizations/' || image.organization_id::text
      || '/wos/production-order/' || image.entity_id::text
      || '/images/' || replace(lower(image.category), '_', '-')
      || '/versions/' || image.version_label || '/' || image.id::text || '/'
      || substring(image.storage_path FROM '[^/]+$')
    )
    AND substring(image.storage_path FROM '[^/]+$')
      ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.](png|jpg|jpeg|webp)$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.wos_reference_images newer
      WHERE newer.supersedes_image_id = image.id
        AND newer.image_status = 'READY'
    );

  IF v_image_count <> 4
    OR v_distinct_categories <> 4
    OR v_categories IS DISTINCT FROM (
      SELECT array_agg(category ORDER BY category)
      FROM unnest(v_required_categories) category
    )
  THEN
    RAISE EXCEPTION 'TRUSTED_FOUR_IMAGE_SET_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wos_reference_images image
    WHERE image.organization_id = p_organization_id
      AND image.entity_type = 'PRODUCTION_ORDER'
      AND image.entity_id = p_order_id
      AND image.version_label = p_version_label
      AND image.image_status = 'READY'
      AND image.superseded_at IS NULL
      AND image.storage_bucket = 'wos-private'
      AND NOT EXISTS (
        SELECT 1
        FROM public.wos_verified_image_proofs proof
        JOIN storage.objects object
          ON object.id = proof.storage_object_id
          AND object.bucket_id = proof.storage_bucket
          AND object.name = proof.storage_path
          AND object.version IS NOT DISTINCT FROM proof.storage_object_version
          AND object.updated_at IS NOT DISTINCT FROM proof.storage_object_updated_at
          AND object.is_delete_marker IS DISTINCT FROM true
          AND object.archived_at IS NULL
        WHERE proof.image_id = image.id
          AND proof.organization_id = image.organization_id
          AND proof.order_id = image.entity_id
          AND proof.storage_path = image.storage_path
          AND proof.expires_at > clock_timestamp()
          AND object.metadata->>'mimetype' = 'image/png'
          AND COALESCE(object.metadata->>'size', '') ~ '^[0-9]+$'
          AND (object.metadata->>'size')::bigint BETWEEN 60 AND 20971520
      )
  ) THEN
    RAISE EXCEPTION 'TRUSTED_PNG_PROOF_REQUIRED' USING ERRCODE = '23514';
  END IF;
END;
$image_set$;

REVOKE ALL ON FUNCTION public.wos_v1_assert_current_image_set(
  uuid,uuid,text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.wos_p7_record_trusted_image_proof(
  p_image_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_storage_object_updated_at timestamptz,
  p_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $trusted_proof$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_old public.wos_verified_image_proofs%ROWTYPE;
  v_category_slug text;
  v_prefix text;
  v_size bigint;
  v_proof_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true)
      IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_image_id IS NULL
    OR p_order_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_storage_object_id IS NULL
    OR p_storage_object_updated_at IS NULL
    OR p_storage_path IS NULL
    OR length(p_storage_path) > 600
    OR p_storage_object_version IS NULL
    OR length(btrim(p_storage_object_version)) = 0
    OR p_sha256 !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'INVALID_PROOF_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = p_actor_user_id
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROOF_ACTOR_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')
    OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'PROOF_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  v_category_slug := substring(
    p_storage_path
    FROM '/images/([a-z-]+)/versions/'
  );
  IF v_category_slug NOT IN (
    'product', 'film-pattern', 'customer-approved-sample', 'signed-sample'
  ) THEN
    RAISE EXCEPTION 'PROOF_CATEGORY_PATH_INVALID' USING ERRCODE = '23514';
  END IF;
  v_prefix := 'organizations/' || v_actor.org_id::text
    || '/wos/production-order/' || p_order_id::text
    || '/images/' || v_category_slug || '/versions/'
    || v_order.version_label || '/' || p_image_id::text || '/';
  IF left(p_storage_path, length(v_prefix)) <> v_prefix
    OR (storage.filename(p_storage_path)
      !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$')
    OR position('..' IN storage.filename(p_storage_path)) > 0
  THEN
    RAISE EXCEPTION 'PROOF_IMAGE_PATH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects object
  WHERE object.bucket_id = 'wos-private'
    AND object.name = p_storage_path
    AND object.id = p_storage_object_id
    AND object.owner_id = p_actor_user_id::text
    AND object.is_delete_marker = false
    AND object.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND
    OR v_object.updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_object.version IS DISTINCT FROM p_storage_object_version
    OR v_object.metadata->>'mimetype' <> 'image/png'
    OR COALESCE(v_object.metadata->>'size', '') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_NOT_TRUSTED' USING ERRCODE = '23514';
  END IF;
  v_size := (v_object.metadata->>'size')::bigint;
  IF v_size < 60 OR v_size > 20971520 THEN
    RAISE EXCEPTION 'PRIVATE_BINARY_SIZE_OUT_OF_RANGE' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wos_orphan_cleanup_claims claim
    WHERE claim.storage_object_id = p_storage_object_id
      AND claim.state = 'CLAIMED'
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'OBJECT_CLEANUP_LEASE_ACTIVE' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.wos_verified_image_proofs (
    image_id, organization_id, order_id, actor_user_id, storage_bucket,
    storage_path, storage_object_id, storage_object_version,
    storage_object_updated_at, verified_sha256, verified_at, expires_at
  ) VALUES (
    p_image_id, v_actor.org_id, p_order_id, p_actor_user_id, 'wos-private',
    p_storage_path, p_storage_object_id, p_storage_object_version,
    p_storage_object_updated_at, p_sha256,
    clock_timestamp(), clock_timestamp() + interval '10 minutes'
  )
  ON CONFLICT (image_id) DO NOTHING
  RETURNING image_id INTO v_proof_id;

  IF v_proof_id IS NULL THEN
    SELECT * INTO v_old
    FROM public.wos_verified_image_proofs proof
    WHERE proof.image_id = p_image_id;
    IF NOT FOUND
      OR v_old.organization_id <> v_actor.org_id
      OR v_old.order_id <> p_order_id
      OR v_old.actor_user_id <> p_actor_user_id
      OR v_old.storage_path <> p_storage_path
      OR v_old.storage_object_id <> p_storage_object_id
      OR v_old.storage_object_version IS DISTINCT FROM p_storage_object_version
      OR v_old.storage_object_updated_at IS DISTINCT FROM p_storage_object_updated_at
      OR v_old.verified_sha256 <> p_sha256
      OR v_old.expires_at <= clock_timestamp()
    THEN
      RAISE EXCEPTION 'IMAGE_ID_ATTESTATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'VERIFIED',
    'imageId', p_image_id,
    'category', replace(v_category_slug, '-', '_'),
    'sha256', p_sha256
  );
END;
$trusted_proof$;

REVOKE ALL ON FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) TO service_role;

CREATE FUNCTION public.wos_confirm_office_completeness(
  p_order_id uuid,
  p_expected_revision integer,
  p_expected_label text,
  p_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $confirm$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_receipt_id uuid;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 1
    OR p_expected_label !~ '^V[1-9][0-9]{0,20}$'
    OR p_note IS NULL
    OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_order.workflow_status <> 'DRAFT'
    OR v_order.version <> p_expected_revision
    OR v_order.version_label <> p_expected_label
  THEN
    RAISE EXCEPTION 'STALE_OR_UNEDITABLE_ORDER' USING ERRCODE = 'PT409';
  END IF;

  PERFORM public.wos_v1_assert_current_image_set(
    p_order_id, v_actor.org_id, p_expected_label
  );

  INSERT INTO public.wos_office_readiness_receipts (
    organization_id, order_id, source_revision, source_version_label,
    actor_profile_id, note
  ) VALUES (
    v_actor.org_id, p_order_id, p_expected_revision, p_expected_label,
    v_actor.id, btrim(p_note)
  )
  ON CONFLICT (order_id, source_revision) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    SELECT receipt.id INTO v_receipt_id
    FROM public.wos_office_readiness_receipts receipt
    WHERE receipt.order_id = p_order_id
      AND receipt.source_revision = p_expected_revision
      AND receipt.organization_id = v_actor.org_id
      AND receipt.source_version_label = p_expected_label
      AND receipt.actor_profile_id = v_actor.id
      AND receipt.note = btrim(p_note);
    IF v_receipt_id IS NULL THEN
      RAISE EXCEPTION 'READINESS_ALREADY_CONFIRMED_DIFFERENTLY'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN v_receipt_id;
END;
$confirm$;

CREATE FUNCTION public.wos_submit_production_order(
  p_order_id uuid,
  p_expected_revision integer,
  p_expected_label text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $submit$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_receipt public.wos_submission_receipts%ROWTYPE;
  v_inbox_id uuid;
  v_readiness uuid;
  v_fingerprint text;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 1
    OR p_expected_label !~ '^V[1-9][0-9]{0,20}$'
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'version', p_expected_revision,
    'versionLabel', p_expected_label
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-submit:' || p_idempotency_key::text, 0)
  );
  SELECT * INTO v_receipt
  FROM public.wos_submission_receipts receipt
  WHERE receipt.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_receipt.organization_id <> v_actor.org_id
      OR v_receipt.actor_profile_id <> v_actor.id
      OR v_receipt.order_id <> p_order_id
      OR v_receipt.source_revision <> p_expected_revision
      OR v_receipt.source_version_label <> p_expected_label
      OR v_receipt.request_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT inbox.id INTO v_inbox_id
    FROM public.wos_workshop_inbox inbox
    WHERE inbox.submission_id = v_receipt.id;
    IF v_inbox_id IS NULL THEN
      RAISE EXCEPTION 'INCOMPLETE_RECEIPT' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'status', 'REPLAYED',
      'orderId', p_order_id,
      'receiptId', v_receipt.id,
      'inboxTaskId', v_inbox_id,
      'sourceRevision', v_receipt.source_revision,
      'submittedAt', v_receipt.created_at,
      'canStart', false
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.organization_id <> v_actor.org_id
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_order.workflow_status <> 'DRAFT'
    OR v_order.version <> p_expected_revision
    OR v_order.version_label <> p_expected_label
  THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  SELECT receipt.id INTO v_readiness
  FROM public.wos_office_readiness_receipts receipt
  WHERE receipt.organization_id = v_actor.org_id
    AND receipt.order_id = p_order_id
    AND receipt.source_revision = p_expected_revision
    AND receipt.source_version_label = p_expected_label;
  IF v_readiness IS NULL THEN
    RAISE EXCEPTION 'OFFICE_READINESS_REQUIRED' USING ERRCODE = '23514';
  END IF;
  PERFORM public.wos_v1_assert_current_image_set(
    p_order_id, v_actor.org_id, p_expected_label
  );

  IF EXISTS (
    SELECT 1
    FROM public.wos_orphan_cleanup_claims claim
    WHERE claim.order_id = p_order_id
      AND claim.state = 'CLAIMED'
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.wos_submission_receipts (
    organization_id, order_id, source_revision, source_version_label,
    idempotency_key, actor_profile_id, request_fingerprint
  ) VALUES (
    v_actor.org_id, p_order_id, p_expected_revision, p_expected_label,
    p_idempotency_key, v_actor.id, v_fingerprint
  ) RETURNING * INTO v_receipt;

  UPDATE public.wos_production_orders
  SET workflow_status = 'SUBMITTED',
      submitted_at = v_receipt.created_at,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE id = p_order_id
    AND organization_id = v_actor.org_id
    AND version = p_expected_revision
    AND workflow_status = 'DRAFT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONCURRENT_VERSION_CHANGE' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.wos_workshop_inbox (
    organization_id, order_id, submission_id, source_revision, source_version_label
  ) VALUES (
    v_actor.org_id, p_order_id, v_receipt.id, p_expected_revision, p_expected_label
  ) RETURNING id INTO v_inbox_id;

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', p_order_id, 'DRAFT', 'SUBMITTED',
    v_actor.id, v_actor.role, 'OFFICE_SUBMISSION_COMMITTED',
    jsonb_build_object(
      'readinessId', v_readiness,
      'receiptId', v_receipt.id,
      'inboxTaskId', v_inbox_id,
      'sourceRevision', p_expected_revision,
      'idempotencyKey', p_idempotency_key,
      'canStart', false
    )
  );

  RETURN jsonb_build_object(
    'status', 'CREATED',
    'orderId', p_order_id,
    'receiptId', v_receipt.id,
    'inboxTaskId', v_inbox_id,
    'sourceRevision', p_expected_revision,
    'submittedAt', v_receipt.created_at,
    'canStart', false
  );
END;
$submit$;

CREATE FUNCTION public.wos_create_production_order(
  p_request_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $create_order$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_profile_count integer;
  v_prior public.wos_order_create_receipts%ROWTYPE;
  v_fingerprint text;
  v_order public.wos_production_orders%ROWTYPE;
  v_allowed_keys constant text[] := ARRAY[
    'orderNumber', 'customerId', 'customerNameSnapshot', 'projectId',
    'projectNameSnapshot', 'productName', 'salesOwnerProfileId',
    'projectOwnerProfileId', 'priority', 'isUrgent', 'requestedQuantity',
    'currentBatchQuantity', 'plannedShipDate', 'splitDelivery',
    'productMaterial', 'surfaceTreatment', 'patternScope', 'seamTolerance',
    'positionReference', 'customerAcceptanceStandard', 'packagingMethod',
    'cartonQuantity', 'labelMarkingRule'
  ];
  v_key text;
  v_sales_owner uuid;
  v_project_owner uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_requested_quantity integer;
  v_batch_quantity integer;
  v_carton_quantity integer;
  v_planned_ship_date date;
  v_owner_count integer;
BEGIN
  IF auth.uid() IS NULL
    OR p_request_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 16384
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_profile_count
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');

  FOR v_key IN SELECT jsonb_object_keys(p_payload)
  LOOP
    IF NOT (v_key = ANY (v_allowed_keys)) THEN
      RAISE EXCEPTION 'FIELD_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF length(btrim(COALESCE(p_payload->>'orderNumber', ''))) NOT BETWEEN 1 AND 80
    OR length(btrim(COALESCE(p_payload->>'customerNameSnapshot', '')))
      NOT BETWEEN 1 AND 300
    OR length(btrim(COALESCE(p_payload->>'productName', '')))
      NOT BETWEEN 1 AND 300
    OR length(btrim(COALESCE(p_payload->>'productMaterial', '')))
      NOT BETWEEN 1 AND 200
    OR (p_payload->>'salesOwnerProfileId') !~* '^[0-9a-f-]{36}$'
    OR (p_payload->>'projectOwnerProfileId') !~* '^[0-9a-f-]{36}$'
    OR (p_payload->>'priority') NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    OR (p_payload->>'requestedQuantity') !~ '^[1-9][0-9]{0,9}$'
    OR (p_payload->>'currentBatchQuantity') !~ '^[1-9][0-9]{0,9}$'
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'splitDelivery'
    AND p_payload->'splitDelivery' IS DISTINCT FROM 'false'::jsonb
  THEN
    RAISE EXCEPTION 'SPLIT_DELIVERY_NOT_SUPPORTED' USING ERRCODE = '22023';
  END IF;

  v_sales_owner := (p_payload->>'salesOwnerProfileId')::uuid;
  v_project_owner := (p_payload->>'projectOwnerProfileId')::uuid;
  v_customer_id := NULLIF(p_payload->>'customerId', '')::uuid;
  v_project_id := NULLIF(p_payload->>'projectId', '')::uuid;
  v_requested_quantity := (p_payload->>'requestedQuantity')::integer;
  v_batch_quantity := (p_payload->>'currentBatchQuantity')::integer;
  v_carton_quantity := CASE
    WHEN NULLIF(p_payload->>'cartonQuantity', '') IS NULL THEN NULL
    ELSE (p_payload->>'cartonQuantity')::integer
  END;
  v_planned_ship_date := CASE
    WHEN NULLIF(p_payload->>'plannedShipDate', '') IS NULL THEN NULL
    ELSE (p_payload->>'plannedShipDate')::date
  END;

  IF v_customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpc_customer_references customer
      WHERE customer.id = v_customer_id
        AND customer.org_id = v_actor.org_id
    )
  THEN
    RAISE EXCEPTION 'CUSTOMER_ORGANIZATION_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF v_project_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpc_projects project
      WHERE project.id = v_project_id
        AND project.org_id = v_actor.org_id
    )
  THEN
    RAISE EXCEPTION 'PROJECT_ORGANIZATION_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF v_customer_id IS NOT NULL
    AND v_project_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpc_projects project
      WHERE project.id = v_project_id
        AND project.org_id = v_actor.org_id
        AND project.customer_reference_id = v_customer_id
    )
  THEN
    RAISE EXCEPTION 'PROJECT_CUSTOMER_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_batch_quantity > v_requested_quantity
    OR (v_carton_quantity IS NOT NULL AND v_carton_quantity < 1)
  THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_owner_count
  FROM public.profiles owner_profile
  WHERE owner_profile.org_id = v_actor.org_id
    AND owner_profile.is_active = true
    AND owner_profile.id IN (v_sales_owner, v_project_owner);
  IF v_owner_count <> (CASE WHEN v_sales_owner = v_project_owner THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'INVALID_OWNER' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'sales' AND v_actor.id NOT IN (v_sales_owner, v_project_owner) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'requestId', p_request_id,
    'actorUserId', auth.uid(),
    'organizationId', v_actor.org_id,
    'payload', p_payload
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-create:' || p_request_id::text, 0)
  );
  SELECT * INTO v_prior
  FROM public.wos_order_create_receipts receipt
  WHERE receipt.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.organization_id <> v_actor.org_id
      OR v_prior.actor_profile_id <> v_actor.id
      OR v_prior.payload_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_prior.response_json ||
      jsonb_build_object('status', 'REPLAYED');
  END IF;

  INSERT INTO public.wos_production_orders (
    organization_id, customer_id, customer_name_snapshot, project_id,
    project_name_snapshot, order_number, product_name, sales_owner_profile_id,
    project_owner_profile_id, priority, is_urgent, version_label,
    workflow_status, requested_quantity, current_batch_quantity,
    planned_ship_date, split_delivery, product_material, surface_treatment,
    pattern_scope, seam_tolerance, position_reference,
    customer_acceptance_standard, packaging_method, carton_quantity,
    label_marking_rule, created_by_profile_id, version
  ) VALUES (
    v_actor.org_id, v_customer_id,
    btrim(p_payload->>'customerNameSnapshot'), v_project_id,
    NULLIF(btrim(p_payload->>'projectNameSnapshot'), ''),
    btrim(p_payload->>'orderNumber'), btrim(p_payload->>'productName'),
    v_sales_owner, v_project_owner, p_payload->>'priority',
    COALESCE((p_payload->>'isUrgent')::boolean, false), 'V1', 'DRAFT',
    v_requested_quantity, v_batch_quantity, v_planned_ship_date,
    COALESCE((p_payload->>'splitDelivery')::boolean, false),
    btrim(p_payload->>'productMaterial'),
    NULLIF(btrim(p_payload->>'surfaceTreatment'), ''),
    NULLIF(btrim(p_payload->>'patternScope'), ''),
    NULLIF(btrim(p_payload->>'seamTolerance'), ''),
    NULLIF(btrim(p_payload->>'positionReference'), ''),
    NULLIF(btrim(p_payload->>'customerAcceptanceStandard'), ''),
    NULLIF(btrim(p_payload->>'packagingMethod'), ''),
    v_carton_quantity,
    NULLIF(btrim(p_payload->>'labelMarkingRule'), ''),
    v_actor.id, 1
  ) RETURNING * INTO v_order;

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, note, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', v_order.id, NULL, 'DRAFT',
    v_actor.id, v_actor.role, 'V1_ORDER_CREATED',
    btrim(p_payload->>'orderNumber'),
    jsonb_build_object('requestId', p_request_id, 'version', 1, 'versionLabel', 'V1')
  );

  INSERT INTO public.wos_order_create_receipts (
    request_id, organization_id, order_id, actor_profile_id,
    payload_fingerprint, response_json
  ) VALUES (
    p_request_id, v_actor.org_id, v_order.id, v_actor.id,
    v_fingerprint,
    jsonb_build_object(
      'status', 'CREATED',
      'orderId', v_order.id,
      'requestId', p_request_id,
      'version', v_order.version,
      'versionLabel', v_order.version_label,
      'workflowStatus', v_order.workflow_status
    )
  );

  RETURN (
    SELECT response_json
    FROM public.wos_order_create_receipts
    WHERE request_id = p_request_id
  );
END;
$create_order$;

CREATE FUNCTION public.wos_operator_order_action(
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_action text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $operator$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_profile_count integer;
  v_order public.wos_production_orders%ROWTYPE;
  v_prior public.wos_operator_action_receipts%ROWTYPE;
  v_fingerprint text;
  v_next_status text;
  v_row_count integer;
  v_response jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_order_id IS NULL
    OR p_request_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 2
    OR p_action NOT IN ('ACCEPT', 'RETURN_FOR_INFORMATION')
    OR p_reason IS NULL
    OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_profile_count
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'operator');
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'operator');

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'expectedVersion', p_expected_version,
    'requestId', p_request_id,
    'action', p_action,
    'reason', btrim(p_reason)
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prior
  FROM public.wos_operator_action_receipts receipt
  WHERE receipt.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.organization_id <> v_actor.org_id
      OR v_prior.order_id <> p_order_id
      OR v_prior.actor_profile_id <> v_actor.id
      OR v_prior.action <> p_action
      OR v_prior.expected_version <> p_expected_version
      OR v_prior.payload_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_prior.response_json ||
      jsonb_build_object('status', 'REPLAYED');
  END IF;

  IF v_order.version <> p_expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_workshop_inbox inbox
    JOIN public.wos_submission_receipts receipt
      ON receipt.id = inbox.submission_id
    WHERE inbox.order_id = p_order_id
      AND inbox.organization_id = v_actor.org_id
      AND receipt.order_id = p_order_id
      AND receipt.organization_id = v_actor.org_id
      AND inbox.workflow_status = 'SUBMITTED'
      AND receipt.source_revision = inbox.source_revision
      AND receipt.source_version_label = inbox.source_version_label
      AND (
        (
          v_order.workflow_status = 'SUBMITTED'
          AND inbox.source_revision + 1 = v_order.version
          AND inbox.source_version_label = v_order.version_label
        )
        OR (
          v_order.workflow_status <> 'SUBMITTED'
          AND inbox.source_revision + 1 < v_order.version
        )
      )
  ) THEN
    RAISE EXCEPTION 'SOURCE_RECEIPT_MISMATCH' USING ERRCODE = 'PT409';
  END IF;

  IF p_action = 'ACCEPT' THEN
    IF v_order.workflow_status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT409';
    END IF;
    v_next_status := 'WORKSHOP_REVIEW';
  ELSE
    IF v_order.workflow_status NOT IN ('SUBMITTED', 'WORKSHOP_REVIEW') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT409';
    END IF;
    v_next_status := 'NEEDS_INFORMATION';
  END IF;

  UPDATE public.wos_production_orders
  SET workflow_status = v_next_status,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE id = p_order_id
    AND organization_id = v_actor.org_id
    AND version = p_expected_version
    AND workflow_status = v_order.workflow_status;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF p_action = 'RETURN_FOR_INFORMATION' THEN
    INSERT INTO public.wos_blockers (
      organization_id, entity_type, entity_id, blocker_code, blocker_category,
      description, status, opened_by_profile_id
    ) VALUES (
      v_actor.org_id, 'PRODUCTION_ORDER', p_order_id,
      'P2_DOCUMENTS_INCOMPLETE', 'DOCUMENT', btrim(p_reason), 'OPEN', v_actor.id
    );
  END IF;

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, note, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', p_order_id,
    v_order.workflow_status, v_next_status, v_actor.id, v_actor.role,
    'P2_OPERATOR_' || p_action, btrim(p_reason),
    jsonb_build_object(
      'requestId', p_request_id,
      'expectedVersion', p_expected_version,
      'newVersion', p_expected_version + 1,
      'versionLabel', v_order.version_label
    )
  );

  v_response := jsonb_build_object(
    'status', 'APPLIED',
    'orderId', p_order_id,
    'requestId', p_request_id,
    'expectedVersion', p_expected_version,
    'version', p_expected_version + 1,
    'versionLabel', v_order.version_label,
    'workflowStatus', v_next_status,
    'canStart', false
  );
  INSERT INTO public.wos_operator_action_receipts (
    request_id, organization_id, order_id, actor_profile_id, action,
    expected_version, payload_fingerprint, response_json
  ) VALUES (
    p_request_id, v_actor.org_id, p_order_id, v_actor.id, p_action,
    p_expected_version, v_fingerprint, v_response
  );
  RETURN v_response;
END;
$operator$;

CREATE FUNCTION public.wos_office_save_correction(
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_patch jsonb,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $save_correction$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_profile_count integer;
  v_order public.wos_production_orders%ROWTYPE;
  v_prior public.wos_office_revisions%ROWTYPE;
  v_fingerprint text;
  v_key text;
  v_requested_quantity integer;
  v_batch_quantity integer;
  v_revision_number integer;
  v_next_label text;
  v_after public.wos_production_orders%ROWTYPE;
  v_response jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_order_id IS NULL
    OR p_request_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 3
    OR p_patch IS NULL
    OR jsonb_typeof(p_patch) <> 'object'
    OR p_patch = '{}'::jsonb
    OR octet_length(p_patch::text) > 4096
    OR p_reason IS NULL
    OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_profile_count
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN (
      'productName', 'productMaterial', 'requestedQuantity',
      'currentBatchQuantity', 'customerAcceptanceStandard', 'positionReference'
    ) THEN
      RAISE EXCEPTION 'FIELD_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_patch->v_key) = 'null' THEN
      RAISE EXCEPTION 'NULL_FIELD_DENIED' USING ERRCODE = '22023';
    END IF;
    IF v_key IN ('requestedQuantity', 'currentBatchQuantity') THEN
      IF jsonb_typeof(p_patch->v_key) <> 'number'
        OR (p_patch->>v_key) !~ '^[1-9][0-9]{0,9}$'
      THEN
        RAISE EXCEPTION 'POSITIVE_INTEGER_REQUIRED' USING ERRCODE = '22023';
      END IF;
    ELSIF jsonb_typeof(p_patch->v_key) <> 'string'
      OR length(btrim(p_patch->>v_key)) NOT BETWEEN 1 AND 2000
    THEN
      RAISE EXCEPTION 'TEXT_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'expectedVersion', p_expected_version,
    'requestId', p_request_id,
    'action', 'SAVE_CORRECTION',
    'patch', p_patch,
    'reason', btrim(p_reason)
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prior
  FROM public.wos_office_revisions revision
  WHERE revision.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.organization_id <> v_actor.org_id
      OR v_prior.order_id <> p_order_id
      OR v_prior.actor_profile_id <> v_actor.id
      OR v_prior.action <> 'SAVE_CORRECTION'
      OR v_prior.expected_version <> p_expected_version
      OR v_prior.payload_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_prior.response_json ||
      jsonb_build_object('status', 'REPLAYED');
  END IF;

  IF v_order.workflow_status <> 'NEEDS_INFORMATION'
    OR v_order.version <> p_expected_version
    OR NOT EXISTS (
      SELECT 1
      FROM public.wos_blockers blocker
      WHERE blocker.organization_id = v_actor.org_id
        AND blocker.entity_type = 'PRODUCTION_ORDER'
        AND blocker.entity_id = p_order_id
        AND blocker.blocker_code = 'P2_DOCUMENTS_INCOMPLETE'
        AND blocker.blocker_category = 'DOCUMENT'
        AND blocker.status = 'OPEN'
    )
  THEN
    RAISE EXCEPTION 'RETURN_OR_VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  v_requested_quantity := COALESCE(
    (p_patch->>'requestedQuantity')::integer,
    v_order.requested_quantity
  );
  v_batch_quantity := COALESCE(
    (p_patch->>'currentBatchQuantity')::integer,
    v_order.current_batch_quantity
  );
  IF v_batch_quantity > v_requested_quantity THEN
    RAISE EXCEPTION 'BATCH_EXCEEDS_ORDER' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer + 2 INTO v_revision_number
  FROM public.wos_office_revisions revision
  WHERE revision.order_id = p_order_id
    AND revision.organization_id = v_actor.org_id;
  v_next_label := 'V' || v_revision_number::text;

  UPDATE public.wos_production_orders
  SET product_name = CASE WHEN p_patch ? 'productName'
        THEN btrim(p_patch->>'productName') ELSE product_name END,
      product_material = CASE WHEN p_patch ? 'productMaterial'
        THEN btrim(p_patch->>'productMaterial') ELSE product_material END,
      requested_quantity = v_requested_quantity,
      current_batch_quantity = v_batch_quantity,
      customer_acceptance_standard = CASE
        WHEN p_patch ? 'customerAcceptanceStandard'
          THEN btrim(p_patch->>'customerAcceptanceStandard')
        ELSE customer_acceptance_standard END,
      position_reference = CASE WHEN p_patch ? 'positionReference'
        THEN btrim(p_patch->>'positionReference') ELSE position_reference END,
      version_label = v_next_label,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE id = p_order_id
    AND organization_id = v_actor.org_id
    AND version = p_expected_version
    AND workflow_status = 'NEEDS_INFORMATION'
  RETURNING * INTO v_after;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  v_response := jsonb_build_object(
    'status', 'SAVED',
    'orderId', p_order_id,
    'requestId', p_request_id,
    'version', v_after.version,
    'versionLabel', v_after.version_label,
    'workflowStatus', v_after.workflow_status,
    'canStart', false
  );

  INSERT INTO public.wos_office_revisions (
    request_id, organization_id, order_id, actor_profile_id, action,
    expected_version, new_version, payload_fingerprint, reason, patch,
    before_snapshot, after_snapshot, response_json
  ) VALUES (
    p_request_id, v_actor.org_id, p_order_id, v_actor.id, 'SAVE_CORRECTION',
    p_expected_version, v_after.version, v_fingerprint, btrim(p_reason), p_patch,
    jsonb_build_object(
      'version', v_order.version,
      'versionLabel', v_order.version_label,
      'productName', v_order.product_name,
      'productMaterial', v_order.product_material,
      'requestedQuantity', v_order.requested_quantity,
      'currentBatchQuantity', v_order.current_batch_quantity,
      'customerAcceptanceStandard', v_order.customer_acceptance_standard,
      'positionReference', v_order.position_reference
    ),
    jsonb_build_object(
      'version', v_after.version,
      'versionLabel', v_after.version_label,
      'productName', v_after.product_name,
      'productMaterial', v_after.product_material,
      'requestedQuantity', v_after.requested_quantity,
      'currentBatchQuantity', v_after.current_batch_quantity,
      'customerAcceptanceStandard', v_after.customer_acceptance_standard,
      'positionReference', v_after.position_reference
    ),
    v_response
  );

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, note, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', p_order_id,
    v_order.workflow_status, v_after.workflow_status,
    v_actor.id, v_actor.role, 'P2_OFFICE_SAVE_CORRECTION', btrim(p_reason),
    jsonb_build_object(
      'requestId', p_request_id,
      'expectedVersion', p_expected_version,
      'newVersion', v_after.version,
      'newVersionLabel', v_after.version_label,
      'fieldsChanged', p_patch
    )
  );
  RETURN v_response;
END;
$save_correction$;

CREATE FUNCTION public.wos_office_resubmit_order(
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $resubmit$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_profile_count integer;
  v_order public.wos_production_orders%ROWTYPE;
  v_prior public.wos_office_revisions%ROWTYPE;
  v_saved public.wos_office_revisions%ROWTYPE;
  v_fingerprint text;
  v_revision_number integer;
  v_next_label text;
  v_after public.wos_production_orders%ROWTYPE;
  v_response jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_order_id IS NULL
    OR p_request_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 3
    OR p_reason IS NULL
    OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_profile_count
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales');

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'expectedVersion', p_expected_version,
    'requestId', p_request_id,
    'action', 'RESUBMIT_CORRECTION',
    'reason', btrim(p_reason)
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prior
  FROM public.wos_office_revisions revision
  WHERE revision.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.organization_id <> v_actor.org_id
      OR v_prior.order_id <> p_order_id
      OR v_prior.actor_profile_id <> v_actor.id
      OR v_prior.action <> 'RESUBMIT_CORRECTION'
      OR v_prior.expected_version <> p_expected_version
      OR v_prior.payload_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_prior.response_json ||
      jsonb_build_object('status', 'REPLAYED');
  END IF;

  IF v_order.workflow_status <> 'NEEDS_INFORMATION'
    OR v_order.version <> p_expected_version
  THEN
    RAISE EXCEPTION 'RETURN_OR_VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_saved
  FROM public.wos_office_revisions revision
  WHERE revision.order_id = p_order_id
    AND revision.organization_id = v_actor.org_id
    AND revision.new_version = p_expected_version
    AND revision.action = 'SAVE_CORRECTION'
    AND revision.after_snapshot->>'versionLabel' = v_order.version_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAVED_CORRECTION_REQUIRED' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_blockers blocker
    WHERE blocker.organization_id = v_actor.org_id
      AND blocker.entity_type = 'PRODUCTION_ORDER'
      AND blocker.entity_id = p_order_id
      AND blocker.blocker_code = 'P2_DOCUMENTS_INCOMPLETE'
      AND blocker.blocker_category = 'DOCUMENT'
      AND blocker.status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_BLOCKER_MISSING' USING ERRCODE = 'PT409';
  END IF;

  SELECT count(*)::integer + 2 INTO v_revision_number
  FROM public.wos_office_revisions revision
  WHERE revision.order_id = p_order_id
    AND revision.organization_id = v_actor.org_id;
  v_next_label := 'V' || v_revision_number::text;

  UPDATE public.wos_production_orders
  SET workflow_status = 'WORKSHOP_REVIEW',
      version_label = v_next_label,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE id = p_order_id
    AND organization_id = v_actor.org_id
    AND version = p_expected_version
    AND workflow_status = 'NEEDS_INFORMATION'
  RETURNING * INTO v_after;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  v_response := jsonb_build_object(
    'status', 'RESUBMITTED',
    'orderId', p_order_id,
    'requestId', p_request_id,
    'version', v_after.version,
    'versionLabel', v_after.version_label,
    'workflowStatus', v_after.workflow_status,
    'canStart', false
  );

  INSERT INTO public.wos_office_revisions (
    request_id, organization_id, order_id, actor_profile_id, action,
    expected_version, new_version, payload_fingerprint, reason, patch,
    before_snapshot, after_snapshot, response_json
  ) VALUES (
    p_request_id, v_actor.org_id, p_order_id, v_actor.id, 'RESUBMIT_CORRECTION',
    p_expected_version, v_after.version, v_fingerprint, btrim(p_reason), '{}'::jsonb,
    jsonb_build_object(
      'version', v_order.version,
      'versionLabel', v_order.version_label
    ),
    jsonb_build_object(
      'version', v_after.version,
      'versionLabel', v_after.version_label,
      'savedRevisionRequestId', v_saved.request_id
    ),
    v_response
  );

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, note, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', p_order_id,
    v_order.workflow_status, v_after.workflow_status,
    v_actor.id, v_actor.role, 'P2_OFFICE_RESUBMIT_CORRECTION', btrim(p_reason),
    jsonb_build_object(
      'requestId', p_request_id,
      'expectedVersion', p_expected_version,
      'newVersion', v_after.version,
      'newVersionLabel', v_after.version_label,
      'savedRevisionRequestId', v_saved.request_id
    )
  );
  RETURN v_response;
END;
$resubmit$;

CREATE FUNCTION public.wos_operator_review_correction(
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $review$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_profile_count integer;
  v_order public.wos_production_orders%ROWTYPE;
  v_prior public.wos_operator_review_receipts%ROWTYPE;
  v_revision public.wos_office_revisions%ROWTYPE;
  v_fingerprint text;
  v_resolved integer;
  v_response jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_order_id IS NULL
    OR p_request_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 4
    OR p_note IS NULL
    OR length(btrim(p_note)) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_profile_count
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'operator');
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'operator');

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'expectedVersion', p_expected_version,
    'requestId', p_request_id,
    'action', 'REVIEW_CORRECTION',
    'note', btrim(p_note)
  )::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-order:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prior
  FROM public.wos_operator_review_receipts receipt
  WHERE receipt.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.organization_id <> v_actor.org_id
      OR v_prior.order_id <> p_order_id
      OR v_prior.actor_profile_id <> v_actor.id
      OR v_prior.expected_version <> p_expected_version
      OR v_prior.payload_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_prior.response_json ||
      jsonb_build_object('status', 'REPLAYED');
  END IF;

  IF v_order.workflow_status <> 'WORKSHOP_REVIEW'
    OR v_order.version <> p_expected_version
  THEN
    RAISE EXCEPTION 'REVISION_OR_VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO v_revision
  FROM public.wos_office_revisions revision
  WHERE revision.order_id = p_order_id
    AND revision.organization_id = v_actor.org_id
    AND revision.new_version = p_expected_version
    AND revision.action = 'RESUBMIT_CORRECTION'
    AND revision.after_snapshot->>'versionLabel' = v_order.version_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESUBMISSION_NOT_VERIFIED' USING ERRCODE = 'PT409';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_workshop_inbox inbox
    JOIN public.wos_submission_receipts receipt
      ON receipt.id = inbox.submission_id
    WHERE inbox.order_id = p_order_id
      AND inbox.organization_id = v_actor.org_id
      AND receipt.order_id = p_order_id
      AND receipt.organization_id = v_actor.org_id
      AND receipt.source_revision = inbox.source_revision
      AND receipt.source_version_label = inbox.source_version_label
      AND inbox.workflow_status = 'SUBMITTED'
      AND (
        (
          v_order.workflow_status = 'SUBMITTED'
          AND inbox.source_revision + 1 = v_order.version
          AND inbox.source_version_label = v_order.version_label
        )
        OR (
          v_order.workflow_status <> 'SUBMITTED'
          AND inbox.source_revision + 1 < v_order.version
        )
      )
  ) THEN
    RAISE EXCEPTION 'ORIGINAL_RECEIPT_MISSING' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.wos_blockers
  SET status = 'RESOLVED',
      resolved_by_profile_id = v_actor.id,
      resolved_at = clock_timestamp(),
      resolution_note = btrim(p_note)
  WHERE organization_id = v_actor.org_id
    AND entity_type = 'PRODUCTION_ORDER'
    AND entity_id = p_order_id
    AND blocker_code = 'P2_DOCUMENTS_INCOMPLETE'
    AND blocker_category = 'DOCUMENT'
    AND status = 'OPEN'
    AND opened_at <= v_revision.created_at;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  IF v_resolved < 1 THEN
    RAISE EXCEPTION 'DOCUMENT_BLOCKER_NOT_FOUND' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.wos_production_orders
  SET workflow_status = 'WAITING_MATERIAL',
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE id = p_order_id
    AND organization_id = v_actor.org_id
    AND workflow_status = 'WORKSHOP_REVIEW'
    AND version = p_expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  v_response := jsonb_build_object(
    'status', 'REVIEWED',
    'orderId', p_order_id,
    'requestId', p_request_id,
    'expectedVersion', p_expected_version,
    'version', p_expected_version + 1,
    'versionLabel', v_order.version_label,
    'workflowStatus', 'WAITING_MATERIAL',
    'resolvedBlockers', v_resolved,
    'canStart', false
  );

  INSERT INTO public.wos_status_history (
    organization_id, entity_type, entity_id, previous_status, next_status,
    actor_profile_id, actor_role, reason_code, note, metadata
  ) VALUES (
    v_actor.org_id, 'PRODUCTION_ORDER', p_order_id,
    'WORKSHOP_REVIEW', 'WAITING_MATERIAL',
    v_actor.id, v_actor.role, 'P2_OPERATOR_REVIEW_CORRECTION', btrim(p_note),
    jsonb_build_object(
      'requestId', p_request_id,
      'officeRevisionRequestId', v_revision.request_id,
      'versionLabel', v_order.version_label,
      'expectedVersion', p_expected_version,
      'newVersion', p_expected_version + 1,
      'resolvedBlockers', v_resolved
    )
  );
  INSERT INTO public.wos_operator_review_receipts (
    request_id, organization_id, order_id, actor_profile_id,
    office_revision_request_id, expected_version,
    payload_fingerprint, response_json
  ) VALUES (
    p_request_id, v_actor.org_id, p_order_id, v_actor.id,
    v_revision.request_id, p_expected_version, v_fingerprint, v_response
  );
  RETURN v_response;
END;
$review$;

REVOKE ALL ON FUNCTION public.wos_create_production_order(uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wos_office_resubmit_order(
  uuid,integer,uuid,text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wos_operator_review_correction(
  uuid,integer,uuid,text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) FROM PUBLIC, anon, authenticated;

COMMIT;

-- INSTALL_NOT_AUTHORIZED: activation remains a separate exact-SQL decision.
