\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 only. Exercises RC02 order-scoped Gate behavior
-- through all eight V1 write RPCs with real role/JWT contexts and synthetic
-- Storage object metadata. No QA or Production connection is used.

DO $preflight$
BEGIN
  IF current_database() <> 'wos_v1_rollback_ci' THEN
    RAISE EXCEPTION 'WOS_V1_RC02_GATE_REQUIRES_DISPOSABLE_DB';
  END IF;
  IF to_regclass('wos_v1_rc02_safety.rc02_business_grants') IS NULL
    OR to_regprocedure(
      'public.wos_create_production_order(uuid,jsonb)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_operator_review_correction(uuid,integer,uuid,text)'
    ) IS NULL
    OR to_regclass('public.wos_verified_image_proofs') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RC02_GATE_PREREQUISITE_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM wos_v1_rc02_safety.rc02_business_grants
  ) THEN
    RAISE EXCEPTION 'WOS_V1_RC02_GATE_REQUIRES_EMPTY_INSTALL';
  END IF;
  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'INSERT,UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'wos_v1_rc02_safety.rc02_business_grants',
      'SELECT,INSERT,UPDATE,DELETE'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_RC02_GATE_INSTALL_NOT_FAIL_CLOSED';
  END IF;
END;
$preflight$;

INSERT INTO auth.users(id,email) VALUES
  ('10101010-1010-4010-8010-101010101010', 'rc02-office@example.test'),
  ('10101010-1010-4010-8010-101010101011', 'rc02-office-2@example.test'),
  ('20202020-2020-4020-8020-202020202020', 'rc02-operator@example.test'),
  ('30303030-3030-4030-8030-303030303030', 'rc02-viewer@example.test'),
  ('40404040-4040-4040-8040-404040404040', 'rc02-foreign@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations(id,name) VALUES
  ('0ff53d93-2b9e-48b9-8113-a4768c39cdd2', 'RC02 QA Organization'),
  ('fbdb0989-ae25-4ba4-92f9-3266cc845977', 'RC02 Foreign QA Organization')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.profiles(id,user_id,org_id,full_name,role,is_active) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    '10101010-1010-4010-8010-101010101010',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'RC02 Office Admin',
    'admin',
    true
  ),
  (
    '11111111-1111-4111-8111-111111111112',
    '10101010-1010-4010-8010-101010101011',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'RC02 Second Office Manager',
    'manager',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '20202020-2020-4020-8020-202020202020',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'RC02 Operator',
    'operator',
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '30303030-3030-4030-8030-303030303030',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'RC02 Viewer',
    'viewer',
    true
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '40404040-4040-4040-8040-404040404040',
    'fbdb0989-ae25-4ba4-92f9-3266cc845977',
    'RC02 Foreign Manager',
    'manager',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  org_id = EXCLUDED.org_id,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

INSERT INTO public.cpc_customer_references(
  id, org_id, reference_kind, external_source, external_customer_id,
  display_name_snapshot, source_synced_at, status
) VALUES (
  '81000000-0000-4000-8000-000000000001',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'canonical',
  'rc02-pg17',
  'RC02-SYNTHETIC-CUSTOMER',
  'RC02 Synthetic Customer',
  clock_timestamp(),
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  display_name_snapshot = EXCLUDED.display_name_snapshot,
  status = EXCLUDED.status,
  source_synced_at = EXCLUDED.source_synced_at,
  updated_at = clock_timestamp();

INSERT INTO public.cpc_projects(
  id, org_id, customer_reference_id, title, objective_summary,
  project_type, owner_profile_id, status, stage, waiting_on,
  next_check_at, priority,
  created_by_profile_id
) VALUES (
  '82000000-0000-4000-8000-000000000001',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '81000000-0000-4000-8000-000000000001',
  'RC02 Synthetic Project',
  'RC02 order-scoped Gate integration fixture',
  'transfer_film',
  '11111111-1111-4111-8111-111111111111',
  'active',
  'discovery',
  'customer',
  clock_timestamp() + interval '1 day',
  'medium',
  '11111111-1111-4111-8111-111111111111'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  owner_profile_id = EXCLUDED.owner_profile_id,
  status = EXCLUDED.status,
  updated_at = clock_timestamp();

GRANT EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_office_resubmit_order(
  uuid,integer,uuid,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_operator_review_correction(
  uuid,integer,uuid,text
) TO authenticated;

DO $authorize_create$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Synthetic Product',
    'priority', 'HIGH',
    'requestedQuantity', 100,
    'currentBatchQuantity', 100,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'surfaceTreatment', 'Synthetic matte',
    'patternScope', 'FULL',
    'seamTolerance', '1mm',
    'positionReference', 'RC02 synthetic registration',
    'customerAcceptanceStandard', 'RC02 synthetic acceptance',
    'packagingMethod', 'RC02 synthetic carton',
    'cartonQuantity', 20,
    'labelMarkingRule', 'RC02 synthetic label',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
  v_fingerprint text;
BEGIN
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'requestId', '71000000-0000-4000-8000-000000000001'::uuid,
    'actorUserId', '10101010-1010-4010-8010-101010101010'::uuid,
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid,
    'payload', v_payload - ARRAY[
      'customerNameSnapshot',
      'projectNameSnapshot',
      'salesOwnerProfileId',
      'projectOwnerProfileId'
    ]
  )::text, 'UTF8')), 'hex');

  INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, enabled_until, approval_reference
  ) VALUES (
    'WOS-V1-RC02-PG17-SYNTHETIC-71000000',
    '71000000-0000-4000-8000-000000000001',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    v_fingerprint,
    'AUTHORIZED',
    clock_timestamp() + interval '10 minutes',
    'RC02-PG17-SYNTHETIC-AUTHORIZATION'
  );
