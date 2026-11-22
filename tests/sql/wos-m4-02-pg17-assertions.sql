\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA tests TO authenticated, anon;

CREATE FUNCTION tests.wos_m4_expect_error(
  p_sql text,
  p_sqlstate text,
  p_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $expect$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate
      OR (p_message IS NOT NULL AND SQLERRM <> p_message)
    THEN
      RAISE EXCEPTION
        'UNEXPECTED_ERROR expected_state=% actual_state=% expected_message=% actual_message=%',
        p_sqlstate, SQLSTATE, p_message, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED state=% message=%',
    p_sqlstate, p_message;
END;
$expect$;
GRANT EXECUTE ON FUNCTION tests.wos_m4_expect_error(text,text,text)
  TO authenticated, anon;

CREATE FUNCTION tests.wos_m4_expect_download_denied(p_path text)
RETURNS void
LANGUAGE plpgsql
AS $download_denied$
BEGIN
  IF public.wos_qa_m4_can_download_proof('wos-private', p_path)
      IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_DOWNLOAD_GUARD_ACCEPTED_DENIED_SNAPSHOT';
  END IF;
END;
$download_denied$;
GRANT EXECUTE ON FUNCTION tests.wos_m4_expect_download_denied(text)
  TO authenticated;

DO $metadata$
DECLARE
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_authenticated_execute boolean;
  v_anon_execute boolean;
  v_table regclass;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
         pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    INTO v_owner, v_security_definer, v_config,
         v_authenticated_execute, v_anon_execute
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  );

  IF v_owner <> 'wos_m4_proof_verifier_owner'
    OR v_security_definer IS NOT TRUE
    OR v_config IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR v_authenticated_execute IS NOT TRUE
    OR v_anon_execute IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_FUNCTION_SECURITY_METADATA_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'wos_m4_proof_verifier_owner'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb
        OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'M4_OWNER_ROLE_HAS_EXCESS_ATTRIBUTES';
  END IF;

  IF pg_catalog.has_table_privilege(
      'wos_m4_proof_verifier_owner',
      'public.wos_qa_verified_image_proofs',
      'INSERT,UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'wos_m4_proof_verifier_owner',
      'public.wos_qa_p2_m2_receipts',
      'INSERT,UPDATE,DELETE'
    )
  THEN
    RAISE EXCEPTION 'M4_OWNER_HAS_PRIVATE_TABLE_DML';
  END IF;

  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_verified_image_proofs',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_receipts',
      'SELECT'
    )
  THEN
    RAISE EXCEPTION 'M4_AUTHENTICATED_PRIVATE_TABLE_SELECT_EXPANDED';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.profiles'::regclass,
    'public.wos_production_orders'::regclass,
    'public.wos_visual_baselines'::regclass,
    'public.wos_visual_baseline_items'::regclass,
    'public.wos_reference_images'::regclass,
    'public.wos_qa_verified_image_proofs'::regclass,
    'public.wos_qa_p2_m2_receipts'::regclass,
    'storage.objects'::regclass
  ]
  LOOP
    IF pg_catalog.has_table_privilege(
        'wos_m4_proof_verifier_owner',
        v_table,
        'SELECT'
      ) IS NOT TRUE
      OR pg_catalog.has_table_privilege(
        'wos_m4_proof_verifier_owner',
        v_table,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    THEN
      RAISE EXCEPTION 'M4_OWNER_TABLE_PRIVILEGE_INVALID: %', v_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles owner_role
      ON owner_role.oid = membership.member
    WHERE owner_role.rolname = 'wos_m4_proof_verifier_owner'
  ) THEN
    RAISE EXCEPTION 'M4_OWNER_HAS_ROLE_MEMBERSHIPS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
    WHERE p.oid = pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'M4_PUBLIC_SNAPSHOT_EXECUTE_GRANTED';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE policyname LIKE 'wos_m4_proof_owner_%'
      AND 'wos_m4_proof_verifier_owner' = ANY(roles)
  ) <> 8 THEN
    RAISE EXCEPTION 'M4_OWNER_POLICY_INVENTORY_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
         pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    INTO v_owner, v_security_definer, v_config,
         v_authenticated_execute, v_anon_execute
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  );
  IF v_owner <> 'wos_m4_proof_verifier_owner'
    OR v_security_definer IS NOT TRUE
    OR v_config IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR v_authenticated_execute IS NOT TRUE
    OR v_anon_execute IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_DOWNLOAD_GUARD_SECURITY_METADATA_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'wos_m4_proof_verifier_storage_read'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles)
  ) <> 1 THEN
    RAISE EXCEPTION 'M4_DOWNLOAD_POLICY_INVENTORY_INVALID';
  END IF;
