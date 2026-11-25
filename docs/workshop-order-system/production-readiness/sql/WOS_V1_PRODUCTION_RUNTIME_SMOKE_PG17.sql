\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 only. Exercises the complete V1 order lifecycle in
-- a rollback-only transaction. It grants temporary test EXECUTE privileges and
-- never runs against a live database.
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_prod_bootstrap_ci' THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_SMOKE_DISPOSABLE_ONLY';
  END IF;
  IF (SELECT count(*) FROM public.organizations) <> 0
    OR (SELECT count(*) FROM public.profiles) <> 0
    OR (SELECT count(*) FROM public.wos_production_orders) <> 0
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_SMOKE_REQUIRES_CLEANROOM';
  END IF;
END;
$guard$;

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

INSERT INTO auth.users (id,email) VALUES
  ('10101010-1010-4010-8010-101010101010','office@example.test'),
  ('20202020-2020-4020-8020-202020202020','operator@example.test'),
  ('30303030-3030-4030-8030-303030303030','viewer@example.test'),
  ('40404040-4040-4040-8040-404040404040','foreign@example.test');

INSERT INTO public.organizations (id,name) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic Production Org'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Synthetic Foreign Org');

INSERT INTO public.profiles (id,user_id,org_id,role,is_active) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    '10101010-1010-4010-8010-101010101010',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'admin',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '20202020-2020-4020-8020-202020202020',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'operator',
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '30303030-3030-4030-8030-303030303030',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'viewer',
    true
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '40404040-4040-4040-8040-404040404040',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'admin',
    true
  );

INSERT INTO public.cpc_customer_references (
  id,org_id,reference_kind,provisional_source_reference,
  display_name_snapshot,status,created_by_profile_id
) VALUES
  (
    '81000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'provisional',
    'synthetic-same-org-customer',
    'Synthetic Same Org Customer',
    'pending_review',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'provisional',
    'synthetic-foreign-customer',
    'Synthetic Foreign Customer',
    'pending_review',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    '81000000-0000-4000-8000-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'provisional',
    'synthetic-other-same-org-customer',
    'Synthetic Other Same Org Customer',
    'pending_review',
    '11111111-1111-4111-8111-111111111111'
  );
INSERT INTO public.cpc_projects (
  id,org_id,customer_reference_id,title,objective_summary,project_type,
  owner_profile_id,stage,priority,created_by_profile_id
) VALUES
  (
    '82000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '81000000-0000-4000-8000-000000000001',
    'Synthetic Same Org Project',
    'Synthetic WOS cross-organization test',
    'transfer_film',
    '11111111-1111-4111-8111-111111111111',
    'discovery',
    'medium',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '81000000-0000-4000-8000-000000000002',
    'Synthetic Foreign Project',
    'Synthetic WOS foreign organization test',
    'transfer_film',
    '44444444-4444-4444-8444-444444444444',
    'discovery',
    'medium',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    '82000000-0000-4000-8000-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '81000000-0000-4000-8000-000000000003',
    'Synthetic Other Same Org Project',
    'Synthetic mismatched project/customer test',
    'transfer_film',
    '11111111-1111-4111-8111-111111111111',
    'discovery',
    'medium',
    '11111111-1111-4111-8111-111111111111'
  );

SET request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;