END;
$authorize_create$;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $create_order$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Synthetic Product',
    'priority', 'HIGH',
    'requestedQuantity', 100,
    'currentBatchQuantity', 100,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'surfaceTreatment', 'Synthetic matte',
    'patternScope', 'FULL',
    'seamTolerance', '1mm',
    'positionReference', 'RC02 synthetic registration',
    'customerAcceptanceStandard', 'RC02 synthetic acceptance',
    'packagingMethod', 'RC02 synthetic carton',
    'cartonQuantity', 20,
    'labelMarkingRule', 'RC02 synthetic label',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
  v_response jsonb;
  v_order_id uuid;
BEGIN
  v_response := public.wos_create_production_order(
    '71000000-0000-4000-8000-000000000001',
    v_payload
  );
  SELECT id INTO v_order_id
  FROM public.wos_production_orders
  WHERE organization_id = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
    AND order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001';
  IF v_response->>'status' <> 'CREATED'
    OR v_response->>'orderId' IS DISTINCT FROM v_order_id::text
    OR v_order_id IS NULL
  THEN
    RAISE EXCEPTION 'RC02_CREATE_ATOMIC_BIND_FAILED: %', v_response;
  END IF;
  v_response := public.wos_create_production_order(
    '71000000-0000-4000-8000-000000000001',
    v_payload
  );
  IF v_response->>'status' <> 'REPLAYED'
    OR v_response->>'orderId' IS DISTINCT FROM v_order_id::text
  THEN
    RAISE EXCEPTION 'RC02_CREATE_REPLAY_FAILED: %', v_response;
  END IF;
END;
$create_order$;

DO $create_conflicts$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Changed Product',
    'priority', 'HIGH',
    'requestedQuantity', 100,
    'currentBatchQuantity', 100,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
BEGIN
  BEGIN
    PERFORM public.wos_create_production_order(
      '71000000-0000-4000-8000-000000000001',
      v_payload
    );
    RAISE EXCEPTION 'RC02_CREATE_PAYLOAD_CONFLICT_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;

  BEGIN
    PERFORM public.wos_create_production_order(
      '71000000-0000-4000-8000-000000000002',
      jsonb_set(v_payload, '{orderNumber}',
        to_jsonb(
          'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000002'::text
        ))
    );
    RAISE EXCEPTION 'RC02_SECOND_ORDER_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$create_conflicts$;

RESET ROLE;

DO $create_binding$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM wos_v1_rc02_safety.rc02_business_grants grant_row
    JOIN public.wos_production_orders production_order
      ON production_order.id = grant_row.created_order_id
    WHERE grant_row.request_id = '71000000-0000-4000-8000-000000000001'
      AND grant_row.state = 'ORDER_BOUND'
      AND grant_row.bound_at IS NOT NULL
      AND grant_row.enabled_until > clock_timestamp()
      AND production_order.order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'RC02_CREATE_GRANT_NOT_ATOMICALLY_BOUND';
  END IF;
END;
$create_binding$;

-- The synthetic PNG binaries are represented by exact object metadata. Gate C
-- separately owns byte/CRC/SHA verification; this suite tests database scope.
SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

INSERT INTO storage.objects(
  id,bucket_id,name,owner_id,metadata,version,updated_at
) VALUES
  (
    '63100000-0000-4000-8000-000000000001',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (
        SELECT id::text FROM public.wos_production_orders
        WHERE order_number =
          'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
      )
      || '/images/product/versions/V1/73100000-0000-4000-8000-000000000001/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'rc02-v1-product',
    '2026-11-25T01:00:00.123456Z'
  ),
  (
    '63100000-0000-4000-8000-000000000002',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (
        SELECT id::text FROM public.wos_production_orders
        WHERE order_number =
          'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
      )
      || '/images/film-pattern/versions/V1/73100000-0000-4000-8000-000000000002/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"101"}'::jsonb,
    'rc02-v1-film',
    '2026-11-25T01:00:01.123456Z'
  ),
  (
    '63100000-0000-4000-8000-000000000003',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (
        SELECT id::text FROM public.wos_production_orders
        WHERE order_number =
          'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
      )
      || '/images/customer-approved-sample/versions/V1/73100000-0000-4000-8000-000000000003/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"102"}'::jsonb,
    'rc02-v1-customer',
    '2026-11-25T01:00:02.123456Z'
  ),
  (
    '63100000-0000-4000-8000-000000000004',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (
        SELECT id::text FROM public.wos_production_orders
        WHERE order_number =
          'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
      )
      || '/images/signed-sample/versions/V1/73100000-0000-4000-8000-000000000004/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"103"}'::jsonb,
    'rc02-v1-signed',
    '2026-11-25T01:00:03.123456Z'
  );

DO $storage_scope_denials$
DECLARE
  v_order_id uuid;
  v_prefix text;