END;
$metadata$;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $office_positive$
DECLARE
  r jsonb;
BEGIN
  r := public.wos_qa_m4_readonly_proof_snapshot(
    '33333333-3333-4333-8333-333333333333',11,'QA-R6');
  IF r->>'orderId' <> '33333333-3333-4333-8333-333333333333'
    OR (r->>'orderVersion')::integer <> 11
    OR r->>'versionLabel' <> 'QA-R6'
    OR (r->>'metadataSnapshotValid')::boolean IS NOT TRUE
    OR (r->>'officeWorkshopDistinct')::boolean IS NOT TRUE
    OR (r->>'proofSetDigestMatch')::boolean IS NOT TRUE
    OR (r->>'m2ReceiptChainComplete')::boolean IS NOT TRUE
    OR (r->>'canStart')::boolean IS NOT FALSE
    OR r->>'snapshotFingerprint' !~ '^[a-f0-9]{64}$'
    OR jsonb_array_length(r->'images') <> 4
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(r) AS key
      WHERE key IN (
        'storagePath','storage_path','objectId','storageObjectId',
        'objectVersion','rawProof','receipts','organizationId')
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(r->'images') AS image
      CROSS JOIN LATERAL jsonb_object_keys(image) AS key
      WHERE key IN (
        'storagePath','storage_path','objectId','storageObjectId',
        'objectVersion','objectUpdatedAt')
    )
  THEN
    RAISE EXCEPTION 'M4_OFFICE_SAFE_DTO_INVALID: %',r;
  END IF;
END;
$office_positive$;
DO $office_storage_positive$
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM storage.objects
    WHERE bucket_id = 'wos-private'
      AND name =
        'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
  ) <> 1
    OR public.wos_qa_m4_can_download_proof(
      'wos-private',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
    ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'M4_OFFICE_STORAGE_READ_FAILED';
  END IF;
END;
$office_storage_positive$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $operator_positive$
DECLARE
  r jsonb;
BEGIN
  r := public.wos_qa_m4_readonly_proof_snapshot(
    '33333333-3333-4333-8333-333333333333',11,'QA-R6');
  IF (r->>'officeWorkshopDistinct')::boolean IS NOT TRUE
    OR (r->>'canStart')::boolean IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_OPERATOR_READ_FAILED';
  END IF;
END;
$operator_positive$;
DO $operator_storage_positive$
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM storage.objects
    WHERE bucket_id = 'wos-private'
      AND name =
        'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/signed-sample/versions/QA-R6/43333333-3333-4333-8333-333333333333/qa-preview-proof.png'
  ) <> 1
  THEN
    RAISE EXCEPTION 'M4_OPERATOR_STORAGE_READ_FAILED';
  END IF;
END;
$operator_storage_positive$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '40404040-4040-4040-8040-404040404040',
  false
);
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/45555555-5555-4555-8555-555555555555/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  '42501',
  'NOT_AUTHORIZED'
);
DO $viewer_storage_denied$
BEGIN
  IF public.wos_qa_m4_can_download_proof(
      'wos-private',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
    ) IS NOT FALSE
    OR EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'wos-private'
        AND name =
          'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
    )
  THEN
    RAISE EXCEPTION 'M4_VIEWER_STORAGE_ACCESS_LEAK';
  END IF;
END;
$viewer_storage_denied$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '50505050-5050-4050-8050-505050505050',
  false
);
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  '42501',
  'ORDER_NOT_AVAILABLE'
);
DO $cross_org_storage_denied$
BEGIN
  IF public.wos_qa_m4_can_download_proof(
      'wos-private',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
    ) IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_CROSS_ORG_STORAGE_ACCESS_LEAK';
  END IF;
END;
$cross_org_storage_denied$;
RESET ROLE;

