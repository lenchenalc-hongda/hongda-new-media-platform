-- Ephemeral PostgreSQL 17 assertions for the QA revision-image Gate.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON storage.objects TO authenticated;

INSERT INTO public.wos_production_orders(
  id,organization_id,order_number,workflow_status,version,version_label,
  customer_name_snapshot,product_name,product_material,requested_quantity,
  current_batch_quantity,created_by_profile_id,sales_owner_profile_id)
VALUES
 ('88888888-8888-4888-8888-888888888888',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA-NONPROD-REVISION-001',
  'WAITING_MATERIAL',7,'QA-R6','QA revision customer','QA revision product',
  'PP','100','100','11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111'),
 ('99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA-NONPROD-DRAFT-001',
  'DRAFT',1,'V1','QA draft customer','QA draft product',
  'PP','100','100','11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111');

INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path,file_name,mime_type,file_size,
  uploaded_by_profile_id)
VALUES(
  '81111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
  '88888888-8888-4888-8888-888888888888','FILM_PATTERN','QA-R6','READY',
  'wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/81111111-1111-4111-8111-111111111111/qa-preview-proof.png',
  'qa-preview-proof.png','image/png',100,
  '11111111-1111-4111-8111-111111111111');
INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES(
  '71111111-1111-4111-8111-111111111111','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/81111111-1111-4111-8111-111111111111/qa-preview-proof.png',
  'v1',clock_timestamp(),'10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}',false);
ALTER TABLE public.wos_qa_verified_image_proofs
  DISABLE TRIGGER wos_qa_trusted_proof_guard;
INSERT INTO public.wos_qa_verified_image_proofs(
  image_id,organization_id,order_id,storage_bucket,storage_path,
  storage_object_id,storage_object_version,storage_object_updated_at,
  actor_user_id,verified_sha256,verified_at,expires_at)