BEGIN
  SELECT id INTO v_order_id
  FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001';
  v_prefix := 'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
    || '/wos/production-order/' || v_order_id::text || '/images/';

  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '63400000-0000-4000-8000-000000000001',
      'wos-private',
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
        || '/wos/production-order/'
        || 'ffffffff-ffff-4fff-8fff-ffffffffffff'
        || '/images/'
        || 'product/versions/V1/73400000-0000-4000-8000-000000000001/source.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"100"}'::jsonb,
      'rc02-wrong-order',
      clock_timestamp()
    );
    RAISE EXCEPTION 'RC02_WRONG_ORDER_UPLOAD_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '63400000-0000-4000-8000-000000000002',
      'wos-private',
      v_prefix
        || 'product/versions/V9/73400000-0000-4000-8000-000000000002/source.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"100"}'::jsonb,
      'rc02-wrong-version',
      clock_timestamp()
    );
    RAISE EXCEPTION 'RC02_WRONG_VERSION_UPLOAD_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '63400000-0000-4000-8000-000000000003',
      'wos-private',
      v_prefix
        || 'other/versions/V1/73400000-0000-4000-8000-000000000003/source.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"100"}'::jsonb,
      'rc02-wrong-category',
      clock_timestamp()
    );
    RAISE EXCEPTION 'RC02_WRONG_CATEGORY_UPLOAD_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '63400000-0000-4000-8000-000000000004',
      'wos-private',
      v_prefix
        || 'product/versions/V1/73400000-0000-4000-8000-000000000004/proof.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"100"}'::jsonb,
      'rc02-wrong-file',
      clock_timestamp()
    );
    RAISE EXCEPTION 'RC02_WRONG_FILENAME_UPLOAD_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '63100000-0000-4000-8000-000000000001',
      'wos-private',
      v_prefix
        || 'product/versions/V1/73100000-0000-4000-8000-000000000001/source.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"999"}'::jsonb,
      'rc02-upsert-product',
      clock_timestamp()
    )
    ON CONFLICT(bucket_id,name) DO UPDATE
    SET metadata = EXCLUDED.metadata,
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at;
    RAISE EXCEPTION 'RC02_STORAGE_UPSERT_ACCEPTED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END;
$storage_scope_denials$;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101011';

DO $wrong_office_upload$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT id INTO v_order_id
  FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001';
  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '63400000-0000-4000-8000-000000000005',
      'wos-private',
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
        || '/wos/production-order/' || v_order_id::text
        || '/images/product/versions/V1/73400000-0000-4000-8000-000000000005/source.png',
      '10101010-1010-4010-8010-101010101011',
      '{"mimetype":"image/png","size":"100"}'::jsonb,
      'rc02-wrong-office',
      clock_timestamp()
    );
    RAISE EXCEPTION 'RC02_WRONG_OFFICE_UPLOAD_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$wrong_office_upload$;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';

RESET ROLE;

-- The proof RPC verifies identity and Storage under SECURITY DEFINER. This
-- temporary SELECT grant only lets the synthetic service_role caller resolve
-- the generated order UUID inside test arguments; it is revoked below.
GRANT SELECT ON public.wos_production_orders TO service_role;

SET request.jwt.claims = '{"role":"service_role"}';
SET request.jwt.claim.sub = '';
SET ROLE service_role;

SELECT public.wos_p7_record_trusted_image_proof(
  '73100000-0000-4000-8000-000000000001',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/product/versions/V1/73100000-0000-4000-8000-000000000001/source.png',
  '63100000-0000-4000-8000-000000000001',
  'rc02-v1-product',
  '2026-11-25T01:00:00.123456Z',
  repeat('1', 64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73100000-0000-4000-8000-000000000002',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/film-pattern/versions/V1/73100000-0000-4000-8000-000000000002/source.png',
  '63100000-0000-4000-8000-000000000002',
  'rc02-v1-film',
  '2026-11-25T01:00:01.123456Z',
  repeat('2', 64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73100000-0000-4000-8000-000000000003',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/customer-approved-sample/versions/V1/73100000-0000-4000-8000-000000000003/source.png',
  '63100000-0000-4000-8000-000000000003',
  'rc02-v1-customer',
  '2026-11-25T01:00:02.123456Z',
  repeat('3', 64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73100000-0000-4000-8000-000000000004',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/signed-sample/versions/V1/73100000-0000-4000-8000-000000000004/source.png',
  '63100000-0000-4000-8000-000000000004',
  'rc02-v1-signed',
  '2026-11-25T01:00:03.123456Z',
  repeat('4', 64)
);

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73100000-0000-4000-8000-000000000001',
  'PRODUCT',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/product/versions/V1/73100000-0000-4000-8000-000000000001/source.png'
);
SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73100000-0000-4000-8000-000000000002',
  'FILM_PATTERN',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/film-pattern/versions/V1/73100000-0000-4000-8000-000000000002/source.png'
);
SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73100000-0000-4000-8000-000000000003',
  'CUSTOMER_APPROVED_SAMPLE',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/customer-approved-sample/versions/V1/73100000-0000-4000-8000-000000000003/source.png'
);
SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73100000-0000-4000-8000-000000000004',
  'SIGNED_SAMPLE',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/signed-sample/versions/V1/73100000-0000-4000-8000-000000000004/source.png'
);

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
SELECT public.wos_confirm_office_completeness(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  1,
  'V1',
  'RC02 synthetic Office completeness confirmation.'
);
RESET ROLE;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
SELECT public.wos_submit_production_order(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  1,
  'V1',
  '71000000-0000-4000-8000-000000000003'
);
RESET ROLE;

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
DO $operator_submitted_read$
BEGIN
  IF (
    SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'wos-private'
      AND name LIKE '%/versions/V1/%/source.png'
  ) <> 4 THEN
    RAISE EXCEPTION 'RC02_OPERATOR_SUBMITTED_READ_FAILED';
  END IF;
