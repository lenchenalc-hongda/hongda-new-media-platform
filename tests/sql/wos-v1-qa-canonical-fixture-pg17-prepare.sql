-- PostgreSQL 17 fixture preparation and negative assertions.

CREATE FUNCTION public.test_fixture_prepare_input()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'operation', 'PREPARE',
    'requestId', '11111111-1111-4111-8111-111111111111',
    'orderId', '22222222-2222-4222-8222-222222222222',
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'officeProfileId', 'f8adf44a-f04e-44b4-9c82-8b96508097bb'
  )
$$;

CREATE FUNCTION public.test_fixture_manifest()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'operation', 'FINALIZE',
    'requestId', '11111111-1111-4111-8111-111111111111',
    'orderId', '22222222-2222-4222-8222-222222222222',
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'officeProfileId', 'f8adf44a-f04e-44b4-9c82-8b96508097bb',
    'baselineId', '33333333-3333-4333-8333-333333333333',
    'images', jsonb_build_array(
      jsonb_build_object(
        'category', 'PRODUCT',
        'imageId', '41111111-1111-4111-8111-111111111111',
        'storagePath', 'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/product/versions/QA-R1/41111111-1111-4111-8111-111111111111/source.png',
        'storageObjectId', '51111111-1111-4111-8111-111111111111',
        'storageObjectVersion', 'object-version-product',
        'storageObjectUpdatedAt', '2026-11-24T10:00:00.111111+00:00',
        'sha256', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      ),
      jsonb_build_object(
        'category', 'FILM_PATTERN',
        'imageId', '42222222-2222-4222-8222-222222222222',
        'storagePath', 'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/film-pattern/versions/QA-R1/42222222-2222-4222-8222-222222222222/source.png',
        'storageObjectId', '52222222-2222-4222-8222-222222222222',
        'storageObjectVersion', 'object-version-film',
        'storageObjectUpdatedAt', '2026-11-24T10:00:00.222222+00:00',
        'sha256', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      ),
      jsonb_build_object(
        'category', 'CUSTOMER_APPROVED_SAMPLE',
        'imageId', '43333333-3333-4333-8333-333333333333',
        'storagePath', 'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/customer-approved-sample/versions/QA-R1/43333333-3333-4333-8333-333333333333/source.png',
        'storageObjectId', '53333333-3333-4333-8333-333333333333',
        'storageObjectVersion', 'object-version-customer',
        'storageObjectUpdatedAt', '2026-11-24T10:00:00.333333+00:00',
        'sha256', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      ),
      jsonb_build_object(
        'category', 'SIGNED_SAMPLE',
        'imageId', '44444444-4444-4444-8444-444444444444',
        'storagePath', 'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/signed-sample/versions/QA-R1/44444444-4444-4444-8444-444444444444/source.png',
        'storageObjectId', '54444444-4444-4444-8444-444444444444',
        'storageObjectVersion', 'object-version-signed',
        'storageObjectUpdatedAt', '2026-11-24T10:00:00.444444+00:00',
        'sha256', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
      )
    )
  )
$$;

GRANT EXECUTE ON FUNCTION
  public.test_fixture_prepare_input(),
  public.test_fixture_manifest()
TO service_role;

INSERT INTO public.profiles(id, user_id, org_id, role, is_active) VALUES
  (
    'f8adf44a-f04e-44b4-9c82-8b96508097bb',
    '3c0d8866-498a-4e61-a602-28b7a83f75f5',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'admin',
    true
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'fbdb0989-ae25-4ba4-92f9-3266cc845977',
    'admin',
    true
  );

DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_prepare_input()
    );
    RAISE EXCEPTION 'expected missing service-role claim rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_SERVICE_ROLE_REQUIRED' THEN RAISE; END IF;
  END;
END;
$$;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      '{"operation":"PREPARE"}'::jsonb
    );
    RAISE EXCEPTION 'expected anon ACL rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      '{"operation":"PREPARE"}'::jsonb
    );
    RAISE EXCEPTION 'expected authenticated ACL rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE service_role;

DO $$
DECLARE
  v_input jsonb;