SET ROLE anon;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  '42501'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_can_download_proof(
      'wos-private',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png')$$,
  '42501'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '99999999-9999-4999-8999-999999999999',
  false
);
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  '42501',
  'NOT_AUTHORIZED'
);
RESET ROLE;

BEGIN;
UPDATE public.profiles SET is_active = false
WHERE user_id = '20202020-2020-4020-8020-202020202020';
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  '42501',
  'NOT_AUTHORIZED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_key;
INSERT INTO public.profiles(id,user_id,org_id,role,is_active)
VALUES(
  '91919191-9191-4191-8191-919191919191',
  '10101010-1010-4010-8010-101010101010',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'sales',true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  '42501',
  'NOT_AUTHORIZED'
);
RESET ROLE;
ROLLBACK;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',10,'QA-R6')$$,
  'PT409',
  'VERSION_CONFLICT'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R5')$$,
  'PT409',
  'VERSION_CONFLICT'
);
RESET ROLE;

BEGIN;
ALTER TABLE public.wos_reference_images
  DISABLE TRIGGER wos_qa_p2_m2_reference_image_guard;
INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path
) VALUES(
  '45555555-5555-4555-8555-555555555555',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'PRODUCTION_ORDER',
  '33333333-3333-4333-8333-333333333333',
  'PRODUCT','QA-R6','READY','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/45555555-5555-4555-8555-555555555555/qa-preview-proof.png'
);
INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,is_delete_marker
) VALUES(
  '55555555-5555-4555-8555-555555555555','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/45555555-5555-4555-8555-555555555555/qa-preview-proof.png',
  'v-fifth',now(),false
);
INSERT INTO public.wos_qa_verified_image_proofs(
  image_id,organization_id,order_id,storage_bucket,storage_path,
  storage_object_id,storage_object_version,storage_object_updated_at,
  actor_user_id,verified_sha256,verified_at,expires_at
) VALUES(
  '45555555-5555-4555-8555-555555555555',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333','wos-private',
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/45555555-5555-4555-8555-555555555555/qa-preview-proof.png',
  '55555555-5555-4555-8555-555555555555','v-fifth',now(),
  '10101010-1010-4010-8010-101010101010',
  encode(sha256(convert_to('fifth-product','UTF8')),'hex'),
  now()-interval '1 minute',now()+interval '20 minutes'
);
ALTER TABLE public.wos_reference_images
  ENABLE TRIGGER wos_qa_p2_m2_reference_image_guard;
INSERT INTO public.wos_visual_baseline_items(
  baseline_id,reference_image_id,display_order,is_required
) SELECT id,'45555555-5555-4555-8555-555555555555',4,true
FROM public.wos_visual_baselines
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/45555555-5555-4555-8555-555555555555/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'BASELINE_CARDINALITY_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
INSERT INTO public.wos_visual_baseline_items(
  baseline_id,reference_image_id,display_order,is_required
) SELECT id,'41111111-1111-4111-8111-111111111111',4,true
FROM public.wos_visual_baselines
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'BASELINE_CARDINALITY_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
DELETE FROM public.wos_visual_baseline_items
WHERE baseline_id = (
  SELECT id FROM public.wos_visual_baselines
  WHERE entity_id = '33333333-3333-4333-8333-333333333333'
    AND status = 'CURRENT'
)
  AND reference_image_id = '44444444-4444-4444-8444-444444444444';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'BASELINE_CARDINALITY_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_visual_baselines
SET confirmed_by_workshop_profile_id = confirmed_by_office_profile_id
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'SIGNOFF_MISMATCH'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_visual_baselines
SET workshop_proof_set_digest = repeat('b',64)
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'SIGNOFF_MISMATCH'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_visual_baselines
SET office_proof_set_digest = repeat('b',64),
    workshop_proof_set_digest = repeat('b',64)
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_SET_MISMATCH'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.profiles
SET is_active = false
WHERE id = '22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'SIGNOFF_MISMATCH'
);
RESET ROLE;
ROLLBACK;

