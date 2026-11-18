-- P0-02-02 real Office field persistence + versioned private image integration.
\set ON_ERROR_STOP on
SET wos.p0_01_ephemeral_rehearsal='on';
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $draft$
DECLARE d jsonb;
BEGIN
 d:=public.wos_mvp_create_cpc_draft_candidate(
 '58888888-0000-4000-8000-0000000000bb',
 '31111111-0000-4000-8000-000000000001',
 '41111111-0000-4000-8000-000000000001',
 'Full document bottle','PP',360,'MEDIUM');
 IF d->>'result'<>'CREATED' THEN RAISE EXCEPTION 'FULL_DOC_DRAFT_MISSING';END IF;
 BEGIN
  PERFORM public.wos_mvp_submit_first_order_full_candidate(
  '58888888-0000-4000-8000-0000000000bb',1,
  '78888888-0000-4000-8000-0000000000bb','Complete Office document confirmation');
  RAISE EXCEPTION 'FULL_SUBMIT_WITHOUT_OFFICE_DOC_WAS_ALLOWED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $draft$;
RESET ROLE;
SET ROLE authenticated;
DO $form$
DECLARE
 v jsonb;r jsonb;
 document jsonb;
BEGIN
 document:=pg_catalog.jsonb_build_object(
 'customerName','Synthetic Test Customer',
 'projectName','Synthetic Test Project',
 'orderNumber','WOS-CANDIDATE-588888880000400080000000000000bb',
 'productName','Full document bottle','productMaterial','PP',
 'priority','MEDIUM','requestedQuantity',360,'currentBatchQuantity',360,
 'plannedShipDate','2026-12-31','splitDelivery',false,'followUpBatchPlan',null,
 'isUrgent',false,'versionLabel','V1',
 'surfaceTreatment','无','patternScope','FULL',
 'seamTolerance','1mm','positionReference','Top 12mm',
 'customerAcceptanceStandard','No ghosting; approved sample',
 'packagingMethod','48/carton','cartonQuantity',48,
 'labelMarkingRule','Mark current V1 version');
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
   '58888888-0000-4000-8000-0000000000bb',1,
   '68888888-0000-4000-8000-0000000000bc',
   document-'customerAcceptanceStandard');
  RAISE EXCEPTION 'INCOMPLETE_OFFICE_FORM_WAS_SAVED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 -- Direct RPC negative cases before successful CAS save.
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
   '58888888-0000-4000-8000-0000000000bb',1,
   '68888888-0000-4000-8000-0000000000c1',document-'patternScope');
  RAISE EXCEPTION 'MISSING_PATTERN_SCOPE_WAS_SAVED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
   '58888888-0000-4000-8000-0000000000bb',1,
   '68888888-0000-4000-8000-0000000000c2',document-'plannedShipDate');
  RAISE EXCEPTION 'MISSING_SHIP_DATE_WAS_SAVED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
   '58888888-0000-4000-8000-0000000000bb',1,
   '68888888-0000-4000-8000-0000000000c3',document-'cartonQuantity');
  RAISE EXCEPTION 'MISSING_CARTON_QUANTITY_WAS_SAVED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
   '58888888-0000-4000-8000-0000000000bb',1,
   '68888888-0000-4000-8000-0000000000c4',document-'splitDelivery');
  RAISE EXCEPTION 'MISSING_SPLIT_DELIVERY_WAS_SAVED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
   '58888888-0000-4000-8000-0000000000bb',1,
   '68888888-0000-4000-8000-0000000000c5',
   document||'{"organizationId":"bbbbbbbb-0000-4000-8000-000000000002"}'::jsonb);
  RAISE EXCEPTION 'FORGED_ORG_EXTRA_FIELD_WAS_SAVED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 v:=public.wos_mvp_save_complete_office_candidate(
  '58888888-0000-4000-8000-0000000000bb',1,
  '68888888-0000-4000-8000-0000000000bb',document);
 IF v->>'result'<>'SAVED' OR (v->>'version')::int<>2
 THEN RAISE EXCEPTION 'FULL_OFFICE_FORM_SAVE_FAILED';END IF;
 r:=public.wos_mvp_save_complete_office_candidate(
  '58888888-0000-4000-8000-0000000000bb',1,
  '68888888-0000-4000-8000-0000000000bb',document);
 IF r->>'result'<>'REPLAYED' THEN RAISE EXCEPTION 'OFFICE_FORM_REPLAY_DENIED';END IF;
 BEGIN
  PERFORM public.wos_mvp_save_complete_office_candidate(
  '58888888-0000-4000-8000-0000000000bb',1,
  '68888888-0000-4000-8000-0000000000bd',document);
  RAISE EXCEPTION 'STALE_OFFICE_VERSION_OVERWRITE_ALLOWED';
 EXCEPTION WHEN sqlstate 'PT409' THEN NULL;
 END;