END;
$operator_submitted_read$;
RESET ROLE;

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
SELECT public.wos_operator_order_action(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  2,
  '71000000-0000-4000-8000-000000000004',
  'RETURN_FOR_INFORMATION',
  'RC02 synthetic operator return for correction.'
);
RESET ROLE;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
SELECT public.wos_office_save_correction(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  3,
  '71000000-0000-4000-8000-000000000005',
  '{"productName":"RC02 Corrected Product"}'::jsonb,
  'RC02 synthetic correction after operator return.'
);
RESET ROLE;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

INSERT INTO storage.objects(
  id,bucket_id,name,owner_id,metadata,version,updated_at
) VALUES
  (
    '63200000-0000-4000-8000-000000000001',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
      || '/images/product/versions/V2/73200000-0000-4000-8000-000000000001/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"110"}'::jsonb,
    'rc02-v2-product',
    '2026-11-25T01:10:00.123456Z'
  ),
  (
    '63200000-0000-4000-8000-000000000002',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
      || '/images/film-pattern/versions/V2/73200000-0000-4000-8000-000000000002/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"111"}'::jsonb,
    'rc02-v2-film',
    '2026-11-25T01:10:01.123456Z'
  ),
  (
    '63200000-0000-4000-8000-000000000003',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
      || '/images/customer-approved-sample/versions/V2/73200000-0000-4000-8000-000000000003/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"112"}'::jsonb,
    'rc02-v2-customer',
    '2026-11-25T01:10:02.123456Z'
  ),
  (
    '63200000-0000-4000-8000-000000000004',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
      || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
      || '/images/signed-sample/versions/V2/73200000-0000-4000-8000-000000000004/source.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"113"}'::jsonb,
    'rc02-v2-signed',
    '2026-11-25T01:10:03.123456Z'
  );

RESET ROLE;

SET request.jwt.claims = '{"role":"service_role"}';
SET request.jwt.claim.sub = '';
SET ROLE service_role;

SELECT public.wos_p7_record_trusted_image_proof(
  '73200000-0000-4000-8000-000000000001',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/product/versions/V2/73200000-0000-4000-8000-000000000001/source.png',
  '63200000-0000-4000-8000-000000000001',
  'rc02-v2-product',
  '2026-11-25T01:10:00.123456Z',
  repeat('5', 64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73200000-0000-4000-8000-000000000002',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/film-pattern/versions/V2/73200000-0000-4000-8000-000000000002/source.png',
  '63200000-0000-4000-8000-000000000002',
  'rc02-v2-film',
  '2026-11-25T01:10:01.123456Z',
  repeat('6', 64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73200000-0000-4000-8000-000000000003',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/customer-approved-sample/versions/V2/73200000-0000-4000-8000-000000000003/source.png',
  '63200000-0000-4000-8000-000000000003',
  'rc02-v2-customer',
  '2026-11-25T01:10:02.123456Z',
  repeat('7', 64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73200000-0000-4000-8000-000000000004',
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '10101010-1010-4010-8010-101010101010',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/signed-sample/versions/V2/73200000-0000-4000-8000-000000000004/source.png',
  '63200000-0000-4000-8000-000000000004',
  'rc02-v2-signed',
  '2026-11-25T01:10:03.123456Z',
  repeat('8', 64)
);

RESET ROLE;
REVOKE SELECT ON public.wos_production_orders FROM service_role;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73200000-0000-4000-8000-000000000001',
  'PRODUCT',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/product/versions/V2/73200000-0000-4000-8000-000000000001/source.png'
);
SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73200000-0000-4000-8000-000000000002',
  'FILM_PATTERN',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/film-pattern/versions/V2/73200000-0000-4000-8000-000000000002/source.png'
);
SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73200000-0000-4000-8000-000000000003',
  'CUSTOMER_APPROVED_SAMPLE',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/customer-approved-sample/versions/V2/73200000-0000-4000-8000-000000000003/source.png'
);
SELECT public.wos_register_uploaded_reference_image(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  '73200000-0000-4000-8000-000000000004',
  'SIGNED_SAMPLE',
  'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/'
    || (SELECT id::text FROM public.wos_production_orders WHERE order_number =
      'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001')
    || '/images/signed-sample/versions/V2/73200000-0000-4000-8000-000000000004/source.png'
);

RESET ROLE;

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $operator_current_image_read$
DECLARE
  v_order_id uuid;
  v_current integer;
  v_old integer;
BEGIN
  SELECT id INTO v_order_id
  FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_current
  FROM storage.objects
  WHERE bucket_id = 'wos-private'
    AND name LIKE
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/'
      || 'wos/production-order/' || v_order_id::text
      || '/images/%/versions/V2/%/source.png';
  SELECT count(*) INTO v_old
  FROM storage.objects
  WHERE bucket_id = 'wos-private'
    AND name LIKE
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/'
      || 'wos/production-order/' || v_order_id::text
      || '/images/%/versions/V1/%/source.png';
  IF v_current <> 4 OR v_old <> 0 THEN
    RAISE EXCEPTION 'RC02_OPERATOR_CURRENT_IMAGE_READ_INVALID: %/%',
      v_current, v_old;
  END IF;
END;
$operator_current_image_read$;

RESET ROLE;

SET request.jwt.claim.sub = '30303030-3030-4030-8030-303030303030';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
DO $viewer_current_image_denied$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'wos-private'
  ) THEN
    RAISE EXCEPTION 'RC02_VIEWER_PRIVATE_IMAGE_ACCEPTED';
  END IF;
END;
$viewer_current_image_denied$;
RESET ROLE;