BEGIN
  v_input := public.test_fixture_prepare_input();
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        v_input,
        '{organizationId}',
        '"fbdb0989-ae25-4ba4-92f9-3266cc845977"'
      )
    );
    RAISE EXCEPTION 'expected foreign organization rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_ORGANIZATION_DENIED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      v_input || '{"orderNumber":"ARBITRARY"}'::jsonb
    );
    RAISE EXCEPTION 'expected extra-key rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_PREPARE_KEYS' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        v_input,
        '{officeProfileId}',
        '"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"'
      )
    );
    RAISE EXCEPTION 'expected foreign Profile rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_OFFICE_PROFILE_INVALID' THEN RAISE; END IF;
  END;
END;
$$;

RESET ROLE;
UPDATE public.wos_qa_p2_m2_gate
SET enabled = true,
    enabled_until = clock_timestamp() + interval '5 minutes',
    approval_reference = 'SHOULD_NOT_MATTER',
    activated_at = clock_timestamp()
WHERE gate_name = 'M2_OFFICE_WRITES';
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_prepare_input()
    );
    RAISE EXCEPTION 'expected enabled-gate rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_GATES_MUST_BE_OFF' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
UPDATE public.wos_qa_p2_m2_gate
SET enabled = false,
    enabled_until = NULL,
    approval_reference = 'NOT_AUTHORIZED',
    allowed_order_id = NULL,
    allowed_organization_id = NULL,
    allowed_profile_id = NULL,
    activated_at = NULL
WHERE gate_name = 'M2_OFFICE_WRITES';

SET ROLE service_role;
DO $$
DECLARE
  v_result jsonb;
  v_replay jsonb;
  v_count integer;
BEGIN
  v_result := public.wos_qa_create_canonical_v1_fixture(
    public.test_fixture_prepare_input()
  );
  IF v_result->>'status' <> 'CREATED'
    OR v_result->>'orderStatus' <> 'WAITING_MATERIAL'
    OR v_result->>'versionLabel' <> 'QA-R1'
    OR v_result->>'canStart' <> 'false' THEN
    RAISE EXCEPTION 'PREPARE result mismatch: %', v_result;
  END IF;
  v_replay := public.wos_qa_create_canonical_v1_fixture(
    public.test_fixture_prepare_input()
  );
  IF v_replay->>'status' <> 'REPLAYED' THEN
    RAISE EXCEPTION 'PREPARE idempotency mismatch: %', v_replay;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.wos_production_orders
  WHERE id = '22222222-2222-4222-8222-222222222222';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PREPARE row count mismatch';
  END IF;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        public.test_fixture_prepare_input(),
        '{orderId}',
        '"22222222-2222-4222-8222-222222222223"'
      )
    );
    RAISE EXCEPTION 'expected active Fixture limit rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_ACTIVE_LIMIT_REACHED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_manifest()
    );
    RAISE EXCEPTION 'expected missing Storage rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_STORAGE_OBJECT_INVALID' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

INSERT INTO storage.objects(
  id, bucket_id, name, owner, owner_id, version, updated_at, metadata,
  archived_at, is_delete_marker
)
SELECT
  (item->>'storageObjectId')::uuid,
  'wos-private',
  item->>'storagePath',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5'::uuid,
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  item->>'storageObjectVersion',
  (item->>'storageObjectUpdatedAt')::timestamptz,
  jsonb_build_object('mimetype', 'image/png', 'size', 128),
  NULL,
  false
FROM jsonb_array_elements(public.test_fixture_manifest()->'images') item;

SET ROLE service_role;
DO $$
DECLARE
  v_manifest jsonb;
