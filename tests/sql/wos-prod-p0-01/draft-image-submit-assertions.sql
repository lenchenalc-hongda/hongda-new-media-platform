-- Transactional dry-run using synthetic project/person/image proof ONLY.
\set ON_ERROR_STOP on
-- Prior generic P0-01 fixture used uppercase ACTIVE; real CPC stores lowercase active.
-- Normalize only the disposable synthetic rows to actual production CPC status casing.
UPDATE public.cpc_customer_references SET status='active' WHERE id='31111111-0000-4000-8000-000000000001';
UPDATE public.cpc_projects SET status='active' WHERE id='41111111-0000-4000-8000-000000000001';
SET wos.p0_01_ephemeral_rehearsal='on';
-- A second project owned by the same synthetic Sales user (owner is active).
SELECT set_config('request.jwt.claim.sub','21111111-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
DO $draft$
DECLARE
 d jsonb;
 replay jsonb;
BEGIN
 d:=wos_mvp_isolated.create_cpc_draft(
 '58888888-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001',
 '41111111-0000-4000-8000-000000000001',
 'Synthetic PP bottle','PP',500,'MEDIUM');
 IF d->>'result'<>'CREATED' OR (d->>'version')::int<>1
 THEN RAISE EXCEPTION 'DRAFT_CREATE_FAILED'; END IF;
 replay:=wos_mvp_isolated.create_cpc_draft(
 '58888888-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001',
 '41111111-0000-4000-8000-000000000001',
 'Synthetic PP bottle','PP',500,'MEDIUM');
 IF replay->>'result'<>'REPLAYED' THEN RAISE EXCEPTION 'DRAFT_RETRY_NOT_IDEMPOTENT'; END IF;
 BEGIN
  PERFORM wos_mvp_isolated.create_cpc_draft(
   '58888888-0000-4000-8000-000000000001',
   '31111111-0000-4000-8000-000000000001',
   '41111111-0000-4000-8000-000000000001',
   'Changed order','PP',500,'MEDIUM');
  RAISE EXCEPTION 'DRAFT_REPLAY_CHANGED_INPUT_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM wos_mvp_isolated.create_cpc_draft(
   '58888888-0000-4000-8000-000000000002',
   '32222222-0000-4000-8000-000000000001',
   '41111111-0000-4000-8000-000000000001',
   'Wrong customer','PP',500,'MEDIUM');
  RAISE EXCEPTION 'DRAFT_WRONG_CUSTOMER_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $draft$;
-- Submit must fail without any attestor proof. Neither history nor receipt may change.
DO $no_image$
BEGIN
 BEGIN
  PERFORM wos_mvp_isolated.submit_first_order(
    '58888888-0000-4000-8000-000000000001',1,
    '78888888-0000-4000-8000-000000000001','Office QA completeness accepted');
  RAISE EXCEPTION 'SUBMIT_WITHOUT_IMAGE_WAS_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $no_image$;
RESET ROLE;
-- Synthetic harness pretends that an independent binary attestor accepted a private object.
-- This is NOT actual Storage API/Edge proof; no claim of real binary integrity.
INSERT INTO public.wos_reference_images(
 id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
 file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
VALUES('88888888-0000-4000-8000-000000000001',
 'aaaaaaaa-0000-4000-8000-000000000001','PRODUCTION_ORDER',
 '58888888-0000-4000-8000-000000000001','PRODUCT','wos-private',
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-000000000001/images/product/versions/V1/88888888-0000-4000-8000-000000000001/test.png',
 'test.png','image/png',124,'V1','READY',
 '11111111-0000-4000-8000-000000000001');
INSERT INTO wos_mvp_isolated.synthetic_private_image_proofs(
 image_id,organization_id,order_id,storage_bucket,storage_path,version_label,digest_hex,expires_at)
SELECT id,organization_id,entity_id,storage_bucket,storage_path,version_label,
 repeat('a',64),clock_timestamp()+interval '10 minutes'
FROM public.wos_reference_images WHERE id='88888888-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $submit$
DECLARE result jsonb; replay jsonb;
BEGIN
 result:=wos_mvp_isolated.submit_first_order(
  '58888888-0000-4000-8000-000000000001',1,
  '78888888-0000-4000-8000-000000000001','Office QA completeness accepted');
 IF result->>'result'<>'CREATED' OR (result->>'version')::int<>2
 THEN RAISE EXCEPTION 'SUBMIT_CREATION_FAILED'; END IF;
 replay:=wos_mvp_isolated.submit_first_order(
  '58888888-0000-4000-8000-000000000001',1,
  '78888888-0000-4000-8000-000000000001','Office QA completeness accepted');
 IF replay->>'result'<>'REPLAYED' THEN RAISE EXCEPTION 'SUBMIT_REPLAY_NOT_IDEMPOTENT'; END IF;
 BEGIN
  PERFORM wos_mvp_isolated.submit_first_order(
   '58888888-0000-4000-8000-000000000001',1,
   '78888888-0000-4000-8000-000000000002','Office QA completeness accepted');
  RAISE EXCEPTION 'UNAUTHORIZED_SECOND_FIRST_SUBMISSION_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN
  -- PostgreSQL SQLSTATE PT409 is custom; explicit check handled below.
  RAISE;
 WHEN OTHERS THEN
  IF SQLSTATE<>'PT409' THEN RAISE; END IF;
 END;
END $submit$;
RESET ROLE;
DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.wos_submission_receipts WHERE order_id='58888888-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.wos_workshop_inbox WHERE order_id='58888888-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.wos_office_readiness_receipts WHERE order_id='58888888-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.wos_status_history WHERE entity_id='58888888-0000-4000-8000-000000000001' AND next_status='SUBMITTED')<>1
 OR (SELECT count(*) FROM public.wos_production_orders WHERE id='58888888-0000-4000-8000-000000000001' AND workflow_status='SUBMITTED' AND version=2)<>1
 THEN RAISE EXCEPTION 'SUBMISSION_TRANSACTION_INTEGRITY_FAILED'; END IF;
END $audit$;
SELECT 'WOS_P0_02_DRAFT_SYNTHETIC_PRIVATE_IMAGE_AND_FIRST_SUBMIT_ATOMIC=PASS' AS result;
