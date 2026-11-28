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
      'anon',
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
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
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
  IF NOT has_function_privilege(
      'service_role',
      'public.wos_p7_service_storage_snapshot(text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'QA_EDGE_SERVICE_ROLE_EXECUTE_MISSING';
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

INSERT INTO public.wos_production_orders (
  id, organization_id, order_number, workflow_status, version, version_label,
  customer_name_snapshot, product_name, product_material, requested_quantity,
  current_batch_quantity
) VALUES (
  'adadadad-adad-4dad-8dad-adadadadadad',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'QA-NONPROD-V1-EDGE-V2-REVISION-001',
  'NEEDS_INFORMATION',
  5,
  'V2',
  'QA V2 Revision Customer',
  'QA V2 Revision Product',
  'QA V2 Revision Material',
  100,
  100
);

INSERT INTO public.wos_production_orders (
  id, organization_id, order_number, workflow_status, version, version_label,
  customer_name_snapshot, product_name, product_material, requested_quantity,
  current_batch_quantity
) VALUES
(
  '88888888-8888-4888-8888-888888888888',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'QA-NONPROD-V1-EDGE-REVISION-001',
  'WAITING_MATERIAL',
  7,
  'QA-R6',
  'QA Revision Customer',
  'QA Revision Product',
  'QA Revision Material',
  100,
  100
),
(
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'QA-NONPROD-V1-EDGE-REVISION-OTHER',
  'WAITING_MATERIAL',
  7,
  'QA-R6',
  'QA Other Customer',
  'QA Other Product',
  'QA Other Material',
  100,
  100
),
(
  'abababab-abab-4bab-8bab-abababababab',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'QA-NONPROD-V1-EDGE-BAD-DRAFT',
  'DRAFT',
  2,
  'QA-R6',
  'QA Bad Draft Customer',
  'QA Bad Draft Product',
  'QA Bad Draft Material',
  100,
  100
),
(
  'acacacac-acac-4cac-8cac-acacacacacac',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'QA-NONPROD-V1-EDGE-BAD-REVISION',
  'WAITING_MATERIAL',
  7,
  'V1',
  'QA Bad Revision Customer',
  'QA Bad Revision Product',
  'QA Bad Revision Material',
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

INSERT INTO storage.objects (
  id, bucket_id, name, version, updated_at, owner_id, metadata
) VALUES (
  '71000000-0000-4000-8000-000000000022',
  'wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
    || 'adadadad-adad-4dad-8dad-adadadadadad/images/product/versions/V2/'
    || '72000000-0000-4000-8000-000000000022/source.png',
  'qa-v2-revision-version-1',
  '2026-11-23 00:30:00+00',
  '10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}'::jsonb
);

INSERT INTO storage.objects (
  id, bucket_id, name, version, updated_at, owner_id, metadata
) VALUES (
  '71000000-0000-4000-8000-000000000031',
  'wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
    || '88888888-8888-4888-8888-888888888888/images/product/versions/QA-R6/'
    || '72000000-0000-4000-8000-000000000031/source.png',
  'qa-revision-version-1',
  '2026-11-23 01:00:00+00',
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
  result := public.wos_p7_record_trusted_image_proof(
    '72000000-0000-4000-8000-000000000022',
    'adadadad-adad-4dad-8dad-adadadadadad',
    '10101010-1010-4010-8010-101010101010',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || 'adadadad-adad-4dad-8dad-adadadadadad/images/product/versions/V2/'
      || '72000000-0000-4000-8000-000000000022/source.png',
    '71000000-0000-4000-8000-000000000022',
    'qa-v2-revision-version-1',
    '2026-11-23 00:30:00+00',
    repeat('b', 64)
  );
  IF result->>'status' <> 'VERIFIED' THEN
    RAISE EXCEPTION 'QA_V2_NEEDS_INFORMATION_PROOF_REJECTED';
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

DO $revision$
DECLARE
  result jsonb;
  renewal jsonb;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub',
    '10101010-1010-4010-8010-101010101010', true);
  UPDATE public.wos_qa_p2_m2_gate
  SET enabled = true,
      enabled_until = clock_timestamp() + interval '10 minutes',
      approval_reference = 'QA-OWNER-GATE-TEST',
      allowed_order_id = '88888888-8888-4888-8888-888888888888',
      allowed_organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updated_at = clock_timestamp()
  WHERE gate_name = 'M2_OFFICE_WRITES';

  result := public.wos_p7_record_trusted_image_proof(
    '72000000-0000-4000-8000-000000000031',
    '88888888-8888-4888-8888-888888888888',
    '10101010-1010-4010-8010-101010101010',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '88888888-8888-4888-8888-888888888888/images/product/versions/QA-R6/'
      || '72000000-0000-4000-8000-000000000031/source.png',
    '71000000-0000-4000-8000-000000000031',
    'qa-revision-version-1',
    '2026-11-23 01:00:00+00',
    repeat('c', 64)
  );
  IF result->>'status' <> 'VERIFIED' THEN
    RAISE EXCEPTION 'QA_REVISION_PROOF_REJECTED';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      '72000000-0000-4000-8000-000000000032',
      '88888888-8888-4888-8888-888888888888',
      '10101010-1010-4010-8010-101010101010',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
        || '88888888-8888-4888-8888-888888888888/images/product/versions/QA-R5/'
        || '72000000-0000-4000-8000-000000000032/source.png',
      '71000000-0000-4000-8000-000000000032',
      'qa-old-version',
      '2026-11-23 01:00:00+00',
      repeat('d', 64)
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_OLD_REVISION_ACCEPTED';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      '72000000-0000-4000-8000-000000000033',
      '99999999-9999-4999-8999-999999999999',
      '10101010-1010-4010-8010-101010101010',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
        || '99999999-9999-4999-8999-999999999999/images/product/versions/QA-R6/'
        || '72000000-0000-4000-8000-000000000033/source.png',
      '71000000-0000-4000-8000-000000000033',
      'qa-other-revision',
      '2026-11-23 01:00:00+00',
      repeat('e', 64)
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_WRONG_ORDER_GATE_ACCEPTED';
  END IF;

  UPDATE public.wos_qa_p2_m2_gate
  SET enabled = false,
      enabled_until = NULL,
      approval_reference = 'NOT_AUTHORIZED',
      allowed_order_id = NULL,
      allowed_organization_id = NULL,
      updated_at = clock_timestamp()
  WHERE gate_name = 'M2_OFFICE_WRITES';
  UPDATE public.wos_qa_p2_m2_gate
  SET enabled = true,
      enabled_until = clock_timestamp() + interval '10 minutes',
      approval_reference = 'QA-WRONG-GATE-TEST',
      allowed_order_id = '88888888-8888-4888-8888-888888888888',
      allowed_organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updated_at = clock_timestamp()
  WHERE gate_name = 'M2_OPERATOR_WRITES';

  denied := false;
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      '72000000-0000-4000-8000-000000000034',
      '88888888-8888-4888-8888-888888888888',
      '10101010-1010-4010-8010-101010101010',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
        || '88888888-8888-4888-8888-888888888888/images/product/versions/QA-R6/'
        || '72000000-0000-4000-8000-000000000034/source.png',
      '71000000-0000-4000-8000-000000000034',
      'qa-wrong-gate',
      '2026-11-23 01:00:00+00',
      repeat('f', 64)
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_WRONG_GATE_ACCEPTED';
  END IF;

  UPDATE public.wos_qa_p2_m2_gate
  SET enabled = false,
      enabled_until = NULL,
      approval_reference = 'NOT_AUTHORIZED',
      allowed_order_id = NULL,
      allowed_organization_id = NULL,
      updated_at = clock_timestamp();

  denied := false;
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      '72000000-0000-4000-8000-000000000035',
      'abababab-abab-4bab-8bab-abababababab',
      '10101010-1010-4010-8010-101010101010',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
        || 'abababab-abab-4bab-8bab-abababababab/images/product/versions/QA-R6/'
        || '72000000-0000-4000-8000-000000000035/source.png',
      '71000000-0000-4000-8000-000000000035',
      'qa-bad-draft',
      '2026-11-23 01:00:00+00',
      repeat('1', 64)
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_DRAFT_REVISION_LABEL_ACCEPTED';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.wos_p7_record_trusted_image_proof(
      '72000000-0000-4000-8000-000000000036',
      'acacacac-acac-4cac-8cac-acacacacacac',
      '10101010-1010-4010-8010-101010101010',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
        || 'acacacac-acac-4cac-8cac-acacacacacac/images/product/versions/V1/'
        || '72000000-0000-4000-8000-000000000036/source.png',
      '71000000-0000-4000-8000-000000000036',
      'qa-bad-revision',
      '2026-11-23 01:00:00+00',
      repeat('2', 64)
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'QA_REVISION_NUMERIC_LABEL_ACCEPTED';
  END IF;

  UPDATE public.wos_qa_p2_m2_gate
  SET enabled = true,
      enabled_until = clock_timestamp() + interval '10 minutes',
      approval_reference = 'QA-OWNER-GATE-RENEWAL',
      allowed_order_id = '88888888-8888-4888-8888-888888888888',
      allowed_organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updated_at = clock_timestamp()
  WHERE gate_name = 'M2_OFFICE_WRITES';
  PERFORM set_config('wos.qa.actor_user_id',
    '10101010-1010-4010-8010-101010101010', true);
  PERFORM set_config('wos.qa.trusted_proof_rpc', '1', true);
  UPDATE public.wos_qa_verified_image_proofs
  SET expires_at = clock_timestamp() - interval '1 minute'
  WHERE image_id = '72000000-0000-4000-8000-000000000031';
  renewal := public.wos_v1_renew_expired_image_proof(
    '72000000-0000-4000-8000-000000000031',
    '88888888-8888-4888-8888-888888888888',
    '10101010-1010-4010-8010-101010101010',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
      || '88888888-8888-4888-8888-888888888888/images/product/versions/QA-R6/'
      || '72000000-0000-4000-8000-000000000031/source.png',
    '71000000-0000-4000-8000-000000000031',
    'qa-revision-version-1',
    '2026-11-23 01:00:00+00',
    repeat('c', 64)
  );
  IF renewal->>'status' <> 'RENEWED' THEN
    RAISE EXCEPTION 'QA_REVISION_RENEWAL_FAILED';
  END IF;

  UPDATE public.wos_qa_p2_m2_gate
  SET enabled = false,
      enabled_until = NULL,
      approval_reference = 'NOT_AUTHORIZED',
      allowed_order_id = NULL,
      allowed_organization_id = NULL,
      updated_at = clock_timestamp();
END;
$revision$;

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