BEGIN
  v_manifest := public.test_fixture_manifest();
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        v_manifest,
        '{images,0,storagePath}',
        '"organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/product/versions/QA-R1/41111111-1111-4111-8111-111111111111/wrong.png"'
      )
    );
    RAISE EXCEPTION 'expected wrong-path rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT IN (
      'FIXTURE_IMAGE_PATH_INVALID',
      'FIXTURE_STORAGE_OBJECT_INVALID'
    ) THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        jsonb_set(
          v_manifest,
          '{images,1,category}',
          '"PRODUCT"'
        ),
        '{images,1,storagePath}',
        to_jsonb(
          'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/product/versions/QA-R1/42222222-2222-4222-8222-222222222222/source.png'::text
        )
      )
    );
    RAISE EXCEPTION 'expected duplicate-category rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_IMAGE_DUPLICATE' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        v_manifest,
        '{images,0,sha256}',
        'null'::jsonb
      )
    );
    RAISE EXCEPTION 'expected null-sha rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_FIXTURE_IMAGE_KEYS' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        v_manifest,
        '{images,0,storageObjectVersion}',
        'null'::jsonb
      )
    );
    RAISE EXCEPTION 'expected null-version rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_FIXTURE_IMAGE_KEYS' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      jsonb_set(
        v_manifest,
        '{baselineId}',
        'null'::jsonb
      )
    );
    RAISE EXCEPTION 'expected null-baseline rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_FINALIZE_TYPES' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

UPDATE storage.objects
SET owner_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
WHERE id = '51111111-1111-4111-8111-111111111111';
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_manifest()
    );
    RAISE EXCEPTION 'expected forged-owner rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_STORAGE_OBJECT_INVALID' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
UPDATE storage.objects
SET owner_id = '3c0d8866-498a-4e61-a602-28b7a83f75f5'
WHERE id = '51111111-1111-4111-8111-111111111111';

UPDATE storage.objects
SET version = NULL
WHERE id = '52222222-2222-4222-8222-222222222222';
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_manifest()
    );
    RAISE EXCEPTION 'expected null-version rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_STORAGE_OBJECT_INVALID' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
UPDATE storage.objects
SET version = 'object-version-film'
WHERE id = '52222222-2222-4222-8222-222222222222';

UPDATE storage.objects
SET metadata = jsonb_build_object('size', 128)
WHERE id = '53333333-3333-4333-8333-333333333333';
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_manifest()
    );
    RAISE EXCEPTION 'expected missing-mimetype rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_STORAGE_OBJECT_INVALID' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
UPDATE storage.objects
SET metadata = jsonb_build_object('mimetype', 'image/png', 'size', 128)
WHERE id = '53333333-3333-4333-8333-333333333333';

INSERT INTO public.wos_visual_baselines(
  id, organization_id, entity_type, entity_id, version_label, status
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'PRODUCTION_ORDER',
  '99999999-9999-4999-8999-999999999999',
  'QA-R1',
  'DRAFT'
);

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      public.test_fixture_manifest()
    );
    RAISE EXCEPTION 'expected mid-transaction baseline conflict';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF EXISTS (
    SELECT 1
    FROM public.wos_reference_images
    WHERE entity_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'mid-transaction failure left partial images';
  END IF;
END;
$$;
RESET ROLE;

DELETE FROM public.wos_visual_baselines
WHERE id = '33333333-3333-4333-8333-333333333333';

INSERT INTO public.wos_production_orders(
  id, organization_id, customer_name_snapshot, order_number, product_name,
  sales_owner_profile_id, project_owner_profile_id, priority, version_label,
  workflow_status, requested_quantity, current_batch_quantity,
  product_material, created_by_profile_id, version
) VALUES (
  '99999999-9999-4999-8999-999999999999',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'Historical Synthetic',
  'QA-NONPROD-88888888-8888-4888-8888-888888888888',
  'Historical Fixture',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  'MEDIUM',
  'QA-R1',
  'WAITING_MATERIAL',
  1,
  1,
  'QA NONPROD',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  1
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = '11111111-1111-4111-8111-111111111111'
      AND order_id = '22222222-2222-4222-8222-222222222222'
      AND stage = 'PREPARED'
      AND baseline_id IS NULL
      AND manifest_sha256 ~ '^[a-f0-9]{64}$'
  ) <> 1 THEN
    RAISE EXCEPTION 'PREPARE manifest mismatch';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'PREPARE_AND_NEGATIVE_ASSERTIONS=PASS' AS result;