BEGIN;
DROP INDEX public.wos_p2_m2_one_current_baseline_per_entity;
INSERT INTO public.wos_visual_baselines(
  id,organization_id,entity_type,entity_id,version_label,status,
  confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,
  office_confirmed_at,workshop_confirmed_at,created_at,superseded_at,
  office_proof_set_digest,office_post_order_version,
  workshop_proof_set_digest,workshop_post_order_version
)
SELECT
  '46666666-6666-4666-8666-666666666666',
  organization_id,entity_type,entity_id,version_label,status,
  confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,
  office_confirmed_at,workshop_confirmed_at,created_at,superseded_at,
  office_proof_set_digest,office_post_order_version,
  workshop_proof_set_digest,workshop_post_order_version
FROM public.wos_visual_baselines
WHERE entity_id = '33333333-3333-4333-8333-333333333333'
  AND status = 'CURRENT';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'BASELINE_CARDINALITY_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_verified_image_proofs
SET expires_at = clock_timestamp() - interval '1 second'
WHERE image_id = '41111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_EXPIRED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
SET ROLE authenticated;
DO $expires_during$
DECLARE
  r jsonb;
BEGIN
  r := public.wos_qa_m4_readonly_proof_snapshot(
    '33333333-3333-4333-8333-333333333333',11,'QA-R6');
  IF r IS NULL THEN
    RAISE EXCEPTION 'M4_FIRST_SNAPSHOT_MISSING';
  END IF;
END;
$expires_during$;
RESET ROLE;
UPDATE public.wos_qa_verified_image_proofs
SET expires_at = clock_timestamp() - interval '1 second'
WHERE image_id = '41111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_EXPIRED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE storage.objects
SET version = 'replaced-version', updated_at = clock_timestamp()
WHERE id = '51111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_OBJECT_CHANGED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_verified_image_proofs
SET storage_object_version = NULL
WHERE image_id = '41111111-1111-4111-8111-111111111111';
UPDATE storage.objects
SET version = NULL
WHERE id = '51111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
DO $null_object_version_guard$
BEGIN
  IF public.wos_qa_m4_can_download_proof(
      'wos-private',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
    ) IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_NULL_OBJECT_VERSION_GUARD_ACCEPTED';
  END IF;
END;
$null_object_version_guard$;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_NOT_AVAILABLE'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE storage.objects
SET archived_at = clock_timestamp()
WHERE id = '51111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_OBJECT_CHANGED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE storage.objects
SET is_delete_marker = true
WHERE id = '51111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_OBJECT_CHANGED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
DELETE FROM storage.objects
WHERE id = '51111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
DO $deleted_storage_guard$
BEGIN
  IF public.wos_qa_m4_can_download_proof(
      'wos-private',
      'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
    ) IS NOT FALSE
  THEN
    RAISE EXCEPTION 'M4_DELETED_STORAGE_GUARD_ACCEPTED';
  END IF;
END;
$deleted_storage_guard$;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_OBJECT_CHANGED'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_verified_image_proofs
SET verified_sha256 = repeat('0',64)
WHERE image_id = '41111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'PROOF_SET_MISMATCH'
);
RESET ROLE;
ROLLBACK;

BEGIN;
DELETE FROM public.wos_qa_p2_m2_receipts
WHERE action = 'FINAL_READINESS_CONFIRM'
  AND order_id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'RECEIPT_CHAIN_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
INSERT INTO public.wos_qa_p2_m2_receipts(
  request_id,organization_id,order_id,expected_version,
  production_version_label,action,actor_profile_id,payload_fingerprint,
  before_spec_digest,after_spec_digest,receipt_digest,result_json,created_at
)
SELECT
  '72000000-0000-4000-8000-000000000099',
  organization_id,order_id,expected_version,
  production_version_label,action,actor_profile_id,payload_fingerprint,
  before_spec_digest,after_spec_digest,receipt_digest,result_json,
  clock_timestamp()
FROM public.wos_qa_p2_m2_receipts
WHERE action = 'FINAL_READINESS_CONFIRM'
  AND order_id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'RECEIPT_CHAIN_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_p2_m2_receipts
SET expected_version = 7
WHERE action = 'BASELINE_OFFICE_CONFIRM'
  AND order_id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'RECEIPT_CHAIN_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_p2_m2_receipts
