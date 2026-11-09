-- Disposable PG17 P8-07 service boundary and transaction test.
-- All synthetic data is confined to a rollback-only transaction.
BEGIN;
DO $guard$ BEGIN IF current_database()<>'wos_p8_replay_ci' THEN
 RAISE EXCEPTION 'DISPOSABLE_P8_CI_ONLY'; END IF; END $guard$;
INSERT INTO auth.users (id,email) VALUES
 ('11111111-1111-1111-1111-111111111111','synthetic-a@example.test'),
 ('22222222-2222-2222-2222-222222222222','synthetic-b@example.test'),
 ('33333333-3333-3333-3333-333333333333','synthetic-view@example.test');
INSERT INTO public.organizations(id,name) VALUES
 ('aaaaaaaa-1111-1111-1111-111111111111','Synthetic A'),
 ('bbbbbbbb-2222-2222-2222-222222222222','Synthetic B');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111','admin',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','bbbbbbbb-2222-2222-2222-222222222222','admin',true),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','33333333-3333-3333-3333-333333333333','aaaaaaaa-1111-1111-1111-111111111111','viewer',true);
INSERT INTO public.wos_production_orders (
 id,organization_id,customer_name_snapshot,order_number,product_name,
 sales_owner_profile_id,project_owner_profile_id,priority,version_label,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id)
VALUES('cccccccc-cccc-cccc-cccc-cccccccccccc',
 'aaaaaaaa-1111-1111-1111-111111111111',
 'SYNTHETIC CUSTOMER','WOS-P8-CI-ONLY','Synthetic Sample',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'LOW','V1',10,10,'SYNTHETIC', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('wos-private','wos-private',false,20971520,ARRAY['image/png']);
INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata,version,updated_at)
VALUES('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','wos-private',
 'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/cccccccc-cccc-cccc-cccc-cccccccccccc/images/product/versions/V1/dddddddd-dddd-dddd-dddd-dddddddddddd/proof.png',
 '11111111-1111-1111-1111-111111111111',
 '{"mimetype":"image/png","size":"100"}'::jsonb,'version-1',now());

-- Only service_role can attest byte proof; ordinary users must not mint or update.
DO $privs$ BEGIN
 IF has_function_privilege('authenticated',
 'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamp with time zone,text)','EXECUTE')
 OR has_table_privilege('authenticated','public.wos_verified_image_proofs','INSERT')
 OR has_table_privilege('anon','public.wos_verified_image_proofs','SELECT')
 THEN RAISE EXCEPTION 'PROOF_PRIVILEGE_BYPASS'; END IF;
END $privs$;

-- Synthetic attestation stands in for trusted Edge bytes and MUST NOT count as
-- real file-byte verification.
SET request.jwt.claim.role = 'service_role';
SELECT public.wos_p7_record_trusted_image_proof(
 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 '11111111-1111-1111-1111-111111111111',
 'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/cccccccc-cccc-cccc-cccc-cccccccccccc/images/product/versions/V1/dddddddd-dddd-dddd-dddd-dddddddddddd/proof.png',
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','version-1',
 (SELECT updated_at FROM storage.objects WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
 repeat('a',64));
DO $proof$ BEGIN
 IF (SELECT count(*) FROM public.wos_verified_image_proofs)<>1
 THEN RAISE EXCEPTION 'PROOF_WAS_NOT_RECORDED'; END IF;
END $proof$;

SET request.jwt.claim.role='authenticated';
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT public.wos_register_uploaded_reference_image(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'PRODUCT',
 'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/cccccccc-cccc-cccc-cccc-cccccccccccc/images/product/versions/V1/dddddddd-dddd-dddd-dddd-dddddddddddd/proof.png');
SELECT public.wos_confirm_office_completeness(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',1,'V1',
 'Synthetic office completeness confirmed');
SELECT public.wos_submit_production_order(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',1,'V1',
 '77777777-7777-7777-7777-777777777777');
DO $replay$ DECLARE result jsonb;
BEGIN
 SELECT public.wos_submit_production_order(
 'cccccccc-cccc-cccc-cccc-cccccccccccc',1,'V1',
 '77777777-7777-7777-7777-777777777777') INTO result;
 IF result->>'status'<>'REPLAYED'
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 THEN RAISE EXCEPTION 'IDEMPOTENCY_OR_INBOX_FAILED'; END IF;
END $replay$;
RESET ROLE;

-- Same-org viewer and foreign organization cannot read this submitted order.
SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
DO $viewer$ BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>0
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 THEN RAISE EXCEPTION 'SAME_ORG_VIEWER_READ_BYPASS'; END IF;
END $viewer$;
RESET ROLE;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
DO $foreign$ BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>0
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>0
 THEN RAISE EXCEPTION 'FOREIGN_ORG_READ_BYPASS'; END IF;
END $foreign$;
RESET ROLE;

-- An invalid service-side digest must be rejected even with a valid object.
SET request.jwt.claim.role='service_role';
DO $bad$ DECLARE failed boolean:=false;
BEGIN
 BEGIN
 PERFORM public.wos_p7_record_trusted_image_proof(
 'ffffffff-ffff-ffff-ffff-ffffffffffff',
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 '11111111-1111-1111-1111-111111111111',
 'invalid-storage-path',
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','version-1',
 now(),'INVALID_SHA');
 EXCEPTION WHEN others THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'FORGED_SHA_ACCEPTED'; END IF;
END $bad$;
ROLLBACK;
\echo WOS_P8_P07_CANDIDATE_SQL_TRANSACTION_AND_RLS=PASS
\echo WOS_P8_P07_REAL_EDGE_BYTE_VERIFIER=NOT_RUN