SET request.jwt.claim.sub = '40404040-4040-4040-8040-404040404040';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
DO $foreign_current_image_denied$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'wos-private'
  ) THEN
    RAISE EXCEPTION 'RC02_FOREIGN_PRIVATE_IMAGE_ACCEPTED';
  END IF;
END;
$foreign_current_image_denied$;
RESET ROLE;

UPDATE public.wos_verified_image_proofs
SET verified_at = clock_timestamp() - interval '20 minutes',
    expires_at = clock_timestamp() - interval '10 minutes'
WHERE image_id = '73200000-0000-4000-8000-000000000001';

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
DO $expired_current_image_denied$
DECLARE
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM storage.objects
  WHERE bucket_id = 'wos-private'
    AND name LIKE '%/versions/V2/%/source.png';
  IF v_visible <> 3 THEN
    RAISE EXCEPTION 'RC02_EXPIRED_PROOF_IMAGE_VISIBLE: %', v_visible;
  END IF;
END;
$expired_current_image_denied$;
RESET ROLE;

UPDATE public.wos_verified_image_proofs
SET verified_at = clock_timestamp(),
    expires_at = clock_timestamp() + interval '10 minutes'
WHERE image_id = '73200000-0000-4000-8000-000000000001';

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
SELECT public.wos_office_resubmit_order(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  4,
  '71000000-0000-4000-8000-000000000006',
  'RC02 synthetic corrected order resubmission.'
);
RESET ROLE;

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
DO $operator_workshop_review_read$
BEGIN
  IF (
    SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'wos-private'
      AND name LIKE '%/versions/V2/%/source.png'
  ) <> 4 THEN
    RAISE EXCEPTION 'RC02_OPERATOR_WORKSHOP_REVIEW_READ_FAILED';
  END IF;
END;
$operator_workshop_review_read$;
RESET ROLE;

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
SELECT public.wos_operator_review_correction(
  (SELECT id FROM public.wos_production_orders WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
  5,
  '71000000-0000-4000-8000-000000000007',
  'RC02 synthetic operator review of current V2 evidence.'
);
RESET ROLE;

SET request.jwt.claim.sub = '20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
DO $operator_waiting_material_read$
BEGIN
  IF (
    SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'wos-private'
      AND name LIKE '%/versions/V2/%/source.png'
  ) <> 4 THEN
    RAISE EXCEPTION 'RC02_OPERATOR_WAITING_MATERIAL_READ_FAILED';
  END IF;
END;
$operator_waiting_material_read$;
RESET ROLE;

UPDATE wos_v1_rc02_safety.rc02_business_grants
SET state = 'CLOSED',
    enabled_until = NULL,
    closed_at = clock_timestamp()
WHERE request_id = '71000000-0000-4000-8000-000000000001';

DO $final_state$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001';
  IF v_order.workflow_status <> 'WAITING_MATERIAL'
    OR v_order.version_label <> 'V2'
    OR v_order.version <> 6
  THEN
    RAISE EXCEPTION 'RC02_LIFECYCLE_FINAL_STATE_INVALID: %/%',
      v_order.workflow_status, v_order.version;
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_reference_images
    WHERE entity_id = v_order.id
      AND version_label = 'V2'
      AND image_status = 'READY'
      AND superseded_at IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'RC02_CURRENT_IMAGE_SET_INVALID';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_visual_baselines
    WHERE entity_id = v_order.id
      AND version_label = 'V2'
      AND status = 'CURRENT'
      AND superseded_at IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'RC02_CURRENT_BASELINE_INVALID';
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_rc02_safety.rc02_business_grants
    WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
  ) <> 0 THEN
    RAISE EXCEPTION 'RC02_GATE_DID_NOT_CLOSE';
  END IF;
  IF coalesce(v_order.closed_at, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'RC02_UNEXPECTED_ORDER_CLOSE';
  END IF;
END;
$final_state$;

DO $expired_authorization$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000001',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Expired Authorization Product',
    'priority', 'MEDIUM',
    'requestedQuantity', 10,
    'currentBatchQuantity', 10,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
  v_fingerprint text;
BEGIN
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'requestId', '72000000-0000-4000-8000-000000000001'::uuid,
    'actorUserId', '10101010-1010-4010-8010-101010101010'::uuid,
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid,
    'payload', v_payload - ARRAY[
      'customerNameSnapshot',
      'projectNameSnapshot',
      'salesOwnerProfileId',
      'projectOwnerProfileId'
    ]
  )::text, 'UTF8')), 'hex');
  INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, enabled_until, approval_reference,
    created_at
  ) VALUES (
    'WOS-V1-RC02-PG17-EXPIRED-72000000',
    '72000000-0000-4000-8000-000000000001',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    v_fingerprint,
    'AUTHORIZED',
    clock_timestamp() - interval '10 minutes',
    'RC02-PG17-EXPIRED-AUTHORIZATION',
    clock_timestamp() - interval '20 minutes'
  );
END;
$expired_authorization$;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $expired_create_denied$
BEGIN
  BEGIN
    PERFORM public.wos_create_production_order(
      '72000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'orderNumber',
          'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000001',
        'customerId', '81000000-0000-4000-8000-000000000001',
        'projectId', '82000000-0000-4000-8000-000000000001',
        'productName', 'RC02 Expired Authorization Product',
        'priority', 'MEDIUM',
        'requestedQuantity', 10,
        'currentBatchQuantity', 10,
        'splitDelivery', false,
        'productMaterial', 'RC02 Synthetic PET',
        'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
      )
    );
    RAISE EXCEPTION 'RC02_EXPIRED_CREATE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$expired_create_denied$;