VALUES(
  '81111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '88888888-8888-4888-8888-888888888888','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/81111111-1111-4111-8111-111111111111/qa-preview-proof.png',
  '71111111-1111-4111-8111-111111111111','v1',
  (SELECT updated_at FROM storage.objects WHERE id='71111111-1111-4111-8111-111111111111'),
  '10101010-1010-4010-8010-101010101010',repeat('a',64),
  clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
ALTER TABLE public.wos_qa_verified_image_proofs
  ENABLE TRIGGER wos_qa_trusted_proof_guard;

DO $$
BEGIN
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'REVISION_GATE_MUST_DEFAULT_CLOSED';
  END IF;
END $$;

-- Gate OFF blocks Storage INSERT.
SELECT set_config(
  'request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
SET ROLE authenticated;
DO $$
DECLARE v_path text := 'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82222222-2222-4222-8222-222222222222/qa-preview-proof.png';
BEGIN
  BEGIN
    INSERT INTO storage.objects(
      id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
    VALUES('72222222-2222-4222-8222-222222222222','wos-private',v_path,'v2',
      clock_timestamp(),'10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"100"}',false);
    RAISE EXCEPTION 'GATE_OFF_STORAGE_INSERT_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Gate OFF blocks the service-role trusted proof RPC for QA-R*.
INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES(
  '72333333-3333-4333-8333-333333333333','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82333333-3333-4333-8333-333333333333/qa-preview-proof.png',
  'v2',clock_timestamp(),'10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}',false);
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_m2_record_trusted_proof(
      '81000000-0000-4000-8000-000000000001',
      '88888888-8888-4888-8888-888888888888',
      '82333333-3333-4333-8333-333333333333','FILM_PATTERN',
      '10101010-1010-4010-8010-101010101010',7,
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82333333-3333-4333-8333-333333333333/qa-preview-proof.png',
      '72333333-3333-4333-8333-333333333333','v2',
      (SELECT updated_at FROM storage.objects
       WHERE id='72333333-3333-4333-8333-333333333333'),
      repeat('b',64));
    RAISE EXCEPTION 'GATE_OFF_PROOF_INSERT_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- The restricted Edge RPC cannot be used to impersonate a viewer, an
-- unknown user, or a sales profile from another organization.
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_m2_record_trusted_proof(
      '81000000-0000-4000-8000-000000000010',
      '88888888-8888-4888-8888-888888888888',
      '82333333-3333-4333-8333-333333333333','FILM_PATTERN',
      '40404040-4040-4040-8040-404040404040',7,
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82333333-3333-4333-8333-333333333333/qa-preview-proof.png',
      '72333333-3333-4333-8333-333333333333','v2',
      (SELECT updated_at FROM storage.objects
       WHERE id='72333333-3333-4333-8333-333333333333'),
      repeat('d',64));
    RAISE EXCEPTION 'VIEWER_ACTOR_IMPERSONATION_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.wos_qa_p2_m2_record_trusted_proof(
      '81000000-0000-4000-8000-000000000011',
      '88888888-8888-4888-8888-888888888888',
      '82333333-3333-4333-8333-333333333333','FILM_PATTERN',
      '50505050-5050-4050-8050-505050505050',7,
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82333333-3333-4333-8333-333333333333/qa-preview-proof.png',
      '72333333-3333-4333-8333-333333333333','v2',
      (SELECT updated_at FROM storage.objects
       WHERE id='72333333-3333-4333-8333-333333333333'),
      repeat('d',64));
    RAISE EXCEPTION 'CROSS_ORG_ACTOR_IMPERSONATION_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.wos_qa_p2_m2_record_trusted_proof(
      '81000000-0000-4000-8000-000000000012',
      '88888888-8888-4888-8888-888888888888',
      '82333333-3333-4333-8333-333333333333','FILM_PATTERN',
      '60606060-6060-4060-8060-606060606060',7,
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82333333-3333-4333-8333-333333333333/qa-preview-proof.png',
      '72333333-3333-4333-8333-333333333333','v2',
      (SELECT updated_at FROM storage.objects
       WHERE id='72333333-3333-4333-8333-333333333333'),
      repeat('d',64));
    RAISE EXCEPTION 'UNKNOWN_ACTOR_IMPERSONATION_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- DRAFT proof writes remain independent of the QA revision Gate.
INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES(
  '73333333-3333-4333-8333-333333333333','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/99999999-9999-4999-8999-999999999999/images/product/versions/V1/83333333-3333-4333-8333-333333333333/qa-preview-proof.png',
  'v1',clock_timestamp(),'10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}',false);
SET ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_qa_p2_m2_record_trusted_proof(
    '81000000-0000-4000-8000-000000000002',
    '99999999-9999-4999-8999-999999999999',
    '83333333-3333-4333-8333-333333333333',
    'PRODUCT','10101010-1010-4010-8010-101010101010',1,
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/99999999-9999-4999-8999-999999999999/images/product/versions/V1/83333333-3333-4333-8333-333333333333/qa-preview-proof.png',
    '73333333-3333-4333-8333-333333333333','v1',
    (SELECT updated_at FROM storage.objects
     WHERE id='73333333-3333-4333-8333-333333333333'),
    repeat('c',64));
  IF r->>'status'<>'CREATED'
    OR r->>'actorUserId'<>'10101010-1010-4010-8010-101010101010'
    OR r->>'actorProfileId'<>'11111111-1111-4111-8111-111111111111'
  THEN RAISE EXCEPTION 'DRAFT_PROOF_RPC_FAILED: %',r; END IF;
END $$;
RESET ROLE;

-- Wrong order, wrong organization, expired and over-15-minute Gates all fail.
UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_REVISION_GATE',
    allowed_order_id='33333333-3333-4333-8333-333333333333',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
WHERE gate_name='M2_OFFICE_WRITES';
DO $$
BEGIN
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'WRONG_ORDER_GATE_WAS_ALLOWED';
  END IF;
  UPDATE public.wos_qa_p2_m2_gate
  SET allowed_order_id='88888888-8888-4888-8888-888888888888',
      allowed_organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  WHERE gate_name='M2_OFFICE_WRITES';
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'WRONG_ORG_GATE_WAS_ALLOWED';
  END IF;
  UPDATE public.wos_qa_p2_m2_gate
  SET allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      enabled_until=clock_timestamp()-interval '1 second'
  WHERE gate_name='M2_OFFICE_WRITES';
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'EXPIRED_GATE_WAS_ALLOWED';
  END IF;
  UPDATE public.wos_qa_p2_m2_gate
  SET enabled_until=clock_timestamp()+interval '16 minutes'
  WHERE gate_name='M2_OFFICE_WRITES';
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'OVER_15_MINUTE_GATE_WAS_ALLOWED';
  END IF;
END $$;

-- Viewer and cross-organization profiles fail even with a valid target Gate.
UPDATE public.wos_qa_p2_m2_gate
SET enabled_until=clock_timestamp()+interval '10 minutes',
    allowed_order_id='88888888-8888-4888-8888-888888888888',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
WHERE gate_name='M2_OFFICE_WRITES';
DO $$
BEGIN
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '44444444-4444-4444-8444-444444444444') THEN
    RAISE EXCEPTION 'VIEWER_GATE_WAS_ALLOWED';
  END IF;
  IF public.wos_qa_revision_gate_allows(
    '88888888-8888-4888-8888-888888888888',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '55555555-5555-4555-8555-555555555555') THEN
    RAISE EXCEPTION 'CROSS_ORG_PROFILE_WAS_ALLOWED';
  END IF;
