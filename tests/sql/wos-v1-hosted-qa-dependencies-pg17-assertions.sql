\set ON_ERROR_STOP on

DO $checks$
DECLARE
  result jsonb;
BEGIN
  IF to_regprocedure('public.wos_p7_service_storage_snapshot(text)') IS NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'QA_EDGE_FUNCTION_MISSING';
  END IF;
  IF has_function_privilege(
      'authenticated',
      'public.wos_p7_service_storage_snapshot(text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'QA_EDGE_FUNCTION_BROWSER_EXPOSED';
  END IF;
  IF has_table_privilege(
      'authenticated',
      'public.wos_qa_verified_image_proofs',
      'INSERT'
    )
    OR has_table_privilege(
      'authenticated',
      'public.wos_qa_verified_image_proofs',
      'UPDATE'
    )
  THEN
    RAISE EXCEPTION 'QA_PROOF_TABLE_BROWSER_WRITE_EXPOSED';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub',
    '10101010-1010-4010-8010-101010101010', true);
END;
$checks$;

INSERT INTO public.wos_production_orders (
  id, organization_id, order_number, workflow_status, version, version_label,
  customer_name_snapshot, product_name, product_material, requested_quantity,
  current_batch_quantity
) VALUES (
  '77777777-7777-4777-8777-777777777777',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'QA-NONPROD-V1-EDGE-001',
  'DRAFT',
  2,
  'V1',
  'QA Edge Customer',
  'QA Edge Product',
  'QA Edge Material',
  100,
  100
);

INSERT INTO storage.objects (
  id, bucket_id, name, version, updated_at, owner_id, metadata
) VALUES (
  '71000000-0000-4000-8000-000000000021',
  'wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
    || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
    || '72000000-0000-4000-8000-000000000021/source.png',
  'qa-version-1',
  '2026-11-23 00:00:00+00',
  '10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}'::jsonb
);

DO $proof$
DECLARE
  snapshot jsonb;
  result jsonb;
  replay jsonb;
  renewal jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  snapshot := public.wos_p7_service_storage_snapshot(
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
      || '72000000-0000-4000-8000-000000000021/source.png'
  );
  IF snapshot->>'id' IS NULL
    OR snapshot->>'version' <> 'qa-version-1'
    OR snapshot->>'updatedAt' IS NULL
  THEN
    RAISE EXCEPTION 'QA_SNAPSHOT_CONTRACT_INVALID';
  END IF;
  result := public.wos_p7_record_trusted_image_proof(
    '72000000-0000-4000-8000-000000000021',
    '77777777-7777-4777-8777-777777777777',
    '10101010-1010-4010-8010-101010101010',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
      || '72000000-0000-4000-8000-000000000021/source.png',
    '71000000-0000-4000-8000-000000000021',
    'qa-version-1',
    '2026-11-23 00:00:00+00',
    repeat('a', 64)
  );
  IF result->>'status' <> 'VERIFIED'
    OR result->>'category' <> 'product'
    OR result->>'sha256' <> repeat('a', 64)
  THEN
    RAISE EXCEPTION 'QA_PROOF_CONTRACT_INVALID';
  END IF;
  replay := public.wos_p7_record_trusted_image_proof(
    '72000000-0000-4000-8000-000000000021',
    '77777777-7777-4777-8777-777777777777',
    '10101010-1010-4010-8010-101010101010',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
      || '72000000-0000-4000-8000-000000000021/source.png',
    '71000000-0000-4000-8000-000000000021',
    'qa-version-1',
    '2026-11-23 00:00:00+00',
    repeat('a', 64)
  );
  IF replay->>'status' <> 'REPLAYED' THEN
    RAISE EXCEPTION 'QA_PROOF_IDEMPOTENCY_FAILED';
  END IF;

  PERFORM set_config('wos.qa.actor_user_id',
    '10101010-1010-4010-8010-101010101010', true);
  PERFORM set_config('wos.qa.trusted_proof_rpc', '1', true);
  UPDATE public.wos_qa_verified_image_proofs
  SET expires_at = clock_timestamp() - interval '1 minute'
  WHERE image_id = '72000000-0000-4000-8000-000000000021';
  renewal := public.wos_v1_renew_expired_image_proof(
    '72000000-0000-4000-8000-000000000021',
    '77777777-7777-4777-8777-777777777777',
    '10101010-1010-4010-8010-101010101010',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
      || '72000000-0000-4000-8000-000000000021/source.png',
    '71000000-0000-4000-8000-000000000021',
    'qa-version-1',
    '2026-11-23 00:00:00+00',
    repeat('a', 64)
  );
  IF renewal->>'status' <> 'RENEWED' THEN
    RAISE EXCEPTION 'QA_PROOF_RENEWAL_FAILED';
  END IF;
END;
$proof$;

DO $negative$
DECLARE
  denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      '72000000-0000-4000-8000-000000000021',
      '77777777-7777-4777-8777-777777777777',
      '10101010-1010-4010-8010-101010101010',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
        || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
        || '72000000-0000-4000-8000-000000000021/source.png',
      '71000000-0000-4000-8000-000000000021',
      NULL,
      '2026-11-23 00:00:00+00',
      repeat('b', 64)
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_NULL_STORAGE_VERSION_ACCEPTED';
  END IF;

  denied := false;
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.wos_p7_service_storage_snapshot(
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '77777777-7777-4777-8777-777777777777/images/product/versions/V1/'
      || '72000000-0000-4000-8000-000000000021/source.png'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_AUTHENTICATED_SNAPSHOT_ACCEPTED';
  END IF;
END;
$negative$;

SELECT 'WOS_V1_HOSTED_QA_DEPENDENCIES_PG17=PASS' AS check_name;