DO $cross_org_rejections$
BEGIN
  BEGIN
    PERFORM public.wos_create_production_order(
      '51000000-0000-4000-8000-000000000091',
      jsonb_build_object(
        'orderNumber','WOS-PROD-CI-FOREIGN-CUSTOMER',
        'customerId','81000000-0000-4000-8000-000000000002',
        'customerNameSnapshot','Synthetic Foreign Customer',
        'projectId','82000000-0000-4000-8000-000000000003',
        'projectNameSnapshot','Synthetic Other Same Org Project',
        'productName','Synthetic Product',
        'salesOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'priority','MEDIUM',
        'requestedQuantity',100,
        'currentBatchQuantity',100,
        'productMaterial','Synthetic Material'
      )
    );
    RAISE EXCEPTION 'CROSS_ORG_CUSTOMER_ACCEPTED';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM public.wos_create_production_order(
      '51000000-0000-4000-8000-000000000092',
      jsonb_build_object(
        'orderNumber','WOS-PROD-CI-FOREIGN-PROJECT',
        'customerId','81000000-0000-4000-8000-000000000001',
        'customerNameSnapshot','Synthetic Same Org Customer',
        'projectId','82000000-0000-4000-8000-000000000002',
        'projectNameSnapshot','Synthetic Foreign Project',
        'productName','Synthetic Product',
        'salesOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'priority','MEDIUM',
        'requestedQuantity',100,
        'currentBatchQuantity',100,
        'productMaterial','Synthetic Material'
      )
    );
    RAISE EXCEPTION 'CROSS_ORG_PROJECT_ACCEPTED';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM public.wos_create_production_order(
      '51000000-0000-4000-8000-000000000093',
      jsonb_build_object(
        'orderNumber','WOS-PROD-CI-MISMATCHED-LINK',
        'customerId','81000000-0000-4000-8000-000000000001',
        'projectId','82000000-0000-4000-8000-000000000003',
        'customerNameSnapshot','Synthetic Customer',
        'productName','Synthetic Product',
        'salesOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'priority','MEDIUM',
        'requestedQuantity',100,
        'currentBatchQuantity',100,
        'productMaterial','Synthetic Material'
      )
    );
    RAISE EXCEPTION 'MISMATCHED_PROJECT_CUSTOMER_ACCEPTED';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM public.wos_create_production_order(
      '51000000-0000-4000-8000-000000000094',
      jsonb_build_object(
        'orderNumber','WOS-PROD-CI-UNSUPPORTED-SPLIT',
        'customerNameSnapshot','Synthetic Customer',
        'productName','Synthetic Product',
        'splitDelivery',true,
        'salesOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'projectOwnerProfileId','11111111-1111-4111-8111-111111111111',
        'priority','MEDIUM',
        'requestedQuantity',100,
        'currentBatchQuantity',100,
        'productMaterial','Synthetic Material'
      )
    );
    RAISE EXCEPTION 'UNSUPPORTED_SPLIT_DELIVERY_ACCEPTED';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN NULL;
  END;

  IF (SELECT count(*) FROM public.wos_production_orders) <> 0 THEN
    RAISE EXCEPTION 'CROSS_ORG_ORDER_ROW_PERSISTED';
  END IF;
END;
$cross_org_rejections$;
\echo WOS_V1_CROSS_ORG_AND_UNSUPPORTED_SPLIT_DELIVERY_REJECTED=PASS

SELECT (
  public.wos_create_production_order(
  '51000000-0000-4000-8000-000000000099',
  jsonb_build_object(
    'orderNumber','WOS-PROD-CI-001',
    'customerId','81000000-0000-4000-8000-000000000001',
    'customerNameSnapshot','Synthetic Customer',
    'projectId','82000000-0000-4000-8000-000000000001',
    'projectNameSnapshot','Synthetic Same Org Project',
    'productName','Synthetic Product',
    'salesOwnerProfileId','33333333-3333-4333-8333-333333333333',
    'projectOwnerProfileId','33333333-3333-4333-8333-333333333333',
    'priority','MEDIUM',
    'requestedQuantity',100,
    'currentBatchQuantity',100,
    'productMaterial','Synthetic Material',
    'customerAcceptanceStandard','Synthetic acceptance standard',
    'positionReference','Synthetic print position'
  )
) ->> 'orderId'
) AS order_id \gset

SELECT 'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
  || :'order_id' || '/images/' AS order_prefix \gset
SELECT set_config('wos_v1.smoke_order_id', :'order_id', false);
SELECT set_config('wos_v1.smoke_order_prefix', :'order_prefix', false);

RESET ROLE;
UPDATE public.cpc_projects
SET archived_at = clock_timestamp()
WHERE id = '82000000-0000-4000-8000-000000000001';
SET ROLE authenticated;