RESET ROLE;
UPDATE wos_v1_rc02_safety.rc02_business_grants
SET state = 'CLOSED',
    enabled_until = NULL,
    closed_at = clock_timestamp()
WHERE request_id = '72000000-0000-4000-8000-000000000001';

DO $wrong_user_authorization$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000002',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Wrong User Product',
    'priority', 'MEDIUM',
    'requestedQuantity', 10,
    'currentBatchQuantity', 10,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
  v_fingerprint text;
BEGIN
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'requestId', '72000000-0000-4000-8000-000000000002'::uuid,
    'actorUserId', '10101010-1010-4010-8010-101010101010'::uuid,
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid,
    'payload', v_payload - ARRAY[
      'customerNameSnapshot',
      'projectNameSnapshot',
      'salesOwnerProfileId',
      'projectOwnerProfileId'
    ]
  )::text, 'UTF8')), 'hex');
  INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, enabled_until, approval_reference
  ) VALUES (
    'WOS-V1-RC02-PG17-WRONG-USER-72000000',
    '72000000-0000-4000-8000-000000000002',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    v_fingerprint,
    'AUTHORIZED',
    clock_timestamp() + interval '10 minutes',
    'RC02-PG17-WRONG-USER-AUTHORIZATION'
  );
END;
$wrong_user_authorization$;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101011';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $wrong_user_create_denied$
BEGIN
  BEGIN
    PERFORM public.wos_create_production_order(
      '72000000-0000-4000-8000-000000000002',
      jsonb_build_object(
        'orderNumber',
          'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000002',
        'customerId', '81000000-0000-4000-8000-000000000001',
        'projectId', '82000000-0000-4000-8000-000000000001',
        'productName', 'RC02 Wrong User Product',
        'priority', 'MEDIUM',
        'requestedQuantity', 10,
        'currentBatchQuantity', 10,
        'splitDelivery', false,
        'productMaterial', 'RC02 Synthetic PET',
        'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
      )
    );
    RAISE EXCEPTION 'RC02_WRONG_USER_CREATE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$wrong_user_create_denied$;

RESET ROLE;
UPDATE wos_v1_rc02_safety.rc02_business_grants
SET state = 'CLOSED',
    enabled_until = NULL,
    closed_at = clock_timestamp()
WHERE request_id = '72000000-0000-4000-8000-000000000002';

DO $wrong_payload_authorization$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000003',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Authorized Payload',
    'priority', 'MEDIUM',
    'requestedQuantity', 10,
    'currentBatchQuantity', 10,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
  v_fingerprint text;
BEGIN
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'requestId', '72000000-0000-4000-8000-000000000003'::uuid,
    'actorUserId', '10101010-1010-4010-8010-101010101010'::uuid,
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid,
    'payload', v_payload - ARRAY[
      'customerNameSnapshot',
      'projectNameSnapshot',
      'salesOwnerProfileId',
      'projectOwnerProfileId'
    ]
  )::text, 'UTF8')), 'hex');
  INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, enabled_until, approval_reference
  ) VALUES (
    'WOS-V1-RC02-PG17-WRONG-PAYLOAD-72000000',
    '72000000-0000-4000-8000-000000000003',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    v_fingerprint,
    'AUTHORIZED',
    clock_timestamp() + interval '10 minutes',
    'RC02-PG17-WRONG-PAYLOAD-AUTHORIZATION'
  );
END;
$wrong_payload_authorization$;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $wrong_payload_create_denied$
BEGIN
  BEGIN
    PERFORM public.wos_create_production_order(
      '72000000-0000-4000-8000-000000000003',
      jsonb_build_object(
        'orderNumber',
          'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000003',
        'customerId', '81000000-0000-4000-8000-000000000001',
        'projectId', '82000000-0000-4000-8000-000000000001',
        'productName', 'RC02 Unauthorized Payload',
        'priority', 'MEDIUM',
        'requestedQuantity', 10,
        'currentBatchQuantity', 10,
        'splitDelivery', false,
        'productMaterial', 'RC02 Synthetic PET',
        'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
      )
    );
    RAISE EXCEPTION 'RC02_WRONG_PAYLOAD_CREATE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$wrong_payload_create_denied$;

RESET ROLE;
UPDATE wos_v1_rc02_safety.rc02_business_grants
SET state = 'CLOSED',
    enabled_until = NULL,
    closed_at = clock_timestamp()
WHERE request_id = '72000000-0000-4000-8000-000000000003';

SELECT wos_v1_rc02_safety.rc02_legacy_safety_fingerprint()
  AS rc03_legacy_safety_fingerprint
\gset

SET wos.v1.rc02_maintenance = 'yes';

INSERT INTO public.wos_production_orders(
  id, organization_id, customer_id, customer_name_snapshot,
  project_id, project_name_snapshot, order_number, product_name,
  sales_owner_profile_id, project_owner_profile_id, priority,
  version_label, workflow_status, requested_quantity,
  current_batch_quantity, split_delivery, product_material,
  created_by_profile_id, version
) VALUES
  (
    '74000000-0000-4000-8000-000000000001',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '81000000-0000-4000-8000-000000000001',
    'RC03 Historical Customer',
    '82000000-0000-4000-8000-000000000001',
    'RC03 Historical Project',
    'WOS-PROD-RC02-NEGATIVE-HISTORICAL-001',
    'RC03 Historical Product 1',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'MEDIUM',
    'V1',
    'DRAFT',
    10,
    10,
    false,
    'RC03 Historical Material',
    '11111111-1111-4111-8111-111111111111',
    1
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '81000000-0000-4000-8000-000000000001',
    'RC03 Historical Customer',
    '82000000-0000-4000-8000-000000000001',
    'RC03 Historical Project',
    'WOS-PROD-RC02-NEGATIVE-HISTORICAL-002',
    'RC03 Historical Product 2',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'MEDIUM',
    'V1',
    'DRAFT',
    10,
    10,
    false,
    'RC03 Historical Material',
    '11111111-1111-4111-8111-111111111111',
    1
  );

