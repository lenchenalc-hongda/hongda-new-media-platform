-- QA ONLY / INSTALL_NOT_AUTHORIZED
-- Target project: xulmpqaknlwqqculbsek
-- This file is not a production migration and must never be included in the
-- automatically applied migration chain.

BEGIN;

CREATE TABLE public.wos_qa_canonical_fixture_manifests (
  request_id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE
    REFERENCES public.wos_production_orders(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL,
  office_profile_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  baseline_id uuid UNIQUE,
  stage text NOT NULL CHECK (stage IN ('PREPARED', 'FINALIZED')),
  manifest jsonb NOT NULL,
  manifest_sha256 text NOT NULL CHECK (
    manifest_sha256 ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalized_at timestamptz
);
CREATE UNIQUE INDEX wos_one_active_canonical_fixture
  ON public.wos_qa_canonical_fixture_manifests ((true));

ALTER TABLE public.wos_qa_canonical_fixture_manifests
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wos_qa_canonical_fixture_manifests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.wos_qa_canonical_fixture_manifests
  TO service_role;

CREATE FUNCTION public.wos_qa_create_canonical_v1_fixture(
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  c_organization constant uuid :=
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid;
  c_expected_categories constant text[] := ARRAY[
    'PRODUCT',
    'FILM_PATTERN',
    'CUSTOMER_APPROVED_SAMPLE',
    'SIGNED_SAMPLE'
  ]::text[];
  v_operation text;
  v_key_count integer;
  v_request_id uuid;
  v_order_id uuid;
  v_organization_id uuid;
  v_office_profile_id uuid;
  v_baseline_id uuid;
  v_images jsonb;
  v_item jsonb;
  v_expected_path text;
  v_expected_slug text;
  v_key text;
  v_index integer;
  v_existing_order public.wos_production_orders%ROWTYPE;
  v_manifest_record
    public.wos_qa_canonical_fixture_manifests%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
  v_categories text[] := ARRAY[]::text[];
  v_image_ids uuid[] := ARRAY[]::uuid[];
  v_paths text[] := ARRAY[]::text[];
  v_sha256 text[] := ARRAY[]::text[];
  v_file_sizes bigint[] := ARRAY[]::bigint[];
  v_order_number text;
  v_result jsonb;
  v_manifest_sha256 text;
BEGIN
  IF CURRENT_USER <> 'service_role' THEN
    RAISE EXCEPTION 'FIXTURE_SERVICE_ROLE_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  IF p_input IS NULL
    OR pg_catalog.jsonb_typeof(p_input) <> 'object'
    OR pg_catalog.jsonb_typeof(p_input->'operation') <> 'string' THEN
    RAISE EXCEPTION 'INVALID_FIXTURE_INPUT'
      USING ERRCODE = '22023';
  END IF;
  v_operation := p_input->>'operation';

  IF v_operation = 'PREPARE' THEN
    SELECT pg_catalog.count(*) INTO v_key_count
    FROM pg_catalog.jsonb_object_keys(p_input);
    IF v_key_count <> 5
      OR NOT (p_input ?& ARRAY[
        'operation',
        'requestId',
        'orderId',
        'organizationId',
        'officeProfileId'
      ]) THEN
      RAISE EXCEPTION 'INVALID_PREPARE_KEYS'
        USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(p_input->'requestId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'orderId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'organizationId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'officeProfileId') <> 'string' THEN
      RAISE EXCEPTION 'INVALID_PREPARE_TYPES'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_to_record(p_input) AS input(
        operation text,
        "requestId" text,
        "orderId" text,
        "organizationId" text,
        "officeProfileId" text
      )
      WHERE input.operation = 'PREPARE'
        AND input."requestId" ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND input."orderId" ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND input."organizationId" ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND input."officeProfileId" ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'INVALID_PREPARE_VALUES'
        USING ERRCODE = '22023';
    END IF;

    v_request_id := (p_input->>'requestId')::uuid;
    v_order_id := (p_input->>'orderId')::uuid;
    v_organization_id := (p_input->>'organizationId')::uuid;
    v_office_profile_id := (p_input->>'officeProfileId')::uuid;
    IF v_organization_id <> c_organization THEN
      RAISE EXCEPTION 'FIXTURE_ORGANIZATION_DENIED'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_actor
    FROM public.profiles
    WHERE id = v_office_profile_id
      AND org_id = c_organization
      AND is_active = true
      AND user_id IS NOT NULL
      AND role IN ('admin', 'manager');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FIXTURE_OFFICE_PROFILE_INVALID'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled
      UNION ALL
      SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled
      UNION ALL
      SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled
    ) THEN
      RAISE EXCEPTION 'FIXTURE_GATES_MUST_BE_OFF'
        USING ERRCODE = '42501';
    END IF;

    v_order_number := 'QA-NONPROD-' || v_request_id::text;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('wos-qa-v1-fixture-global', 0)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'wos-qa-v1-fixture:' || v_order_id::text,
        0
      )
    );

    SELECT * INTO v_manifest_record
    FROM public.wos_qa_canonical_fixture_manifests
    LIMIT 1;
    IF FOUND
      AND (
        v_manifest_record.request_id <> v_request_id
        OR v_manifest_record.order_id <> v_order_id
      ) THEN
      RAISE EXCEPTION 'FIXTURE_ACTIVE_LIMIT_REACHED'
        USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_existing_order
    FROM public.wos_production_orders
    WHERE order_number = v_order_number
       OR id = v_order_id
    ORDER BY (id = v_order_id) DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_order.id <> v_order_id
        OR v_existing_order.organization_id <> c_organization
        OR v_existing_order.order_number <> v_order_number
        OR v_existing_order.workflow_status <> 'WAITING_MATERIAL'
        OR v_existing_order.version <> 1
        OR v_existing_order.version_label <> 'QA-R1'
        OR v_existing_order.created_by_profile_id <> v_actor.id
        OR v_existing_order.sales_owner_profile_id <> v_actor.id
        OR v_existing_order.project_owner_profile_id <> v_actor.id THEN
        RAISE EXCEPTION 'FIXTURE_PREPARE_CONFLICT'
          USING ERRCODE = '23505';
      END IF;
      SELECT * INTO v_manifest_record
      FROM public.wos_qa_canonical_fixture_manifests
      WHERE request_id = v_request_id
        AND order_id = v_order_id
        AND organization_id = c_organization
        AND office_profile_id = v_actor.id;
      IF NOT FOUND
        OR v_manifest_record.manifest_sha256 <>
          pg_catalog.encode(
            pg_catalog.sha256(
              pg_catalog.convert_to(
                v_manifest_record.manifest::text,
                'UTF8'
              )
            ),
            'hex'
          )
        OR v_manifest_record.manifest->>'orderNumber' <> v_order_number
        OR v_manifest_record.manifest->>'versionLabel' <> 'QA-R1'
        OR (v_manifest_record.manifest->>'orderVersion')::integer <> 1 THEN
        RAISE EXCEPTION 'FIXTURE_PREPARE_MANIFEST_CONFLICT'
          USING ERRCODE = '23505';
      END IF;
      RETURN v_manifest_record.manifest || pg_catalog.jsonb_build_object(
        'status', 'REPLAYED',
        'stage', v_manifest_record.stage
      );
    END IF;

    v_result := pg_catalog.jsonb_build_object(
      'manifestVersion', 1,
      'fixtureRequestId', v_request_id,
      'orderId', v_order_id,
      'organizationId', c_organization,
      'officeProfileId', v_actor.id,
      'orderNumber', v_order_number,
      'orderVersion', 1,
      'versionLabel', 'QA-R1',
      'orderStatus', 'WAITING_MATERIAL',
      'canStart', false
    );
    INSERT INTO public.wos_production_orders (
      id,
      organization_id,
      customer_name_snapshot,
      order_number,
      product_name,
      sales_owner_profile_id,
      project_owner_profile_id,
      priority,
      is_urgent,
      version_label,
      workflow_status,
      requested_quantity,
      current_batch_quantity,
      split_delivery,
      product_material,
      created_by_profile_id,
      version,
      created_at,
      updated_at
    ) VALUES (
      v_order_id,
      c_organization,
      'QA Synthetic Fixture',
      v_order_number,
      'Canonical Four Image Fixture',
      v_actor.id,
      v_actor.id,
      'MEDIUM',
      false,
      'QA-R1',
      'WAITING_MATERIAL',
      1,
      1,
      false,
      'QA NONPROD',
      v_actor.id,
      1,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    );

    v_manifest_sha256 := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_result::text, 'UTF8')
      ),
      'hex'
    );
    BEGIN
      INSERT INTO public.wos_qa_canonical_fixture_manifests (
        request_id,
        order_id,
        organization_id,
        office_profile_id,
        stage,
        manifest,
        manifest_sha256
      ) VALUES (
        v_request_id,
        v_order_id,
        c_organization,
        v_actor.id,
        'PREPARED',
        v_result,
        v_manifest_sha256
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'FIXTURE_ACTIVE_LIMIT_REACHED'
        USING ERRCODE = '23505';
    END;
    RETURN v_result || pg_catalog.jsonb_build_object(
      'status', 'CREATED',
      'stage', 'PREPARED'
    );
  END IF;

  IF v_operation = 'FINALIZE' THEN
    SELECT pg_catalog.count(*) INTO v_key_count
    FROM pg_catalog.jsonb_object_keys(p_input);
    IF v_key_count <> 7
      OR NOT (p_input ?& ARRAY[
        'operation',
        'requestId',
        'orderId',
        'organizationId',
        'officeProfileId',
        'baselineId',
        'images'
      ]) THEN
      RAISE EXCEPTION 'INVALID_FINALIZE_KEYS'
        USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(p_input->'operation') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'requestId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'orderId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'organizationId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'officeProfileId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'baselineId') <> 'string'
      OR pg_catalog.jsonb_typeof(p_input->'images') <> 'array' THEN
      RAISE EXCEPTION 'INVALID_FINALIZE_TYPES'
        USING ERRCODE = '22023';
    END IF;

    v_request_id := (p_input->>'requestId')::uuid;
    v_order_id := (p_input->>'orderId')::uuid;
    v_organization_id := (p_input->>'organizationId')::uuid;
    v_office_profile_id := (p_input->>'officeProfileId')::uuid;
    IF (p_input->>'baselineId') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'INVALID_FIXTURE_BASELINE_ID'
        USING ERRCODE = '22023';
    END IF;
    v_baseline_id := (p_input->>'baselineId')::uuid;
    v_images := p_input->'images';
    IF v_organization_id <> c_organization
      OR pg_catalog.jsonb_typeof(v_images) <> 'array'
      OR pg_catalog.jsonb_array_length(v_images) <> 4 THEN
      RAISE EXCEPTION 'INVALID_FINALIZE_VALUES'
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_actor
    FROM public.profiles
    WHERE id = v_office_profile_id
      AND org_id = c_organization
      AND is_active = true
      AND user_id IS NOT NULL
      AND role IN ('admin', 'manager');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FIXTURE_OFFICE_PROFILE_INVALID'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled
      UNION ALL
      SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled
      UNION ALL
      SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled
    ) THEN
      RAISE EXCEPTION 'FIXTURE_GATES_MUST_BE_OFF'
        USING ERRCODE = '42501';
    END IF;

    v_order_number := 'QA-NONPROD-' || v_request_id::text;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('wos-qa-v1-fixture-global', 0)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'wos-qa-v1-fixture:' || v_order_id::text,
        0
      )
    );
    SELECT * INTO v_existing_order
    FROM public.wos_production_orders
    WHERE id = v_order_id
      AND organization_id = c_organization
      AND order_number = v_order_number
      AND workflow_status = 'WAITING_MATERIAL'
      AND version = 1
      AND version_label = 'QA-R1'
      AND created_by_profile_id = v_actor.id
      AND sales_owner_profile_id = v_actor.id
      AND project_owner_profile_id = v_actor.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FIXTURE_ORDER_NOT_PREPARED'
        USING ERRCODE = '23514';
    END IF;

    v_categories := ARRAY[]::text[];
    v_image_ids := ARRAY[]::uuid[];
    v_paths := ARRAY[]::text[];
    v_sha256 := ARRAY[]::text[];
    v_file_sizes := ARRAY[]::bigint[];
    FOR v_index IN 0..3 LOOP
      v_item := v_images->v_index;
      IF pg_catalog.jsonb_typeof(v_item) <> 'object'
        OR (
          SELECT pg_catalog.count(*)
          FROM pg_catalog.jsonb_object_keys(v_item)
        ) <> 7
        OR NOT (v_item ?& ARRAY[
          'category',
          'imageId',
          'storagePath',
          'storageObjectId',
          'storageObjectVersion',
          'storageObjectUpdatedAt',
          'sha256'
        ])
        OR pg_catalog.jsonb_typeof(v_item->'category') <> 'string'
        OR pg_catalog.jsonb_typeof(v_item->'imageId') <> 'string'
        OR pg_catalog.jsonb_typeof(v_item->'storagePath') <> 'string'
        OR pg_catalog.jsonb_typeof(v_item->'storageObjectId') <> 'string'
        OR pg_catalog.jsonb_typeof(v_item->'storageObjectVersion')
          <> 'string'
        OR pg_catalog.jsonb_typeof(v_item->'storageObjectUpdatedAt')
          <> 'string'
        OR pg_catalog.jsonb_typeof(v_item->'sha256') <> 'string' THEN
        RAISE EXCEPTION 'INVALID_FIXTURE_IMAGE_KEYS'
          USING ERRCODE = '22023';
      END IF;
      IF v_item->>'category' NOT IN (
        'PRODUCT',
        'FILM_PATTERN',
        'CUSTOMER_APPROVED_SAMPLE',
        'SIGNED_SAMPLE'
      )
        OR (v_item->>'imageId') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (v_item->>'storageObjectId') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR (v_item->>'sha256') !~ '^[a-f0-9]{64}$'
        OR pg_catalog.length(v_item->>'storageObjectVersion') = 0
        OR pg_catalog.btrim(v_item->>'storageObjectVersion')
          <> v_item->>'storageObjectVersion' THEN
        RAISE EXCEPTION 'INVALID_FIXTURE_IMAGE_VALUES'
          USING ERRCODE = '22023';
      END IF;

      v_expected_slug := pg_catalog.replace(
        pg_catalog.lower(v_item->>'category'),
        '_',
        '-'
      );
      v_expected_path :=
        'organizations/' || c_organization::text
        || '/wos/production-order/' || v_order_id::text
        || '/images/' || v_expected_slug
        || '/versions/QA-R1/' || (v_item->>'imageId')
        || '/source.png';
      IF v_item->>'storagePath' <> v_expected_path THEN
        RAISE EXCEPTION 'FIXTURE_IMAGE_PATH_INVALID'
          USING ERRCODE = '23514';
      END IF;
      IF (v_item->>'category') = ANY(v_categories)
        OR (v_item->>'imageId')::uuid = ANY(v_image_ids)
        OR v_item->>'storagePath' = ANY(v_paths)
        OR v_item->>'sha256' = ANY(v_sha256) THEN
        RAISE EXCEPTION 'FIXTURE_IMAGE_DUPLICATE'
          USING ERRCODE = '23514';
      END IF;

      SELECT * INTO v_object
      FROM storage.objects
      WHERE bucket_id = 'wos-private'
        AND name = v_expected_path;
      IF NOT FOUND
        OR v_object.owner_id IS DISTINCT FROM v_actor.user_id::text
        OR coalesce(v_object.is_delete_marker, false)
        OR v_object.archived_at IS NOT NULL
        OR v_object.version IS NULL
        OR pg_catalog.btrim(v_object.version) = ''
        OR v_object.updated_at IS NULL
        OR v_object.id::text <> v_item->>'storageObjectId'
        OR v_object.version <> v_item->>'storageObjectVersion'
        OR v_object.updated_at <>
          (v_item->>'storageObjectUpdatedAt')::timestamptz
        OR coalesce(v_object.metadata->>'mimetype', '') <> 'image/png'
        OR coalesce(v_object.metadata->>'size', '') !~ '^[0-9]+$'
        OR (v_object.metadata->>'size')::bigint NOT BETWEEN 60 AND 20971520
      THEN
        RAISE EXCEPTION 'FIXTURE_STORAGE_OBJECT_INVALID'
          USING ERRCODE = '23514';
      END IF;

      v_categories := pg_catalog.array_append(
        v_categories,
        v_item->>'category'
      );
      v_image_ids := pg_catalog.array_append(
        v_image_ids,
        (v_item->>'imageId')::uuid
      );
      v_paths := pg_catalog.array_append(
        v_paths,
        v_item->>'storagePath'
      );
      v_sha256 := pg_catalog.array_append(
        v_sha256,
        v_item->>'sha256'
      );
      v_file_sizes := pg_catalog.array_append(
        v_file_sizes,
        (v_object.metadata->>'size')::bigint
      );
    END LOOP;

    IF (
      SELECT count(*)
      FROM (
        SELECT DISTINCT pg_catalog.unnest(v_categories)
      ) categories
    ) <> 4
      OR (
        SELECT count(*)
        FROM (
          SELECT DISTINCT pg_catalog.unnest(v_image_ids)
        ) image_ids
      ) <> 4
      OR (
        SELECT count(*)
        FROM (
          SELECT DISTINCT pg_catalog.unnest(v_paths)
        ) paths
      ) <> 4
      OR (
        SELECT count(*)
        FROM (
          SELECT DISTINCT pg_catalog.unnest(v_sha256)
        ) hashes
      ) <> 4
      OR NOT (v_categories @> c_expected_categories)
      OR NOT (c_expected_categories @> v_categories) THEN
      RAISE EXCEPTION 'FIXTURE_IMAGE_SET_INVALID'
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_manifest_record
    FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = v_request_id
      AND order_id = v_order_id
      AND organization_id = c_organization
      AND office_profile_id = v_actor.id
    FOR UPDATE;
    IF NOT FOUND
      OR v_manifest_record.manifest_sha256 <>
        pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              v_manifest_record.manifest::text,
              'UTF8'
            )
          ),
          'hex'
        )
      OR v_manifest_record.manifest->>'orderNumber' <> v_order_number
      OR v_manifest_record.manifest->>'versionLabel' <> 'QA-R1' THEN
      RAISE EXCEPTION 'FIXTURE_MANIFEST_MISSING_OR_TAMPERED'
        USING ERRCODE = '23514';
    END IF;
    v_result := p_input || pg_catalog.jsonb_build_object(
      'manifestVersion', 1,
      'stage', 'FINALIZED',
      'orderNumber', v_order_number,
      'orderVersion', 1,
      'versionLabel', 'QA-R1',
      'orderStatus', 'WAITING_MATERIAL'
    );
    v_manifest_sha256 := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_result::text, 'UTF8')
      ),
      'hex'
    );

    SELECT * INTO v_baseline
    FROM public.wos_visual_baselines
    WHERE organization_id = c_organization
      AND entity_type = 'PRODUCTION_ORDER'
      AND entity_id = v_order_id
      AND version_label = 'QA-R1'
      AND status = 'CURRENT'
      AND superseded_at IS NULL;
    IF FOUND THEN
      IF v_baseline.id <> v_baseline_id
        OR v_manifest_record.stage <> 'FINALIZED'
        OR v_manifest_record.baseline_id IS DISTINCT FROM v_baseline_id
        OR v_manifest_record.manifest IS DISTINCT FROM v_result
        OR v_manifest_record.manifest_sha256 <> v_manifest_sha256
        OR v_baseline.confirmed_by_office_profile_id IS NOT NULL
        OR v_baseline.confirmed_by_workshop_profile_id IS NOT NULL
        OR v_baseline.office_confirmed_at IS NOT NULL
        OR v_baseline.workshop_confirmed_at IS NOT NULL
        OR v_baseline.office_proof_set_digest IS NOT NULL
        OR v_baseline.workshop_proof_set_digest IS NOT NULL
        OR v_baseline.office_post_order_version IS NOT NULL
        OR v_baseline.workshop_post_order_version IS NOT NULL
        OR (
          SELECT count(*)
          FROM public.wos_reference_images
          WHERE organization_id = c_organization
            AND entity_type = 'PRODUCTION_ORDER'
            AND entity_id = v_order_id
            AND version_label = 'QA-R1'
            AND image_status = 'READY'
            AND superseded_at IS NULL
        ) <> 4
        OR (
          SELECT count(*)
          FROM public.wos_visual_baseline_items
          WHERE baseline_id = v_baseline.id
        ) <> 4 THEN
        RAISE EXCEPTION 'FIXTURE_FINALIZE_CONFLICT'
          USING ERRCODE = '23505';
      END IF;
      FOR v_index IN 1..4 LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.wos_reference_images image
          JOIN public.wos_visual_baseline_items item
            ON item.reference_image_id = image.id
          WHERE image.id = v_image_ids[v_index]
            AND image.storage_path = v_paths[v_index]
            AND item.baseline_id = v_baseline.id
            AND item.is_required = true
        ) THEN
          RAISE EXCEPTION 'FIXTURE_FINALIZE_CONFLICT'
            USING ERRCODE = '23505';
        END IF;
      END LOOP;
      RETURN v_manifest_record.manifest || pg_catalog.jsonb_build_object(
        'status', 'REPLAYED',
        'referenceImageCount', 4,
        'baselineItemCount', 4,
        'trustedProofCount', 0,
        'officeSignoff', false,
        'workshopSignoff', false,
        'canStart', false,
        'byteVerification', 'EXTERNAL_REQUIRED_NOT_PROVEN'
      );
    END IF;

    IF v_manifest_record.stage <> 'PREPARED' THEN
      RAISE EXCEPTION 'FIXTURE_MANIFEST_STAGE_INVALID'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.wos_visual_baselines
      WHERE organization_id = c_organization
        AND entity_type = 'PRODUCTION_ORDER'
        AND entity_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_reference_images
      WHERE organization_id = c_organization
        AND entity_type = 'PRODUCTION_ORDER'
        AND entity_id = v_order_id
    ) THEN
      RAISE EXCEPTION 'PARTIAL_FIXTURE_DETECTED'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.wos_qa_verified_image_proofs
      WHERE order_id = v_order_id
         OR image_id = ANY(v_image_ids)
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_submission_receipts
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_qa_p2_m2_receipts
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_office_readiness_receipts
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_qa_orphan_cleanup_claims
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_qa_p2_action_receipts
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_qa_p2_office_revisions
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_qa_p2_review_receipts
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_qa_trusted_proof_receipts
      WHERE order_id = v_order_id
    ) OR EXISTS (
      SELECT 1
      FROM public.wos_workshop_inbox
      WHERE order_id = v_order_id
    ) THEN
      RAISE EXCEPTION 'FIXTURE_MUST_NOT_HAVE_PROOF_OR_RECEIPT'
        USING ERRCODE = '23514';
    END IF;

    FOR v_index IN 1..4 LOOP
      INSERT INTO public.wos_reference_images (
        id,
        organization_id,
        entity_type,
        entity_id,
        category,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        version_label,
        image_status,
        uploaded_by_profile_id
      ) VALUES (
        v_image_ids[v_index],
        c_organization,
        'PRODUCTION_ORDER',
        v_order_id,
        v_categories[v_index],
        'wos-private',
        v_paths[v_index],
        'source.png',
        'image/png',
        v_file_sizes[v_index],
        'QA-R1',
        'READY',
        v_actor.id
      );
    END LOOP;

    INSERT INTO public.wos_visual_baselines (
      id,
      organization_id,
      entity_type,
      entity_id,
      version_label,
      status,
      confirmed_by_office_profile_id,
      confirmed_by_workshop_profile_id,
      office_confirmed_at,
      workshop_confirmed_at,
      created_at,
      superseded_at,
      office_proof_set_digest,
      office_post_order_version,
      workshop_proof_set_digest,
      workshop_post_order_version
    ) VALUES (
      v_baseline_id,
      c_organization,
      'PRODUCTION_ORDER',
      v_order_id,
      'QA-R1',
      'CURRENT',
      NULL,
      NULL,
      NULL,
      NULL,
      pg_catalog.clock_timestamp(),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    );

    FOR v_index IN 1..4 LOOP
      INSERT INTO public.wos_visual_baseline_items (
        baseline_id,
        reference_image_id,
        display_order,
        is_required
      ) VALUES (
        v_baseline_id,
        v_image_ids[v_index],
        v_index,
        true
      );
    END LOOP;

    UPDATE public.wos_qa_canonical_fixture_manifests
    SET baseline_id = v_baseline_id,
        stage = 'FINALIZED',
        manifest = v_result,
        manifest_sha256 = v_manifest_sha256,
        finalized_at = pg_catalog.clock_timestamp()
    WHERE request_id = v_request_id
      AND order_id = v_order_id
      AND stage = 'PREPARED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FIXTURE_MANIFEST_UPDATE_CONFLICT'
        USING ERRCODE = 'PT409';
    END IF;

    RETURN v_result || pg_catalog.jsonb_build_object(
      'status', 'CREATED',
      'referenceImageCount', 4,
      'baselineItemCount', 4,
      'trustedProofCount', 0,
      'officeSignoff', false,
      'workshopSignoff', false,
      'canStart', false,
      'byteVerification', 'EXTERNAL_REQUIRED_NOT_PROVEN'
    );
  END IF;

  RAISE EXCEPTION 'INVALID_FIXTURE_OPERATION'
    USING ERRCODE = '22023';