DO $cpc_idempotent_replay$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.wos_create_production_order(
    '51000000-0000-4000-8000-000000000099',
    jsonb_build_object(
      'orderNumber','WOS-PROD-CI-001',
      'customerId','81000000-0000-4000-8000-000000000001',
      'customerNameSnapshot','Ignored Retry Customer',
      'projectId','82000000-0000-4000-8000-000000000001',
      'projectNameSnapshot','Ignored Retry Project',
      'productName','Synthetic Product',
      'salesOwnerProfileId','33333333-3333-4333-8333-333333333333',
      'projectOwnerProfileId','33333333-3333-4333-8333-333333333333',
      'priority','MEDIUM',
      'requestedQuantity',100,
      'currentBatchQuantity',100,
      'productMaterial','Synthetic Material',
      'customerAcceptanceStandard','Synthetic acceptance standard',
      'positionReference','Synthetic print position'
    )
  );
  IF v_result->>'status' <> 'REPLAYED' THEN
    RAISE EXCEPTION 'CPC_MUTABLE_RETRY_NOT_REPLAYED';
  END IF;
END;
$cpc_idempotent_replay$;

RESET ROLE;
UPDATE public.cpc_projects
SET archived_at = NULL
WHERE id = '82000000-0000-4000-8000-000000000001';
SET ROLE authenticated;

DO $cpc_authoritative_binding$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_production_orders production_order
    JOIN public.cpc_customer_references customer
      ON customer.id = production_order.customer_id
    JOIN public.cpc_projects project
      ON project.id = production_order.project_id
    WHERE production_order.id = current_setting('wos_v1.smoke_order_id')::uuid
      AND production_order.customer_name_snapshot =
        customer.display_name_snapshot
      AND production_order.project_name_snapshot = project.title
      AND production_order.sales_owner_profile_id =
        '11111111-1111-4111-8111-111111111111'
      AND production_order.project_owner_profile_id =
        project.owner_profile_id
  ) THEN
    RAISE EXCEPTION 'CPC_AUTHORITATIVE_BINDING_NOT_ENFORCED';
  END IF;
END;
$cpc_authoritative_binding$;

DO $storage_policy_negative$
BEGIN
  BEGIN
    INSERT INTO storage.objects (
      id,bucket_id,name,owner_id,metadata,version,updated_at
    ) VALUES (
      '61000000-0000-4000-8000-000000000099',
      'wos-private',
      current_setting('wos_v1.smoke_order_prefix')
        || 'other/versions/V1/71000000-0000-4000-8000-000000000099/proof.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"100"}'::jsonb,
      'v-invalid',
      '2026-11-23T00:00:09.123456Z'
    );
    RAISE EXCEPTION 'INVALID_STORAGE_CATEGORY_ACCEPTED';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$storage_policy_negative$;

INSERT INTO storage.objects (
  id,bucket_id,name,owner_id,metadata,version,updated_at
) VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'wos-private',
    :'order_prefix' || 'product/versions/V1/71000000-0000-4000-8000-000000000001/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v-product-1',
    '2026-11-23T00:00:00.123456Z'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'wos-private',
    :'order_prefix' || 'film-pattern/versions/V1/71000000-0000-4000-8000-000000000002/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v-film-1',
    '2026-11-23T00:00:01.123456Z'
  ),
  (
    '61000000-0000-4000-8000-000000000003',
    'wos-private',
    :'order_prefix' || 'customer-approved-sample/versions/V1/71000000-0000-4000-8000-000000000003/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v-customer-1',
    '2026-11-23T00:00:02.123456Z'
  ),
  (
    '61000000-0000-4000-8000-000000000004',
    'wos-private',
    :'order_prefix' || 'signed-sample/versions/V1/71000000-0000-4000-8000-000000000004/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v-signed-1',
    '2026-11-23T00:00:03.123456Z'
  );

DO $office_storage_read$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private') <> 4 THEN
    RAISE EXCEPTION 'OFFICE_FOUR_CATEGORY_STORAGE_READ_FAILED';
  END IF;
END;
$office_storage_read$;

