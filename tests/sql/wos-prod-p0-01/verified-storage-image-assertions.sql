-- Disposable real-proof ledger integration tests. No actual object bytes and no
-- claimed Supabase Storage E2E; Edge byte validation has a separate real PNG test.
\set ON_ERROR_STOP on
-- Source fixture has a valid CPC project/customer owned by Synthetic Sales A.
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000001';
SET wos.p0_01_ephemeral_rehearsal='on';
SET ROLE authenticated;
DO $draft$
DECLARE v jsonb;
BEGIN
 v:=public.wos_mvp_create_cpc_draft_candidate(
  '58888888-0000-4000-8000-0000000000aa',
  '31111111-0000-4000-8000-000000000001',
  '41111111-0000-4000-8000-000000000001',
  'Binary-attested private image order','PP',400,'MEDIUM');
 IF v->>'result'<>'CREATED' OR (v->>'version')::int<>1
 THEN RAISE EXCEPTION 'REAL_IMAGE_TEST_DRAFT_NOT_CREATED'; END IF;
END $draft$;
RESET ROLE;

-- A private Storage upload as the real actor JWT. The fixture fakes ONLY the
-- metadata row; actual binary upload must be tested in a newly authorized QA Run.
SET ROLE authenticated;
INSERT INTO storage.objects
 (id,bucket_id,name,owner_id,version,metadata,updated_at)
VALUES(
 '98888888-0000-4000-8000-0000000000aa','wos-private',
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png',
 '21111111-0000-4000-8000-000000000001','object-version-one',
 '{"mimetype":"image/png","size":"68"}'::jsonb,'2026-11-18T12:00:00Z');
RESET ROLE;
DO $bad_grants$
BEGIN
 IF has_table_privilege('authenticated','storage.objects','UPDATE')
 OR has_table_privilege('authenticated','storage.objects','DELETE')
 OR has_table_privilege('anon','storage.objects','SELECT')
 OR has_table_privilege('authenticated','wos_mvp_attestation.private_image_proofs','INSERT')
 OR has_function_privilege('authenticated',
  'public.wos_mvp_commit_image_proof_candidate(uuid,uuid,uuid,integer,text,text,uuid,text,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'OVERPERMISSIVE_PROOF_OR_STORAGE_GRANTS'; END IF;
END $bad_grants$;
SET ROLE authenticated;
DO $negative$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_register_image_candidate(
   '58888888-0000-4000-8000-0000000000aa',
   '88888888-0000-4000-8000-0000000000aa',1,
   'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png');
  RAISE EXCEPTION 'READY_IMAGE_MINT_WITHOUT_PROOF';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name,owner_id,version,metadata)
  VALUES ('98888888-0000-4000-8000-0000000000ab','wos-private',
   'organizations/bbbbbbbb-0000-4000-8000-000000000002/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000ab/evil.png',
   '21111111-0000-4000-8000-000000000001','v1',
   '{"mimetype":"image/png","size":"68"}'::jsonb);
  RAISE EXCEPTION 'FOREIGN_ORG_STORAGE_INSERT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $negative$;
RESET ROLE;