END $$;

-- Correct scoped Gate allows Storage, trusted proof, and real RPC registration.
SELECT set_config(
  'request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
SET ROLE authenticated;
INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES(
  '72222222-2222-4222-8222-222222222222','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82222222-2222-4222-8222-222222222222/qa-preview-proof.png',
  'v2',clock_timestamp(),'10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}',false);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_qa_p2_m2_record_trusted_proof(
    '81000000-0000-4000-8000-000000000003',
    '88888888-8888-4888-8888-888888888888',
    '82222222-2222-4222-8222-222222222222','FILM_PATTERN',
    '10101010-1010-4010-8010-101010101010',7,
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82222222-2222-4222-8222-222222222222/qa-preview-proof.png',
    '72222222-2222-4222-8222-222222222222','v2',
    (SELECT updated_at FROM storage.objects
     WHERE id='72222222-2222-4222-8222-222222222222'),
    repeat('b',64));
  IF r->>'status'<>'CREATED' OR r->>'actorProfileId'<>
    '11111111-1111-4111-8111-111111111111'
  THEN RAISE EXCEPTION 'REVISION_PROOF_RPC_FAILED: %',r; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_register_qa_revision_image(
    '88888888-8888-4888-8888-888888888888',
    '82222222-2222-4222-8222-222222222222','FILM_PATTERN',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/82222222-2222-4222-8222-222222222222/qa-preview-proof.png');
  IF r->>'status'<>'CREATED'
    OR r->>'supersededImageId'<>'81111111-1111-4111-8111-111111111111'
  THEN RAISE EXCEPTION 'REVISION_RPC_FAILED: %',r; END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT image_status FROM public.wos_reference_images
      WHERE id='81111111-1111-4111-8111-111111111111')<>'SUPERSEDED' THEN
    RAISE EXCEPTION 'OLD_IMAGE_NOT_SUPERSEDED';
  END IF;
  IF (SELECT supersedes_image_id FROM public.wos_reference_images
      WHERE id='82222222-2222-4222-8222-222222222222')
    <>'81111111-1111-4111-8111-111111111111' THEN
    RAISE EXCEPTION 'NEW_IMAGE_NOT_LINKED_TO_PREDECESSOR';
  END IF;
END $$;

-- A real revision-image RPC on a signed READINESS_CHECK order must revoke both
-- signatures and downgrade the order before the transaction commits.
UPDATE public.wos_production_orders
SET workflow_status='READINESS_CHECK',version=10
WHERE id='88888888-8888-4888-8888-888888888888';
INSERT INTO public.wos_visual_baselines(
  id,organization_id,entity_type,entity_id,version_label,status,
  confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,
  office_confirmed_at,workshop_confirmed_at,superseded_at)
VALUES(
  '85555555-5555-4555-8555-555555555555',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
  '88888888-8888-4888-8888-888888888888','QA-R6','CURRENT',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',NULL);
UPDATE public.wos_visual_baselines
SET office_proof_set_digest=repeat('d',64),
    office_post_order_version=9,
    workshop_proof_set_digest=repeat('d',64),
    workshop_post_order_version=10
WHERE id='85555555-5555-4555-8555-555555555555';
INSERT INTO public.wos_visual_baseline_items(
  baseline_id,reference_image_id,display_order,is_required)
VALUES(
  '85555555-5555-4555-8555-555555555555',
  '82222222-2222-4222-8222-222222222222',0,true);
INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES(
  '74444444-4444-4444-8444-444444444444','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/84444444-4444-4444-8444-444444444444/qa-preview-proof.png',
  'v3',clock_timestamp(),'10101010-1010-4010-8010-101010101010',
  '{"mimetype":"image/png","size":"100"}',false);
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_qa_p2_m2_record_trusted_proof(
    '81000000-0000-4000-8000-000000000004',
    '88888888-8888-4888-8888-888888888888',
    '84444444-4444-4444-8444-444444444444','FILM_PATTERN',
    '10101010-1010-4010-8010-101010101010',10,
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/84444444-4444-4444-8444-444444444444/qa-preview-proof.png',
    '74444444-4444-4444-8444-444444444444','v3',
    (SELECT updated_at FROM storage.objects
     WHERE id='74444444-4444-4444-8444-444444444444'),
    repeat('e',64));
  IF r->>'status'<>'CREATED' OR (r->>'orderVersionAfter')::integer<>11
  THEN RAISE EXCEPTION 'SIGNED_PROOF_RPC_FAILED: %',r; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE service_role;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_qa_p2_m2_record_trusted_proof(
    '81000000-0000-4000-8000-000000000004',
    '88888888-8888-4888-8888-888888888888',
    '84444444-4444-4444-8444-444444444444','FILM_PATTERN',
    '10101010-1010-4010-8010-101010101010',10,
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/84444444-4444-4444-8444-444444444444/qa-preview-proof.png',
    '74444444-4444-4444-8444-444444444444','v3',
    (SELECT updated_at FROM storage.objects
     WHERE id='74444444-4444-4444-8444-444444444444'),
    repeat('e',64));
  IF r->>'status'<>'REPLAYED' OR (r->>'orderVersionAfter')::integer<>11
  THEN RAISE EXCEPTION 'SIGNED_PROOF_REPLAY_FAILED: %',r; END IF;
END $$;
RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_register_qa_revision_image(
    '88888888-8888-4888-8888-888888888888',
    '84444444-4444-4444-8444-444444444444','FILM_PATTERN',
    'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/88888888-8888-4888-8888-888888888888/images/film-pattern/versions/QA-R6/84444444-4444-4444-8444-444444444444/qa-preview-proof.png');
  IF r->>'status'<>'CREATED'
    OR r->>'supersededImageId'<>'82222222-2222-4222-8222-222222222222'
  THEN RAISE EXCEPTION 'SIGNED_REVISION_RPC_FAILED: %',r; END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT workflow_status||':'||version FROM public.wos_production_orders
      WHERE id='88888888-8888-4888-8888-888888888888')
    <>'WAITING_MATERIAL:11' THEN
    RAISE EXCEPTION 'SIGNED_REVISION_DID_NOT_DOWNGRADE';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.wos_visual_baselines
    WHERE id='85555555-5555-4555-8555-555555555555'
      AND (confirmed_by_office_profile_id IS NOT NULL
        OR confirmed_by_workshop_profile_id IS NOT NULL
        OR office_proof_set_digest IS NOT NULL
        OR workshop_proof_set_digest IS NOT NULL)
  ) THEN RAISE EXCEPTION 'SIGNED_REVISION_DID_NOT_CLEAR_SIGNOFFS'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.wos_status_history
    WHERE entity_id='88888888-8888-4888-8888-888888888888'
      AND reason_code='QA_M2_EVIDENCE_INVALIDATED'
      AND previous_status='READINESS_CHECK'
      AND next_status='WAITING_MATERIAL'
  ) THEN RAISE EXCEPTION 'SIGNED_REVISION_HISTORY_MISSING'; END IF;
