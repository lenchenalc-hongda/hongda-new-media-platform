INSERT INTO public.wos_reference_images(
  id, organization_id, entity_type, entity_id, category, storage_bucket,
  storage_path, file_name, mime_type, file_size, version_label, image_status,
  uploaded_by_profile_id
) VALUES (
  '45555555-5555-4555-8555-555555555555',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'PRODUCTION_ORDER',
  '22222222-2222-4222-8222-222222222222',
  'OTHER',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/other/versions/QA-R1/45555555-5555-4555-8555-555555555555/source.png',
  'source.png',
  'image/png',
  128,
  'QA-R1',
  'UPLOADING',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb'
);

SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'expected extra-image rollback rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_IMAGE_SET_CHANGED' THEN RAISE; END IF;
  END;
END;
$$;
RESET request.jwt.claim.role;
RESET ROLE;
DELETE FROM public.wos_reference_images
WHERE id = '45555555-5555-4555-8555-555555555555';

INSERT INTO public.wos_reference_images(
  id, organization_id, entity_type, entity_id, category, storage_bucket,
  storage_path, file_name, mime_type, file_size, version_label, image_status,
  uploaded_by_profile_id
) VALUES (
  '46666666-6666-4666-8666-666666666666',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'PRODUCTION_ORDER',
  '22222222-2222-4222-8222-222222222222',
  'OTHER',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/other/versions/QA-R2/46666666-6666-4666-8666-666666666666/source.png',
  'source.png',
  'image/png',
  128,
  'QA-R2',
  'UPLOADING',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb'
);

SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'expected extra QA-R2 image rollback rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_IMAGE_SET_CHANGED' THEN RAISE; END IF;
  END;
END;
$$;
RESET request.jwt.claim.role;
RESET ROLE;
DELETE FROM public.wos_reference_images
WHERE id = '46666666-6666-4666-8666-666666666666';

UPDATE public.wos_production_orders
SET version = 2
WHERE id = '22222222-2222-4222-8222-222222222222';
SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'expected order-version drift rollback rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_ROLLBACK_TARGET_INVALID' THEN RAISE; END IF;
  END;
END;
$$;
RESET request.jwt.claim.role;
RESET ROLE;
UPDATE public.wos_production_orders
SET version = 1
WHERE id = '22222222-2222-4222-8222-222222222222';

INSERT INTO public.wos_qa_verified_image_proofs(
  image_id, organization_id, order_id, actor_user_id, storage_bucket,
  storage_path, storage_object_id, storage_object_version,
  storage_object_updated_at, verified_sha256, verified_at, expires_at
) VALUES (
  '41111111-1111-4111-8111-111111111111',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '22222222-2222-4222-8222-222222222222',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  'wos-private',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/22222222-2222-4222-8222-222222222222/images/product/versions/QA-R1/41111111-1111-4111-8111-111111111111/source.png',
  '51111111-1111-4111-8111-111111111111',
  'object-version-product',
  '2026-11-24T10:00:00.111111+00:00',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '2026-11-24T10:01:00+00:00',
  '2026-11-24T10:10:00+00:00'
);
INSERT INTO public.wos_qa_p2_action_receipts(order_id)
VALUES ('22222222-2222-4222-8222-222222222222');

SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';

DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'expected Proof-reference rollback rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_HAS_EXTERNAL_REFERENCES' THEN RAISE; END IF;
  END;
END;
$$;

RESET request.jwt.claim.role;
RESET ROLE;
DROP POLICY IF EXISTS test_proof_delete ON public.wos_qa_verified_image_proofs;
DELETE FROM public.wos_qa_verified_image_proofs
WHERE order_id = '22222222-2222-4222-8222-222222222222';
DELETE FROM public.wos_qa_p2_action_receipts
WHERE order_id = '22222222-2222-4222-8222-222222222222';

SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';

DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_rollback_canonical_v1_fixture(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      '99999999-9999-4999-8999-999999999999'
    );
    RAISE EXCEPTION 'expected historical rollback rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIXTURE_ROLLBACK_TARGET_INVALID' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.wos_qa_rollback_canonical_v1_fixture(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  );
  IF v_result->>'status' <> 'ROLLED_BACK'
    OR (v_result->>'deletedReferenceImages')::integer <> 4
    OR (v_result->>'deletedBaselines')::integer <> 1
    OR (v_result->>'deletedOrders')::integer <> 1
    OR (v_result->>'storageObjectsDeletedBySql')::integer <> 0
    OR (v_result->>'storageCleanupRequired')::boolean <> true THEN
    RAISE EXCEPTION 'rollback result mismatch: %', v_result;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.wos_production_orders
    WHERE id = '22222222-2222-4222-8222-222222222222'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_reference_images
    WHERE entity_id = '22222222-2222-4222-8222-222222222222'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_visual_baselines
    WHERE entity_id = '22222222-2222-4222-8222-222222222222'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_visual_baseline_items
    WHERE baseline_id = '33333333-3333-4333-8333-333333333333'
  ) THEN
    RAISE EXCEPTION 'fixture rollback left rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = '11111111-1111-4111-8111-111111111111'
      OR order_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'fixture manifest rollback left rows';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_production_orders
    WHERE id = '99999999-9999-4999-8999-999999999999'
  ) <> 1 THEN
    RAISE EXCEPTION 'historical order was modified';
  END IF;
END;
$$;

DO $$
DECLARE
  v_fn regprocedure :=
    'public.wos_qa_create_canonical_v1_fixture(jsonb)'::regprocedure;
  v_rb regprocedure :=
    'public.wos_qa_rollback_canonical_v1_fixture(uuid,uuid)'::regprocedure;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_fn)
    OR (SELECT prosecdef FROM pg_proc WHERE oid = v_rb) THEN
    RAISE EXCEPTION 'fixture functions must be SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    OR has_function_privilege('anon', v_rb, 'EXECUTE')
    OR has_function_privilege('authenticated', v_rb, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_rb, 'EXECUTE') THEN
    RAISE EXCEPTION 'fixture function ACL mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(p.proacl) acl
    WHERE p.oid IN (v_fn, v_rb)
      AND (
        acl.is_grantable
        OR acl.grantee NOT IN (
          p.proowner,
          'service_role'::regrole
        )
      )
  ) THEN
    RAISE EXCEPTION 'fixture function has disallowed grant';
  END IF;
  IF has_table_privilege(
    'anon',
    'public.wos_qa_canonical_fixture_manifests',
    'SELECT,INSERT,UPDATE,DELETE'
  ) OR has_table_privilege(
    'authenticated',
    'public.wos_qa_canonical_fixture_manifests',
    'SELECT,INSERT,UPDATE,DELETE'
  ) OR NOT has_table_privilege(
    'service_role',
    'public.wos_qa_canonical_fixture_manifests',
    'SELECT,INSERT,UPDATE,DELETE'
  ) THEN
    RAISE EXCEPTION 'fixture manifest table ACL mismatch';
  END IF;
END;
$$;

RESET request.jwt.claim.role;
RESET ROLE;

SELECT 'ROLLBACK_AND_SECURITY_ASSERTIONS=PASS' AS result;