RESET wos.v1.rc02_maintenance;

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $direct_non_qa_insert_denied$
BEGIN
  BEGIN
    INSERT INTO public.wos_production_orders(
      organization_id, customer_id, customer_name_snapshot,
      project_id, project_name_snapshot, order_number, product_name,
      sales_owner_profile_id, project_owner_profile_id, priority,
      version_label, workflow_status, requested_quantity,
      current_batch_quantity, split_delivery, product_material,
      created_by_profile_id, version
    ) VALUES (
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      '81000000-0000-4000-8000-000000000001',
      'RC03 Direct Customer',
      '82000000-0000-4000-8000-000000000001',
      'RC03 Direct Project',
      'WOS-PROD-RC03-DIRECT-DENIED',
      'RC03 Direct Product',
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'MEDIUM',
      'V1',
      'DRAFT',
      10,
      10,
      false,
      'RC03 Direct Material',
      '11111111-1111-4111-8111-111111111111',
      1
    );
    RAISE EXCEPTION 'RC02_NON_QA_DIRECT_INSERT_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    UPDATE public.wos_production_orders
    SET product_name = 'RC03 Unauthorized Historical Update'
    WHERE id = '74000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'RC02_HISTORICAL_UPDATE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$direct_non_qa_insert_denied$;

RESET ROLE;

DO $ttl_and_immutability_denials$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber', 'QA-NONPROD-PG17-74000000-0000-4000-8000-000000000010',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC03 Negative Product',
    'priority', 'MEDIUM',
    'requestedQuantity', 10,
    'currentBatchQuantity', 10,
    'splitDelivery', false,
    'productMaterial', 'RC03 Synthetic PET',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
BEGIN
  BEGIN
    INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
      authorization_id, request_id, organization_id,
      office_user_id, office_profile_id,
      operator_user_id, operator_profile_id,
      order_number, customer_id, project_id,
      create_payload_fingerprint, state, created_order_id,
      enabled_until, approval_reference, created_at, bound_at
    ) VALUES (
      'WOS-V1-RC02-NEGATIVE-OVERTTL-74000000',
      '74000000-0000-4000-8000-000000000010',
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      '10101010-1010-4010-8010-101010101010',
      '11111111-1111-4111-8111-111111111111',
      '20202020-2020-4020-8020-202020202020',
      '22222222-2222-4222-8222-222222222222',
      'QA-NONPROD-PG17-74000000-0000-4000-8000-000000000010',
      '81000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      'ORDER_BOUND',
      '74000000-0000-4000-8000-000000000001',
      clock_timestamp() + interval '20 minutes',
      'RC02-NEGATIVE-OVERTTL',
      clock_timestamp(),
      clock_timestamp()
    );
    RAISE EXCEPTION 'RC02_ORDER_BOUND_OVERTTL_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, enabled_until, approval_reference
  ) VALUES (
    'WOS-V1-RC02-NEGATIVE-TTL-EXTEND-74000000',
    '74000000-0000-4000-8000-000000000011',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-74000000-0000-4000-8000-000000000011',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    repeat('b', 64),
    'AUTHORIZED',
    clock_timestamp() + interval '10 minutes',
    'RC02-NEGATIVE-TTL-EXTEND'
  );

  BEGIN
    UPDATE wos_v1_rc02_safety.rc02_business_grants
    SET enabled_until = clock_timestamp() + interval '20 minutes'
    WHERE request_id = '74000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'RC02_TTL_EXTENSION_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    UPDATE wos_v1_rc02_safety.rc02_business_grants
    SET office_user_id = '10101010-1010-4010-8010-101010101011'
    WHERE request_id = '74000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'RC02_SCOPE_MUTATION_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  UPDATE wos_v1_rc02_safety.rc02_business_grants
  SET state = 'CLOSED',
      enabled_until = NULL,
      closed_at = clock_timestamp()
  WHERE request_id = '74000000-0000-4000-8000-000000000011';

  BEGIN
    UPDATE wos_v1_rc02_safety.rc02_business_grants
    SET state = 'AUTHORIZED',
        enabled_until = clock_timestamp() + interval '5 minutes',
        closed_at = NULL
    WHERE request_id = '74000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'RC02_CLOSED_REOPEN_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  INSERT INTO wos_v1_rc02_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, created_order_id,
    enabled_until, approval_reference, created_at, bound_at
  ) VALUES (
    'WOS-V1-RC02-NEGATIVE-REBIND-74000000',
    '74000000-0000-4000-8000-000000000012',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-74000000-0000-4000-8000-000000000012',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'ORDER_BOUND',
    '74000000-0000-4000-8000-000000000001',
    clock_timestamp() + interval '10 minutes',
    'RC02-NEGATIVE-REBIND',
    clock_timestamp(),
    clock_timestamp()
  );

  BEGIN
    UPDATE wos_v1_rc02_safety.rc02_business_grants
    SET created_order_id = '74000000-0000-4000-8000-000000000002'
    WHERE request_id = '74000000-0000-4000-8000-000000000012';
    RAISE EXCEPTION 'RC02_ORDER_REBIND_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  UPDATE wos_v1_rc02_safety.rc02_business_grants
  SET state = 'CLOSED',
      enabled_until = NULL,
      closed_at = clock_timestamp()
  WHERE request_id = '74000000-0000-4000-8000-000000000012';