END $form$;
RESET ROLE;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders
 WHERE id='58888888-0000-4000-8000-0000000000bb'
 AND version=2 AND workflow_status='DRAFT'
 AND current_batch_quantity=360 AND customer_acceptance_standard='No ghosting; approved sample'
 AND follow_up_batch_plan IS NULL AND carton_quantity=48)<>1
 THEN RAISE EXCEPTION 'COMPLETE_BUSINESS_FIELDS_NOT_PERSISTED';END IF;
END $check$;
SET ROLE authenticated;
INSERT INTO storage.objects
 (id,bucket_id,name,owner_id,version,metadata,updated_at)
VALUES(
 '98888888-0000-4000-8000-0000000000bb','wos-private',
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000bb/images/product/versions/V1/88888888-0000-4000-8000-0000000000bb/final.png',
 '21111111-0000-4000-8000-000000000001','stable-binary-v1',
 '{"mimetype":"image/png","size":"68"}'::jsonb,'2026-11-18T12:00:00Z');
RESET ROLE;
SET ROLE service_role;
SELECT public.wos_mvp_commit_image_proof_candidate(
 '58888888-0000-4000-8000-0000000000bb',
 '88888888-0000-4000-8000-0000000000bb',
 '21111111-0000-4000-8000-000000000001',2,
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000bb/images/product/versions/V1/88888888-0000-4000-8000-0000000000bb/final.png',
 repeat('c',64),'98888888-0000-4000-8000-0000000000bb','stable-binary-v1',
 '2026-11-18T12:00:00Z');
RESET ROLE;
SET ROLE authenticated;
DO $submit$
DECLARE v jsonb;
BEGIN
 v:=public.wos_mvp_register_image_candidate(
 '58888888-0000-4000-8000-0000000000bb',
 '88888888-0000-4000-8000-0000000000bb',2,
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/58888888-0000-4000-8000-0000000000bb/images/product/versions/V1/88888888-0000-4000-8000-0000000000bb/final.png');
 IF v->>'result'<>'REGISTERED' THEN RAISE EXCEPTION 'V2_IMAGE_REGISTRATION_FAILED';END IF;
 v:=public.wos_mvp_submit_first_order_full_candidate(
 '58888888-0000-4000-8000-0000000000bb',2,
 '78888888-0000-4000-8000-0000000000bb','Complete Office document confirmation');
 IF v->>'result'<>'CREATED' OR (v->>'version')::integer<>3
 THEN RAISE EXCEPTION 'FULL_OFFICE_FIRST_SUBMIT_FAILED'; END IF;
END $submit$;
RESET ROLE;
DO $final$
BEGIN
 IF (SELECT count(*) FROM public.wos_submission_receipts
  WHERE order_id='58888888-0000-4000-8000-0000000000bb')<>1
 OR (SELECT count(*) FROM public.wos_workshop_inbox
  WHERE order_id='58888888-0000-4000-8000-0000000000bb')<>1
 OR (SELECT count(*) FROM public.wos_status_history
  WHERE entity_id='58888888-0000-4000-8000-0000000000bb' AND next_status='SUBMITTED')<>1
 OR (SELECT count(*) FROM public.wos_production_orders
  WHERE id='58888888-0000-4000-8000-0000000000bb' AND version=3 AND workflow_status='SUBMITTED')<>1
 THEN RAISE EXCEPTION 'FULL_OFFICE_SUBMISSION_MISSING_EVIDENCE';END IF;
END $final$;
SELECT 'WOS_P0_02_02_FULL_OFFICE_DOCUMENT_V2_PRIVATE_IMAGE_AND_V3_SUBMIT=PASS' AS result;