RESET ROLE;
SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;
SELECT public.wos_p7_record_trusted_image_proof(
  '71000000-0000-4000-8000-000000000001',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'product/versions/V1/71000000-0000-4000-8000-000000000001/proof.png',
  '61000000-0000-4000-8000-000000000001',
  'v-product-1',
  '2026-11-23T00:00:00.123456Z',
  repeat('1',64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '71000000-0000-4000-8000-000000000002',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'film-pattern/versions/V1/71000000-0000-4000-8000-000000000002/proof.png',
  '61000000-0000-4000-8000-000000000002',
  'v-film-1',
  '2026-11-23T00:00:01.123456Z',
  repeat('2',64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '71000000-0000-4000-8000-000000000003',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'customer-approved-sample/versions/V1/71000000-0000-4000-8000-000000000003/proof.png',
  '61000000-0000-4000-8000-000000000003',
  'v-customer-1',
  '2026-11-23T00:00:02.123456Z',
  repeat('3',64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '71000000-0000-4000-8000-000000000004',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'signed-sample/versions/V1/71000000-0000-4000-8000-000000000004/proof.png',
  '61000000-0000-4000-8000-000000000004',
  'v-signed-1',
  '2026-11-23T00:00:03.123456Z',
  repeat('4',64)
);

UPDATE public.wos_verified_image_proofs
SET verified_at = clock_timestamp() - interval '11 minutes',
    expires_at = clock_timestamp() - interval '1 minute'
WHERE image_id = '71000000-0000-4000-8000-000000000001';

DO $renew_expired_proof$
BEGIN
  IF public.wos_v1_renew_expired_image_proof(
    '71000000-0000-4000-8000-000000000001',
    current_setting('wos_v1.smoke_order_id')::uuid,
    '10101010-1010-4010-8010-101010101010',
    current_setting('wos_v1.smoke_order_prefix')
      || 'product/versions/V1/71000000-0000-4000-8000-000000000001/proof.png',
    '61000000-0000-4000-8000-000000000001',
    'v-product-1',
    '2026-11-23T00:00:00.123456Z',
    repeat('1',64)
  )->>'status' <> 'RENEWED'
  THEN
    RAISE EXCEPTION 'EXPIRED_PROOF_RENEWAL_FAILED';
  END IF;
END;
$renew_expired_proof$;
\echo WOS_V1_EXPIRED_PROOF_RENEWAL=PASS

SET request.jwt.claim.role='authenticated';
SET request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';
SET ROLE authenticated;
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '71000000-0000-4000-8000-000000000001',
  'PRODUCT',
  :'order_prefix' || 'product/versions/V1/71000000-0000-4000-8000-000000000001/proof.png'
);
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '71000000-0000-4000-8000-000000000002',
  'FILM_PATTERN',
  :'order_prefix' || 'film-pattern/versions/V1/71000000-0000-4000-8000-000000000002/proof.png'
);
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '71000000-0000-4000-8000-000000000003',
  'CUSTOMER_APPROVED_SAMPLE',
  :'order_prefix' || 'customer-approved-sample/versions/V1/71000000-0000-4000-8000-000000000003/proof.png'
);
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '71000000-0000-4000-8000-000000000004',
  'SIGNED_SAMPLE',
  :'order_prefix' || 'signed-sample/versions/V1/71000000-0000-4000-8000-000000000004/proof.png'
);

SELECT public.wos_confirm_office_completeness(
  :'order_id',
  1,
  'V1',
  'Synthetic four-image Office completeness confirmation'
);
SELECT public.wos_submit_production_order(
  :'order_id',
  1,
  'V1',
  '52000000-0000-4000-8000-000000000001'
) AS submit_order;
RESET ROLE;

SET request.jwt.claim.sub='20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;
DO $operator_storage_read$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private') <> 4 THEN
    RAISE EXCEPTION 'OPERATOR_STORAGE_READ_FAILED';
  END IF;
END;
$operator_storage_read$;
SELECT public.wos_operator_order_action(
  :'order_id',
  2,
  '53000000-0000-4000-8000-000000000001',
  'ACCEPT',
  'Synthetic operator acceptance'
) AS operator_accept;
SELECT public.wos_operator_order_action(
  :'order_id',
  2,
  '53000000-0000-4000-8000-000000000001',
  'ACCEPT',
  'Synthetic operator acceptance'
) AS operator_accept_replay;
SELECT public.wos_operator_order_action(
  :'order_id',
  3,
  '53000000-0000-4000-8000-000000000002',
  'RETURN_FOR_INFORMATION',
  'Synthetic customer acceptance standard is incomplete'
) AS operator_return;
RESET ROLE;

SET request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;
SELECT public.wos_office_save_correction(
  :'order_id',
  4,
  '54000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'customerAcceptanceStandard','Revised synthetic acceptance standard',
    'positionReference','Revised synthetic print position'
  ),
  'Synthetic Office correction after Operator return'
) AS office_save;
RESET ROLE;