END;
$ttl_and_immutability_denials$;

SET request.jwt.claim.sub = '40404040-4040-4040-8040-404040404040';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $cross_org_create_denied$
BEGIN
  BEGIN
    PERFORM public.wos_create_production_order(
      '72000000-0000-4000-8000-000000000004',
      jsonb_build_object(
        'orderNumber',
          'QA-NONPROD-PG17-72000000-0000-4000-8000-000000000004',
        'customerId', '81000000-0000-4000-8000-000000000001',
        'projectId', '82000000-0000-4000-8000-000000000001',
        'productName', 'RC02 Cross Organization Product',
        'priority', 'MEDIUM',
        'requestedQuantity', 10,
        'currentBatchQuantity', 10,
        'splitDelivery', false,
        'productMaterial', 'RC02 Synthetic PET',
        'salesOwnerProfileId', '44444444-4444-4444-8444-444444444444',
        'projectOwnerProfileId', '44444444-4444-4444-8444-444444444444'
      )
    );
    RAISE EXCEPTION 'RC02_CROSS_ORG_CREATE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_org_create_denied$;

RESET ROLE;

-- Authenticated callers cannot bypass the RPC boundary by writing the order or
-- child tables directly. This is the database behavior PostgREST reaches for a
-- direct table request under the same JWT role.
SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

DO $direct_table_denials$
BEGIN
  BEGIN
    INSERT INTO public.wos_production_orders(
      organization_id, customer_id, customer_name_snapshot,
      project_id, project_name_snapshot, order_number, product_name,
      sales_owner_profile_id, project_owner_profile_id, priority,
      version_label, workflow_status, requested_quantity,
      current_batch_quantity, split_delivery, product_material,
      created_by_profile_id
    ) VALUES (
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      '81000000-0000-4000-8000-000000000001',
      'RC02 Direct Customer',
      '82000000-0000-4000-8000-000000000001',
      'RC02 Direct Project',
      'QA-NONPROD-PG17-DIRECT-DENIED',
      'RC02 Direct Product',
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'MEDIUM',
      'V1',
      'DRAFT',
      10,
      10,
      false,
      'RC02 Direct Material',
      '11111111-1111-4111-8111-111111111111'
    );
    RAISE EXCEPTION 'RC02_DIRECT_ORDER_INSERT_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.wos_reference_images(
      id, organization_id, entity_type, entity_id, category,
      storage_bucket, storage_path, file_name, mime_type, file_size,
      version_label, image_status, uploaded_by_profile_id
    ) VALUES (
      '73300000-0000-4000-8000-000000000001',
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      'PRODUCTION_ORDER',
      (SELECT id FROM public.wos_production_orders WHERE order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
      'PRODUCT',
      'wos-private',
      'organizations/direct-denied.png',
      'source.png',
      'image/png',
      100,
      'V2',
      'READY',
      '11111111-1111-4111-8111-111111111111'
    );
    RAISE EXCEPTION 'RC02_DIRECT_IMAGE_INSERT_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.wos_verified_image_proofs(
      image_id, organization_id, order_id, actor_user_id,
      storage_bucket, storage_path, storage_object_id,
      storage_object_version, storage_object_updated_at,
      verified_sha256, verified_at, expires_at
    ) VALUES (
      '73300000-0000-4000-8000-000000000002',
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      (SELECT id FROM public.wos_production_orders WHERE order_number =
        'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'),
      '10101010-1010-4010-8010-101010101010',
      'wos-private',
      'organizations/direct-proof.png',
      '63300000-0000-4000-8000-000000000001',
      'direct-proof',
      clock_timestamp(),
      repeat('9', 64),
      clock_timestamp(),
      clock_timestamp() + interval '10 minutes'
    );
    RAISE EXCEPTION 'RC02_DIRECT_PROOF_INSERT_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$direct_table_denials$;

RESET ROLE;

-- The installed Gate table remains service-only and the unique active slot is
-- free after the lifecycle.
DO $final_contract$
BEGIN
  IF pg_catalog.has_table_privilege(
      'authenticated',
      'wos_v1_rc02_safety.rc02_business_grants',
      'INSERT,UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'service_role',
      'public.wos_production_orders',
      'SELECT'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.wos_create_production_order(uuid,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'RC02_FINAL_ACL_AUDIT_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'wos_v1_rc02_safety'
      AND tablename = 'rc02_business_grants'
      AND indexname = 'rc02_one_active_authorization'
  ) THEN
    RAISE EXCEPTION 'RC02_ACTIVE_INDEX_MISSING';
  END IF;
END;
$final_contract$;

SELECT 'WOS_V1_RC02_CREATE_ATOMIC_BIND=PASS' AS evidence;
SELECT 'WOS_V1_RC02_EIGHT_RPC_ORDER_GATE=PASS' AS evidence;
SELECT 'WOS_V1_RC02_CURRENT_VERSION_RECORRECTION=PASS' AS evidence;
SELECT 'WOS_V1_RC02_DIRECT_TABLE_BYPASS_DENIED=PASS' AS evidence;
SELECT 'WOS_V1_RC02_ACL_AND_ACTIVE_INDEX=PASS' AS evidence;