END $$;

UPDATE public.wos_qa_p2_m2_gate
SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,allowed_organization_id=NULL
WHERE gate_name='M2_OFFICE_WRITES';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.wos_qa_trusted_proof_receipts)<>3 THEN
    RAISE EXCEPTION 'TRUSTED_PROOF_RECEIPT_COUNT_INVALID';
  END IF;
  IF (SELECT count(*) FROM public.wos_qa_verified_image_proofs
      WHERE actor_user_id IS NULL)<>0 THEN
    RAISE EXCEPTION 'TRUSTED_PROOF_ACTOR_MISSING';
  END IF;
  IF has_table_privilege(
    'service_role','public.wos_qa_verified_image_proofs','INSERT')
    OR has_table_privilege(
      'service_role','public.wos_qa_verified_image_proofs','UPDATE')
  THEN RAISE EXCEPTION 'SERVICE_ROLE_DIRECT_PROOF_WRITE_REMAINS'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
        AND NOT tgisinternal
        AND tgname IN (
          'wos_qa_trusted_proof_guard',
          'wos_qa_trusted_proof_write_guard',
          'wos_qa_p2_m2_verified_proof_guard'
        ))<>1
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
        AND tgname='wos_qa_trusted_proof_guard'
    )
  THEN RAISE EXCEPTION 'TRUSTED_PROOF_GUARD_NOT_UNIQUE'; END IF;
END $$;

SELECT 'QA_REVISION_GATE_OFF_WRONG_SCOPE_AND_ROLE=DENIED' AS evidence;
SELECT 'QA_REVISION_GATE_DRAFT_FLOW_UNAFFECTED=PASS' AS evidence;
SELECT 'QA_REVISION_STORAGE_PROOF_AND_RPC=PASS' AS evidence;
SELECT 'QA_REVISION_SIGNOFF_INVALIDATION_AND_DOWNGRADE=PASS' AS evidence;
SELECT 'QA_TRUSTED_PROOF_SERVICE_ROLE_NULL_AUTH_UID=PASS' AS evidence;
SELECT 'QA_TRUSTED_PROOF_ACTOR_IMPERSONATION=DENIED' AS evidence;
SELECT 'QA_TRUSTED_PROOF_IDEMPOTENT_REPLAY=PASS' AS evidence;
SELECT 'QA_TRUSTED_PROOF_GUARD_UNIQUE=PASS' AS evidence;