INSERT INTO storage.objects (
  id, bucket_id, name, owner_id, metadata, version, updated_at
) VALUES
  (
    '63000000-0000-4000-8000-000000000001',
    'wos-private',
    :'order_prefix' || 'product/versions/V2/73000000-0000-4000-8000-000000000001/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v2-product-1',
    '2026-11-23T00:01:00.123456Z'
  ),
  (
    '63000000-0000-4000-8000-000000000002',
    'wos-private',
    :'order_prefix' || 'film-pattern/versions/V2/73000000-0000-4000-8000-000000000002/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v2-film-1',
    '2026-11-23T00:01:01.123456Z'
  ),
  (
    '63000000-0000-4000-8000-000000000003',
    'wos-private',
    :'order_prefix' || 'customer-approved-sample/versions/V2/73000000-0000-4000-8000-000000000003/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v2-customer-1',
    '2026-11-23T00:01:02.123456Z'
  ),
  (
    '63000000-0000-4000-8000-000000000004',
    'wos-private',
    :'order_prefix' || 'signed-sample/versions/V2/73000000-0000-4000-8000-000000000004/proof.png',
    '10101010-1010-4010-8010-101010101010',
    '{"mimetype":"image/png","size":"100"}'::jsonb,
    'v2-signed-1',
    '2026-11-23T00:01:03.123456Z'
  );

SET request.jwt.claims='{"role":"service_role"}';
SET request.jwt.claim.sub='';
SET ROLE service_role;
SELECT public.wos_p7_record_trusted_image_proof(
  '73000000-0000-4000-8000-000000000001',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'product/versions/V2/73000000-0000-4000-8000-000000000001/proof.png',
  '63000000-0000-4000-8000-000000000001',
  'v2-product-1',
  '2026-11-23T00:01:00.123456Z',
  repeat('5',64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73000000-0000-4000-8000-000000000002',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'film-pattern/versions/V2/73000000-0000-4000-8000-000000000002/proof.png',
  '63000000-0000-4000-8000-000000000002',
  'v2-film-1',
  '2026-11-23T00:01:01.123456Z',
  repeat('6',64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73000000-0000-4000-8000-000000000003',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'customer-approved-sample/versions/V2/73000000-0000-4000-8000-000000000003/proof.png',
  '63000000-0000-4000-8000-000000000003',
  'v2-customer-1',
  '2026-11-23T00:01:02.123456Z',
  repeat('7',64)
);
SELECT public.wos_p7_record_trusted_image_proof(
  '73000000-0000-4000-8000-000000000004',
  :'order_id',
  '10101010-1010-4010-8010-101010101010',
  :'order_prefix' || 'signed-sample/versions/V2/73000000-0000-4000-8000-000000000004/proof.png',
  '63000000-0000-4000-8000-000000000004',
  'v2-signed-1',
  '2026-11-23T00:01:03.123456Z',
  repeat('8',64)
);
RESET ROLE;

SET request.jwt.claim.role='authenticated';
SET request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';
SET ROLE authenticated;
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '73000000-0000-4000-8000-000000000001',
  'PRODUCT',
  :'order_prefix' || 'product/versions/V2/73000000-0000-4000-8000-000000000001/proof.png'
);
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '73000000-0000-4000-8000-000000000002',
  'FILM_PATTERN',
  :'order_prefix' || 'film-pattern/versions/V2/73000000-0000-4000-8000-000000000002/proof.png'
);
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '73000000-0000-4000-8000-000000000003',
  'CUSTOMER_APPROVED_SAMPLE',
  :'order_prefix' || 'customer-approved-sample/versions/V2/73000000-0000-4000-8000-000000000003/proof.png'
);
SELECT public.wos_register_uploaded_reference_image(
  :'order_id',
  '73000000-0000-4000-8000-000000000004',
  'SIGNED_SAMPLE',
  :'order_prefix' || 'signed-sample/versions/V2/73000000-0000-4000-8000-000000000004/proof.png'
);
SELECT public.wos_office_resubmit_order(
  :'order_id',
  5,
  '54000000-0000-4000-8000-000000000002',
  'Synthetic Office resubmission after saved correction'
) AS office_resubmit;
RESET ROLE;

