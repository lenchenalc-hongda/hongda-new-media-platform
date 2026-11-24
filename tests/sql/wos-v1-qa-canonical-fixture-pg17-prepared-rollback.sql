CREATE FUNCTION public.test_fixture_prepare_a()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'operation', 'PREPARE',
    'requestId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'orderId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'officeProfileId', 'f8adf44a-f04e-44b4-9c82-8b96508097bb'
  )
$$;
CREATE FUNCTION public.test_fixture_prepare_b()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'operation', 'PREPARE',
    'requestId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'orderId', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'officeProfileId', 'f8adf44a-f04e-44b4-9c82-8b96508097bb'
  )
$$;
CREATE FUNCTION public.test_fixture_prepare_c()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'operation', 'PREPARE',
    'requestId', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    'orderId', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'officeProfileId', 'f8adf44a-f04e-44b4-9c82-8b96508097bb'
  )
$$;
GRANT EXECUTE ON FUNCTION
  public.test_fixture_prepare_a(),
  public.test_fixture_prepare_b(),
  public.test_fixture_prepare_c()
TO service_role;

INSERT INTO public.profiles(id, user_id, org_id, role, is_active) VALUES (
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'admin',
  true
);

SET ROLE service_role;
DO $$
BEGIN
  PERFORM public.wos_qa_create_canonical_v1_fixture(
    public.test_fixture_prepare_a()
  );
END;
$$;
RESET ROLE;

UPDATE public.wos_production_orders
SET created_by_profile_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'expected PREPARED actor-drift rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_ORDER_ACTOR_MISMATCH' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.wos_production_orders
    WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) THEN
    RAISE EXCEPTION 'actor-drift rejection deleted fixture rows';
  END IF;
END;
$$;
RESET ROLE;
UPDATE public.wos_production_orders
SET created_by_profile_id = 'f8adf44a-f04e-44b4-9c82-8b96508097bb'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

INSERT INTO storage.objects(
  id, bucket_id, name, owner_id, version, updated_at, metadata,
  archived_at, is_delete_marker
) VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/images/product/versions/QA-R1/11111111-1111-4111-8111-111111111111/source.png',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  'orphan-version',
  '2026-11-24T12:00:00.111111+00:00',
  '{"mimetype":"image/png","size":128}'::jsonb,
  NULL,
  false
);

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'expected PREPARED orphan Storage rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_STORAGE_OBJECTS_REMAIN' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
DELETE FROM storage.objects
WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';

INSERT INTO public.wos_status_history(
  organization_id, entity_type, entity_id, previous_status, next_status,
  actor_profile_id, actor_role, reason_code
) VALUES (
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'PRODUCTION_ORDER',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  NULL,
  'WAITING_MATERIAL',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  'admin',
  'UNEXPECTED_REFERENCE'
);

SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'expected PREPARED external-reference rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_HAS_EXTERNAL_REFERENCES' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
DELETE FROM public.wos_status_history
WHERE entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

SET ROLE service_role;
DO $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    PERFORM public.wos_qa_create_canonical_v1_fixture(
      '{"operation":"PREPARE"}'::jsonb
    );
    RAISE EXCEPTION 'expected malformed PREPARE failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_PREPARE_KEYS' THEN RAISE; END IF;
  END;
  v_result := public.wos_qa_rollback_canonical_v1_fixture(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  IF v_result->>'status' <> 'ROLLED_BACK'
    OR v_result->>'stage' <> 'PREPARED'
    OR (v_result->>'deletedOrders')::integer <> 1
    OR (v_result->>'deletedReferenceImages')::integer <> 0
    OR (v_result->>'deletedBaselines')::integer <> 0
    OR (v_result->>'storageObjectsDeletedBySql')::integer <> 0 THEN
    RAISE EXCEPTION 'PREPARED rollback result mismatch: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_production_orders
    WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) THEN
    RAISE EXCEPTION 'PREPARED rollback left rows';
  END IF;
END;
$$;
RESET ROLE;

SELECT 'PREPARED_ROLLBACK_ASSERTIONS=PASS' AS result;