SET receipt_digest = repeat('a',64)
WHERE action = 'FINAL_READINESS_CONFIRM'
  AND order_id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_download_denied(
  'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/33333333-3333-4333-8333-333333333333/images/product/versions/QA-R6/41111111-1111-4111-8111-111111111111/qa-preview-proof.png'
);
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'RECEIPT_CHAIN_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_p2_m2_receipts
SET result_json = pg_catalog.jsonb_set(result_json, '{canStart}', 'true'::jsonb)
WHERE action = 'FINAL_READINESS_CONFIRM'
  AND order_id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'RECEIPT_CHAIN_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_qa_p2_m2_receipts
SET result_json = pg_catalog.jsonb_set(
  result_json,
  '{version}',
  to_jsonb('not-an-integer'::text)
)
WHERE action = 'FINAL_READINESS_CONFIRM'
  AND order_id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'RECEIPT_CHAIN_INVALID'
);
RESET ROLE;
ROLLBACK;

BEGIN;
UPDATE public.wos_production_orders
SET version = 12
WHERE id = '33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
SELECT tests.wos_m4_expect_error(
  $$SELECT public.wos_qa_m4_readonly_proof_snapshot(
      '33333333-3333-4333-8333-333333333333',11,'QA-R6')$$,
  'PT409',
  'VERSION_CONFLICT'
);
RESET ROLE;
ROLLBACK;

WITH
snapshot_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl,
    p.proconfig AS config,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) AS definition_sha256
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  )
),
guard_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl,
    p.proconfig AS config,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) AS definition_sha256
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  )
),
inventory AS (
  SELECT pg_catalog.jsonb_build_object(
    'snapshotFunction', (
      SELECT pg_catalog.jsonb_build_object(
        'owner', owner,
        'acl', acl,
        'config', config,
        'definitionSha256', definition_sha256
      )
      FROM snapshot_function
    ),
    'guardFunction', (
      SELECT pg_catalog.jsonb_build_object(
        'owner', owner,
        'acl', acl,
        'config', config,
        'definitionSha256', definition_sha256
      )
      FROM guard_function
    ),
    'ownerRole', (
      SELECT pg_catalog.jsonb_build_object(
        'rolcanlogin', role.rolcanlogin,
        'rolinherit', role.rolinherit,
        'rolsuper', role.rolsuper,
        'rolcreatedb', role.rolcreatedb,
        'rolcreaterole', role.rolcreaterole,
        'rolreplication', role.rolreplication,
        'rolbypassrls', role.rolbypassrls,
        'memberships', COALESCE((
          SELECT pg_catalog.jsonb_agg(parent.rolname ORDER BY parent.rolname)
          FROM pg_catalog.pg_auth_members membership
          JOIN pg_catalog.pg_roles parent
            ON parent.oid = membership.roleid
          WHERE membership.member = role.oid
        ), '[]'::jsonb)
      )
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = 'wos_m4_proof_verifier_owner'
    ),
    'policies', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', policy.schemaname,
          'table', policy.tablename,
          'name', policy.policyname,
          'permissive', policy.permissive,
          'roles', pg_catalog.to_jsonb(policy.roles),
          'cmd', policy.cmd,
          'qual', policy.qual,
          'withCheck', policy.with_check
        )
        ORDER BY policy.schemaname, policy.tablename, policy.policyname
      )
      FROM pg_catalog.pg_policies policy
      WHERE policy.policyname LIKE 'wos_m4_%'
    )
  ) AS value
)
SELECT
  'WOS_M4_02_SNAPSHOT_FUNCTION_SHA256='
    || snapshot.definition_sha256 AS snapshot_fingerprint
FROM snapshot_function snapshot;