END;
$function$;

CREATE FUNCTION public.wos_qa_rollback_canonical_v1_fixture(
  p_request_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  c_organization constant uuid :=
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid;
  v_order public.wos_production_orders%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
  v_manifest_record
    public.wos_qa_canonical_fixture_manifests%ROWTYPE;
  v_order_number text;
  v_count integer;
  v_storage_paths jsonb;
  v_index integer;
  v_item jsonb;
  v_image_ids uuid[] := ARRAY[]::uuid[];
  v_storage_prefix text;
BEGIN
  IF CURRENT_USER <> 'service_role' THEN
    RAISE EXCEPTION 'FIXTURE_SERVICE_ROLE_REQUIRED'
      USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ROLLBACK_INPUT'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled
  ) THEN
    RAISE EXCEPTION 'FIXTURE_GATES_MUST_BE_OFF'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wos-qa-v1-fixture-global', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wos-qa-v1-fixture:' || p_order_id::text,
      0
    )
  );
  v_order_number := 'QA-NONPROD-' || p_request_id::text;
  SELECT * INTO v_order
  FROM public.wos_production_orders
  WHERE id = p_order_id
    AND organization_id = c_organization
    AND order_number = v_order_number
    AND workflow_status = 'WAITING_MATERIAL'
    AND version = 1
    AND version_label = 'QA-R1'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE_ROLLBACK_TARGET_INVALID'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_manifest_record
  FROM public.wos_qa_canonical_fixture_manifests
  WHERE request_id = p_request_id
    AND order_id = p_order_id
    AND organization_id = c_organization
  FOR UPDATE;
  IF NOT FOUND
    OR v_manifest_record.stage NOT IN ('PREPARED', 'FINALIZED')
    OR v_manifest_record.manifest_sha256 <>
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            v_manifest_record.manifest::text,
            'UTF8'
          )
        ),
        'hex'
      )
    OR pg_catalog.jsonb_typeof(v_manifest_record.manifest->'images')
      <> 'array'
    OR pg_catalog.jsonb_array_length(v_manifest_record.manifest->'images')
      <> 4 THEN
    RAISE EXCEPTION 'FIXTURE_MANIFEST_INVALID'
      USING ERRCODE = '23514';
  END IF;

  IF v_order.created_by_profile_id <> v_manifest_record.office_profile_id
    OR v_order.sales_owner_profile_id <> v_manifest_record.office_profile_id
    OR v_order.project_owner_profile_id <> v_manifest_record.office_profile_id
    OR v_manifest_record.manifest->>'officeProfileId'
      <> v_manifest_record.office_profile_id::text THEN
    RAISE EXCEPTION 'FIXTURE_ORDER_ACTOR_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  IF v_manifest_record.stage = 'PREPARED' THEN
    IF v_manifest_record.baseline_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.wos_reference_images
        WHERE organization_id = c_organization
          AND entity_type = 'PRODUCTION_ORDER'
          AND entity_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_visual_baselines
        WHERE organization_id = c_organization
          AND entity_type = 'PRODUCTION_ORDER'
          AND entity_id = p_order_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.wos_visual_baseline_items item
        JOIN public.wos_visual_baselines baseline
          ON baseline.id = item.baseline_id
        WHERE baseline.entity_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_verified_image_proofs
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_submission_receipts
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_p2_m2_receipts
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_office_readiness_receipts
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_orphan_cleanup_claims
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_p2_action_receipts
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_p2_office_revisions
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_p2_review_receipts
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_qa_trusted_proof_receipts
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_workshop_inbox
        WHERE order_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_confirmations
        WHERE entity_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_blockers
        WHERE entity_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_status_history
        WHERE entity_id = p_order_id
      )
      OR EXISTS (
        SELECT 1 FROM public.wos_resource_readiness
        WHERE entity_id = p_order_id
      ) THEN
      RAISE EXCEPTION 'FIXTURE_HAS_EXTERNAL_REFERENCES'
        USING ERRCODE = '23514';
    END IF;

    v_storage_prefix :=
      'organizations/' || c_organization::text
      || '/wos/production-order/' || p_order_id::text || '/';
    IF EXISTS (
      SELECT 1
      FROM storage.objects
      WHERE bucket_id = 'wos-private'
        AND left(name, length(v_storage_prefix)) = v_storage_prefix
    ) THEN
      RAISE EXCEPTION 'FIXTURE_STORAGE_OBJECTS_REMAIN'
        USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = p_request_id
      AND order_id = p_order_id
      AND stage = 'PREPARED';
    DELETE FROM public.wos_production_orders
    WHERE id = p_order_id
      AND organization_id = c_organization
      AND order_number = v_order_number
      AND workflow_status = 'WAITING_MATERIAL'
      AND version = 1
      AND version_label = 'QA-R1';
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ROLLED_BACK',
      'stage', 'PREPARED',
      'fixtureRequestId', p_request_id,
      'orderId', p_order_id,
      'organizationId', c_organization,
      'deletedBaselineItems', 0,
      'deletedBaselines', 0,
      'deletedReferenceImages', 0,
      'deletedOrders', 1,
      'storageObjectsDeletedBySql', 0,
      'storageCleanupRequired', false,
      'storagePaths', '[]'::jsonb
    );
  END IF;

  IF v_manifest_record.stage <> 'FINALIZED'
    OR v_manifest_record.baseline_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_MANIFEST_STAGE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_baseline
  FROM public.wos_visual_baselines
  WHERE id = v_manifest_record.baseline_id
    AND organization_id = c_organization
    AND entity_type = 'PRODUCTION_ORDER'
    AND entity_id = p_order_id
    AND version_label = 'QA-R1'
    AND status = 'CURRENT'
    AND superseded_at IS NULL;
  IF NOT FOUND
    OR v_baseline.confirmed_by_office_profile_id IS NOT NULL
    OR v_baseline.confirmed_by_workshop_profile_id IS NOT NULL
    OR v_baseline.office_confirmed_at IS NOT NULL
    OR v_baseline.workshop_confirmed_at IS NOT NULL
    OR v_baseline.office_proof_set_digest IS NOT NULL
    OR v_baseline.workshop_proof_set_digest IS NOT NULL
    OR v_baseline.office_post_order_version IS NOT NULL
    OR v_baseline.workshop_post_order_version IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE_BASELINE_CHANGED'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.wos_reference_images
  WHERE organization_id = c_organization
    AND entity_type = 'PRODUCTION_ORDER'
    AND entity_id = p_order_id;
  IF v_count <> 4 OR (
    SELECT count(*)
    FROM public.wos_visual_baselines
    WHERE organization_id = c_organization
      AND entity_type = 'PRODUCTION_ORDER'
      AND entity_id = p_order_id
  ) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE_IMAGE_SET_CHANGED'
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.wos_visual_baseline_items
  WHERE baseline_id = v_baseline.id;
  IF v_count <> 4 OR (
    SELECT count(*)
    FROM public.wos_visual_baseline_items
    WHERE baseline_id = v_baseline.id
      AND is_required = true
  ) <> 4 THEN
    RAISE EXCEPTION 'FIXTURE_BASELINE_ITEMS_CHANGED'
      USING ERRCODE = '23514';
  END IF;

  FOR v_index IN 0..3 LOOP
    v_item := v_manifest_record.manifest->'images'->v_index;
    IF pg_catalog.jsonb_typeof(v_item) <> 'object'
      OR pg_catalog.jsonb_typeof(v_item->'imageId') <> 'string'
      OR pg_catalog.jsonb_typeof(v_item->'category') <> 'string'
      OR pg_catalog.jsonb_typeof(v_item->'storagePath') <> 'string'
      OR pg_catalog.jsonb_typeof(v_item->'storageObjectId') <> 'string'
      OR pg_catalog.jsonb_typeof(v_item->'storageObjectVersion')
        <> 'string'
      OR pg_catalog.jsonb_typeof(v_item->'storageObjectUpdatedAt')
        <> 'string'
      OR pg_catalog.jsonb_typeof(v_item->'sha256') <> 'string'
      OR NOT EXISTS (
        SELECT 1
        FROM public.wos_reference_images image
        WHERE image.id = (v_item->>'imageId')::uuid
          AND image.organization_id = c_organization
          AND image.entity_type = 'PRODUCTION_ORDER'
          AND image.entity_id = p_order_id
          AND image.category = v_item->>'category'
          AND image.storage_bucket = 'wos-private'
          AND image.storage_path = v_item->>'storagePath'
          AND image.version_label = 'QA-R1'
          AND image.image_status = 'READY'
          AND image.superseded_at IS NULL
      )
      OR NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        JOIN public.profiles office
          ON office.id = v_manifest_record.office_profile_id
        WHERE object.bucket_id = 'wos-private'
          AND object.name = v_item->>'storagePath'
          AND object.id::text = v_item->>'storageObjectId'
          AND object.version = v_item->>'storageObjectVersion'
          AND object.updated_at =
            (v_item->>'storageObjectUpdatedAt')::timestamptz
          AND object.owner_id = office.user_id::text
          AND coalesce(object.is_delete_marker, false) = false
          AND object.archived_at IS NULL
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.wos_visual_baseline_items item
        WHERE item.baseline_id = v_baseline.id
          AND item.reference_image_id = (v_item->>'imageId')::uuid
          AND item.display_order = v_index + 1
          AND item.is_required = true
      ) THEN
      RAISE EXCEPTION 'FIXTURE_MANIFEST_DATA_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
    v_image_ids := pg_catalog.array_append(
      v_image_ids,
      (v_item->>'imageId')::uuid
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.wos_qa_verified_image_proofs
    WHERE order_id = p_order_id OR image_id IN (
        SELECT id FROM public.wos_reference_images
        WHERE entity_id = p_order_id
          AND organization_id = c_organization
      )
    UNION ALL
    SELECT 1 FROM public.wos_submission_receipts WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_m2_receipts WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_office_readiness_receipts
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_qa_orphan_cleanup_claims
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_action_receipts
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_office_revisions
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_qa_p2_review_receipts
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_qa_trusted_proof_receipts
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_workshop_inbox
      WHERE order_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_confirmations
      WHERE entity_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_blockers
      WHERE entity_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_status_history
      WHERE entity_id = p_order_id
    UNION ALL
    SELECT 1 FROM public.wos_resource_readiness
      WHERE entity_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'FIXTURE_HAS_EXTERNAL_REFERENCES'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'imageId', id,
      'storagePath', storage_path
    )
    ORDER BY category
  ) INTO v_storage_paths
  FROM public.wos_reference_images
  WHERE entity_id = p_order_id
    AND organization_id = c_organization
    AND version_label = 'QA-R1';

  DELETE FROM public.wos_visual_baseline_items
  WHERE baseline_id = v_baseline.id;
  DELETE FROM public.wos_visual_baselines
  WHERE id = v_baseline.id;
  DELETE FROM public.wos_reference_images
  WHERE id = ANY(v_image_ids)
    AND entity_id = p_order_id
    AND organization_id = c_organization
    AND version_label = 'QA-R1';
  DELETE FROM public.wos_qa_canonical_fixture_manifests
  WHERE request_id = p_request_id
    AND order_id = p_order_id;
  DELETE FROM public.wos_production_orders
  WHERE id = p_order_id
    AND organization_id = c_organization
    AND order_number = v_order_number
    AND workflow_status = 'WAITING_MATERIAL'
    AND version = 1
    AND version_label = 'QA-R1';

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ROLLED_BACK',
    'fixtureRequestId', p_request_id,
    'orderId', p_order_id,
    'organizationId', c_organization,
    'deletedBaselineItems', 4,
    'deletedBaselines', 1,
    'deletedReferenceImages', 4,
    'deletedOrders', 1,
    'storageObjectsDeletedBySql', 0,
    'storageCleanupRequired', true,
    'storagePaths', v_storage_paths
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.wos_qa_create_canonical_v1_fixture(jsonb)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.wos_qa_rollback_canonical_v1_fixture(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.wos_qa_create_canonical_v1_fixture(jsonb)
TO service_role;
GRANT EXECUTE ON FUNCTION
  public.wos_qa_rollback_canonical_v1_fixture(uuid, uuid)
TO service_role;

COMMIT;