SET ROLE service_role;
DO $proof$
DECLARE v jsonb; meta jsonb;
BEGIN
 meta:=public.wos_mvp_storage_snapshot_candidate(
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png');
 IF meta->>'ownerId'<>'21111111-0000-4000-8000-000000000001'
 OR meta->>'mimeType'<>'image/png'
 OR (meta->>'byteSize')::integer<>68
 THEN RAISE EXCEPTION 'PRIVATE_STORAGE_SNAPSHOT_WRONG'; END IF;
 BEGIN
  PERFORM public.wos_mvp_commit_image_proof_candidate(
   '58888888-0000-4000-8000-0000000000aa',
   '88888888-0000-4000-8000-0000000000aa',
   '21111111-0000-4000-8000-000000000001',1,
   'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png',
   repeat('a',64),'98888888-0000-4000-8000-0000000000aa','WRONG_VERSION',
   '2026-11-18T12:00:00Z');
  RAISE EXCEPTION 'STALE_STORAGE_OBJECT_COMMITTED';
 EXCEPTION WHEN sqlstate 'PT409' THEN NULL;
 END;
 v:=public.wos_mvp_commit_image_proof_candidate(
   '58888888-0000-4000-8000-0000000000aa',
   '88888888-0000-4000-8000-0000000000aa',
   '21111111-0000-4000-8000-000000000001',1,
   'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png',
   repeat('a',64),'98888888-0000-4000-8000-0000000000aa','object-version-one',
   '2026-11-18T12:00:00Z');
 IF v->>'result'<>'PROOF_COMMITTED' OR (v->>'expectedVersion')::integer<>1
 THEN RAISE EXCEPTION 'BOUND_PROOF_COMMIT_FAILED';END IF;
END $proof$;
RESET ROLE;
DO $proof_count$
BEGIN
 IF (SELECT count(*) FROM wos_mvp_attestation.private_image_proofs
  WHERE image_id='88888888-0000-4000-8000-0000000000aa'
   AND order_version=1 AND storage_object_id='98888888-0000-4000-8000-0000000000aa'
   AND storage_object_version='object-version-one'
   AND actor_user_id='21111111-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'TRUSTED_LEDGER_BINDING_MISSING'; END IF;
END $proof_count$;
SET ROLE authenticated;
DO $registered$
DECLARE v jsonb; replay jsonb;
BEGIN
 v:=public.wos_mvp_register_image_candidate(
 '58888888-0000-4000-8000-0000000000aa',
 '88888888-0000-4000-8000-0000000000aa',1,
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png');
 IF v->>'result'<>'REGISTERED' THEN RAISE EXCEPTION 'REAL_IMAGE_REGISTER_FAILED';END IF;
 replay:=public.wos_mvp_register_image_candidate(
 '58888888-0000-4000-8000-0000000000aa',
 '88888888-0000-4000-8000-0000000000aa',1,
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000aa/images/product/versions/V1/88888888-0000-4000-8000-0000000000aa/sku.png');
 IF replay->>'result'<>'REPLAYED' THEN RAISE EXCEPTION 'REGISTER_REPLAY_FAILED';END IF;
END $registered$;
RESET ROLE;
-- Simulate object replacement (e.g., Storage overwrite) AFTER attestation,
-- without a new byte proof. Submit must fail despite READY reference image.
UPDATE storage.objects SET version='object-version-two'
WHERE id='98888888-0000-4000-8000-0000000000aa';
SET ROLE authenticated;
DO $stale$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_submit_first_order_verified_candidate(
   '58888888-0000-4000-8000-0000000000aa',1,
   '78888888-0000-4000-8000-0000000000aa','Office verified private byte proof');
  RAISE EXCEPTION 'STALE_IMAGE_BYPASSED_SUBMIT';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $stale$;
RESET ROLE;
UPDATE storage.objects SET version='object-version-one'
WHERE id='98888888-0000-4000-8000-0000000000aa';
SET ROLE authenticated;
DO $submit$
DECLARE v jsonb; r jsonb;
BEGIN
 v:=public.wos_mvp_submit_first_order_verified_candidate(
   '58888888-0000-4000-8000-0000000000aa',1,
   '78888888-0000-4000-8000-0000000000aa','Office verified private byte proof');
 IF v->>'result'<>'CREATED' OR (v->>'version')::integer<>2
 THEN RAISE EXCEPTION 'VERIFIED_SUBMIT_FAILED';END IF;
 r:=public.wos_mvp_submit_first_order_verified_candidate(
   '58888888-0000-4000-8000-0000000000aa',1,
   '78888888-0000-4000-8000-0000000000aa','Office verified private byte proof');
 IF r->>'result'<>'REPLAYED' THEN RAISE EXCEPTION 'VERIFIED_SUBMIT_REPLAY_FAILED';END IF;
END $submit$;
RESET ROLE;
DO $counts$
BEGIN
 IF (SELECT count(*) FROM public.wos_submission_receipts
 WHERE order_id='58888888-0000-4000-8000-0000000000aa')<>1 OR
 (SELECT count(*) FROM public.wos_workshop_inbox
 WHERE order_id='58888888-0000-4000-8000-0000000000aa')<>1 OR
 (SELECT count(*) FROM public.wos_status_history
 WHERE entity_id='58888888-0000-4000-8000-0000000000aa'
 AND next_status='SUBMITTED')<>1 OR
 (SELECT count(*) FROM public.wos_production_orders
 WHERE id='58888888-0000-4000-8000-0000000000aa'
 AND workflow_status='SUBMITTED' AND version=2)<>1
 THEN RAISE EXCEPTION 'VERIFIED_SUBMIT_ATOMICITY_OR_IDEMPOTENCE_FAIL'; END IF;
END $counts$;
SELECT 'WOS_P0_02_02_BOUND_PROOF_STORAGE_IDENTITY_AND_VERIFIED_SUBMIT=PASS' AS result;