SET request.jwt.claim.sub='20202020-2020-4020-8020-202020202020';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;
SELECT public.wos_operator_review_correction(
  :'order_id',
  6,
  '55000000-0000-4000-8000-000000000001',
  'Synthetic Operator review of the exact current revision'
) AS operator_review;
RESET ROLE;

DO $assertions$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_history integer;
BEGIN
  SELECT * INTO v_order
  FROM public.wos_production_orders
  WHERE id=current_setting('wos_v1.smoke_order_id')::uuid;
  SELECT count(*)::integer INTO v_history
  FROM public.wos_status_history
  WHERE entity_id=current_setting('wos_v1.smoke_order_id')::uuid;

  IF v_order.workflow_status <> 'WAITING_MATERIAL'
    OR v_order.version <> 7
    OR v_order.version_label <> 'V2'
    OR (SELECT count(*) FROM public.wos_submission_receipts
        WHERE order_id=v_order.id) <> 1
    OR (SELECT count(*) FROM public.wos_workshop_inbox
        WHERE order_id=v_order.id) <> 1
    OR (SELECT count(*) FROM public.wos_operator_action_receipts
        WHERE order_id=v_order.id) <> 2
    OR (SELECT count(*) FROM public.wos_office_revisions
        WHERE order_id=v_order.id) <> 2
    OR (SELECT count(*) FROM public.wos_operator_review_receipts
        WHERE order_id=v_order.id) <> 1
    OR (SELECT count(*) FROM public.wos_blockers
        WHERE entity_id=v_order.id AND status='RESOLVED'
          AND blocker_code='P2_DOCUMENTS_INCOMPLETE') <> 1
    OR (SELECT count(*) FROM public.wos_visual_baselines
        WHERE entity_id=v_order.id AND version_label='V2'
          AND status='CURRENT' AND superseded_at IS NULL) <> 1
    OR (SELECT count(*) FROM public.wos_visual_baseline_items item
        JOIN public.wos_visual_baselines baseline
          ON baseline.id=item.baseline_id
        WHERE baseline.entity_id=v_order.id
          AND baseline.version_label='V2'
          AND baseline.status='CURRENT') <> 4
    OR v_history <> 7
  THEN
    RAISE EXCEPTION 'WOS_V1_LIFECYCLE_ASSERTION_FAILED';
  END IF;
END;
$assertions$;

DO $role_assertions$
BEGIN
  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'INSERT,UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_office_revisions',
      'SELECT,INSERT,UPDATE,DELETE'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_DIRECT_DML_PRIVILEGE_LEAK';
  END IF;
END;
$role_assertions$;

SET request.jwt.claim.sub='30303030-3030-4030-8030-303030303030';
SET ROLE authenticated;
DO $viewer$
BEGIN
  IF (SELECT count(*) FROM public.wos_production_orders) <> 0
    OR (SELECT count(*) FROM public.wos_workshop_inbox) <> 0
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private') <> 0
  THEN
    RAISE EXCEPTION 'WOS_V1_VIEWER_READ_LEAK';
  END IF;
END;
$viewer$;
RESET ROLE;

SET request.jwt.claim.sub='40404040-4040-4040-8040-404040404040';
SET ROLE authenticated;
DO $foreign$
BEGIN
  IF (SELECT count(*) FROM public.wos_production_orders) <> 0
    OR (SELECT count(*) FROM public.wos_workshop_inbox) <> 0
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private') <> 0
  THEN
    RAISE EXCEPTION 'WOS_V1_CROSS_ORG_READ_LEAK';
  END IF;
END;
$foreign$;
RESET ROLE;

ROLLBACK;

\echo WOS_V1_PRODUCTION_LIFECYCLE=PASS
\echo WOS_V1_OPERATOR_ACCEPT_RETURN=PASS
\echo WOS_V1_OFFICE_SAVE_RESUBMIT=PASS
\echo WOS_V1_OPERATOR_REVIEW_CORRECTION=PASS
\echo WOS_V1_IDEMPOTENCY=PASS
\echo WOS_V1_VIEWER_CROSS_ORG_DENIED=PASS
\echo WOS_V1_CAN_START_FALSE=PASS