WITH
snapshot_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl,
    p.proconfig AS config,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) AS definition_sha256
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  )
),
guard_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl,
    p.proconfig AS config,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) AS definition_sha256
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  )
),
inventory AS (
  SELECT pg_catalog.jsonb_build_object(
    'snapshotFunction', (
      SELECT pg_catalog.jsonb_build_object(
        'owner', owner,
        'acl', acl,
        'config', config,
        'definitionSha256', definition_sha256
      )
      FROM snapshot_function
    ),
    'guardFunction', (
      SELECT pg_catalog.jsonb_build_object(
        'owner', owner,
        'acl', acl,
        'config', config,
        'definitionSha256', definition_sha256
      )
      FROM guard_function
    ),
    'ownerRole', (
      SELECT pg_catalog.jsonb_build_object(
        'rolcanlogin', role.rolcanlogin,
        'rolinherit', role.rolinherit,
        'rolsuper', role.rolsuper,
        'rolcreatedb', role.rolcreatedb,
        'rolcreaterole', role.rolcreaterole,
        'rolreplication', role.rolreplication,
        'rolbypassrls', role.rolbypassrls,
        'memberships', COALESCE((
          SELECT pg_catalog.jsonb_agg(parent.rolname ORDER BY parent.rolname)
          FROM pg_catalog.pg_auth_members membership
          JOIN pg_catalog.pg_roles parent
            ON parent.oid = membership.roleid
          WHERE parent.oid = role.oid
        ), '[]'::jsonb)
      )
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = 'wos_m4_proof_verifier_owner'
    ),
    'policies', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', policy.schemaname,
          'table', policy.tablename,
          'name', policy.policyname,
          'permissive', policy.permissive,
          'roles', pg_catalog.to_jsonb(policy.roles),
          'cmd', policy.cmd,
          'qual', policy.qual,
          'withCheck', policy.with_check
        )
        ORDER BY policy.schemaname, policy.tablename, policy.policyname
      )
      FROM pg_catalog.pg_policies policy
      WHERE policy.policyname LIKE 'wos_m4_%'
    )
  ) AS value
)
SELECT
  'WOS_M4_02_GUARD_FUNCTION_SHA256='
    || guard.definition_sha256 AS guard_fingerprint
FROM guard_function guard;

WITH
snapshot_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl,
    p.proconfig AS config,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) AS definition_sha256
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  )
),
guard_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl,
    p.proconfig AS config,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) AS definition_sha256
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  )
),
inventory AS (
  SELECT pg_catalog.jsonb_build_object(
    'snapshotFunction', (
      SELECT pg_catalog.jsonb_build_object(
        'owner', owner,
        'acl', acl,
        'config', config,
        'definitionSha256', definition_sha256
      )
      FROM snapshot_function
    ),
    'guardFunction', (
      SELECT pg_catalog.jsonb_build_object(
        'owner', owner,
        'acl', acl,
        'config', config,
        'definitionSha256', definition_sha256
      )
      FROM guard_function
    ),
    'ownerRole', (
      SELECT pg_catalog.jsonb_build_object(
        'rolcanlogin', role.rolcanlogin,
        'rolinherit', role.rolinherit,
        'rolsuper', role.rolsuper,
        'rolcreatedb', role.rolcreatedb,
        'rolcreaterole', role.rolcreaterole,
        'rolreplication', role.rolreplication,
        'rolbypassrls', role.rolbypassrls,
        'memberships', COALESCE((
          SELECT pg_catalog.jsonb_agg(parent.rolname ORDER BY parent.rolname)
          FROM pg_catalog.pg_auth_members membership
          JOIN pg_catalog.pg_roles parent
            ON parent.oid = membership.roleid
          WHERE membership.member = role.oid
        ), '[]'::jsonb)
      )
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = 'wos_m4_proof_verifier_owner'
    ),
    'policies', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema', policy.schemaname,
          'table', policy.tablename,
          'name', policy.policyname,
          'permissive', policy.permissive,
          'roles', pg_catalog.to_jsonb(policy.roles),
          'cmd', policy.cmd,
          'qual', policy.qual,
          'withCheck', policy.with_check
        )
        ORDER BY policy.schemaname, policy.tablename, policy.policyname
      )
      FROM pg_catalog.pg_policies policy
      WHERE policy.policyname LIKE 'wos_m4_%'
    )
  ) AS value
)
SELECT
  'WOS_M4_02_SECURITY_INVENTORY_SHA256=' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(inventory.value::text, 'UTF8')),
    'hex'
  ) AS security_fingerprint
FROM inventory;

SELECT 'WOS_M4_02_PG17_POSITIVE=PASS';
SELECT 'WOS_M4_02_PG17_NEGATIVE_ROLE_SCOPE=PASS';
SELECT 'WOS_M4_02_PG17_NEGATIVE_PROOF_STATE=PASS';
SELECT 'WOS_M4_02_PG17_NEGATIVE_RECEIPT_CHAIN=PASS';
SELECT 'WOS_M4_02_PG17_OWNER_SECURITY=PASS';
