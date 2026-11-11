-- WOS P8 | NONPRODUCTION BRANCH ONLY, 2026-11-08
-- This is a SQL-role simulation against REAL Supabase Postgres and RLS.
-- It intentionally does NOT prove a binary exists in Storage. The one
-- storage.objects row is synthetic metadata and the proof row is simulated
-- as a privileged Edge-writer inside a transaction that ALWAYS ROLLS BACK.
-- Never execute on Production, customer data or the shared 77-image QA DB.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.wos_verified_image_proofs') IS NULL
  OR to_regprocedure('public.wos_register_uploaded_reference_image(uuid,uuid,text,text)') IS NULL
  OR (SELECT count(*) FROM public.profiles)<>0
  OR (SELECT count(*) FROM public.organizations)<>0
  OR (SELECT count(*) FROM public.wos_production_orders)<>0
  OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
  OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='wos-private' AND public=false)
 THEN RAISE EXCEPTION 'WOS_P8_STAGING_EMPTY_BRANCH_ONLY'; END IF;
END $guard$;

INSERT INTO auth.users(id,instance_id,aud,role) VALUES
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.organizations(id,name) VALUES
 ('aaaaaaaa-1111-1111-1111-111111111111','P8 isolated org A'),
 ('bbbbbbbb-2222-2222-2222-222222222222','P8 isolated org B');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111','admin',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','bbbbbbbb-2222-2222-2222-222222222222','admin',true),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','aaaaaaaa-1111-1111-1111-111111111111','viewer',true),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','44444444-4444-4444-4444-444444444444','aaaaaaaa-1111-1111-1111-111111111111','operator',true);

INSERT INTO public.wos_production_orders (
 id,organization_id,customer_name_snapshot,order_number,product_name,
 sales_owner_profile_id,project_owner_profile_id,priority,version_label,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id)
VALUES (
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 'aaaaaaaa-1111-1111-1111-111111111111','SYNTHETIC','P8-NONPROD-ORDER-001',
 'Synthetic transfer film','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','LOW','V1',10,10,'synthetic',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- THIS METADATA DOES NOT REPRESENT AN ACTUAL BINARY.
INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata,version)
VALUES (
 'ffffffff-ffff-ffff-ffff-ffffffffffff','wos-private',
 'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/qa-preview-proof.png',
 '11111111-1111-1111-1111-111111111111',
 '{"mimetype":"image/png","size":"96"}'::jsonb,'test-v1');

-- A directly authenticated user must fail to register READY without
-- the Edge service-only binary verification proof.
SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
DO $must_fail$
DECLARE blocked boolean:=false; message text;
BEGIN
 BEGIN
  PERFORM public.wos_register_uploaded_reference_image(
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '99999999-9999-9999-9999-999999999999','PRODUCT',
   'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/qa-preview-proof.png');
 EXCEPTION WHEN insufficient_privilege THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  blocked := (message='QA_TRUSTED_BINARY_PROOF_REQUIRED');
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'DIRECT_RPC_PROOF_BYPASS'; END IF;
END $must_fail$;
RESET ROLE;

-- Privileged server-side proof is SIMULATED here, not obtained from actual
-- Storage binary bytes. Binary correctness is a separate live QA gate.
INSERT INTO public.wos_verified_image_proofs(
 image_id,organization_id,order_id,actor_user_id,storage_path,
 storage_object_id,storage_object_version,storage_object_updated_at,
 verified_sha256,expires_at)
SELECT '99999999-9999-9999-9999-999999999999',
 'aaaaaaaa-1111-1111-1111-111111111111',
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 '11111111-1111-1111-1111-111111111111',so.name,so.id,
 so.version,so.updated_at,repeat('a',64),now()+interval '10 minutes'
FROM storage.objects so WHERE so.id='ffffffff-ffff-ffff-ffff-ffffffffffff';

SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
DO $office$
DECLARE image jsonb; readiness uuid; submitted jsonb; replay jsonb;
BEGIN
 IF has_table_privilege('authenticated','public.wos_verified_image_proofs','INSERT')
   OR has_table_privilege('authenticated','public.wos_orphan_cleanup_claims','UPDATE')
 THEN RAISE EXCEPTION 'CLIENT_WRITES_PRIVILEGED_TABLES'; END IF;
 image:=public.wos_register_uploaded_reference_image(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '99999999-9999-9999-9999-999999999999','PRODUCT',
  'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/qa-preview-proof.png');
 IF image->>'status'<>'CREATED' THEN RAISE EXCEPTION 'IMAGE_REGISTER_FAILED_%',image; END IF;
 readiness:=public.wos_confirm_office_completeness(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,'V1','Synthetic office completeness');
 IF readiness IS NULL THEN RAISE EXCEPTION 'OFFICE_READINESS_MISSING'; END IF;
 submitted:=public.wos_submit_production_order(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,'V1',
  '77777777-7777-7777-7777-777777777777');
 IF submitted->>'status'<>'CREATED' THEN RAISE EXCEPTION 'SUBMIT_FAILED_%',submitted; END IF;
 replay:=public.wos_submit_production_order(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,'V1',
  '77777777-7777-7777-7777-777777777777');
 IF replay->>'status'<>'REPLAYED'
   OR replay->>'receiptId'<>submitted->>'receiptId'
 THEN RAISE EXCEPTION 'IDEMPOTENCY_FAILED_%',replay; END IF;
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>1
   OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
   OR (SELECT count(*) FROM public.wos_status_history
       WHERE reason_code='OFFICE_SUBMISSION_COMMITTED')<>1
 THEN RAISE EXCEPTION 'ATOMIC_RECEIPT_OR_HISTORY_MISMATCH'; END IF;
END $office$;
RESET ROLE;

SET LOCAL request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
SET LOCAL ROLE authenticated;
DO $operator$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 OR (SELECT count(*) FROM public.wos_reference_images)<>1
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>1
 THEN RAISE EXCEPTION 'OPERATOR_READ_SUBMITTED_OR_PRIVATE_IMAGE_DENIED'; END IF;
END $operator$;
RESET ROLE;

SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SET LOCAL ROLE authenticated;
DO $viewer$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 OR (SELECT count(*) FROM public.wos_reference_images)<>0
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'SAME_ORG_VIEWER_ACCESS_BYPASS'; END IF;
END $viewer$;
RESET ROLE;

SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SET LOCAL ROLE authenticated;
DO $foreign$
BEGIN
 IF (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 OR (SELECT count(*) FROM public.wos_reference_images)<>0
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'FOREIGN_ORG_ACCESS_BYPASS'; END IF;
END $foreign$;
RESET ROLE;

-- Explicit rollback of all synthetic users, orders, proof rows and metadata.
ROLLBACK;
SELECT
 'WOS_P8_REAL_SUPABASE_BRANCH_RPC_RLS_AND_TX_ROLLBACK_PASS' AS result,
 (SELECT count(*) FROM public.wos_production_orders) AS remaining_orders,
 (SELECT count(*) FROM public.wos_workshop_inbox) AS remaining_inbox,
 (SELECT count(*) FROM public.wos_verified_image_proofs) AS remaining_proofs,
 (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private') AS remaining_storage_metadata,
 (SELECT count(*) FROM auth.users) AS remaining_auth_users;
