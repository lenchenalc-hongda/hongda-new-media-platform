-- Ephemeral GitHub-hosted PostgreSQL 17 QA-only synthetic E2E.
-- No network, Supabase credentials, browser secrets, or production execution.
DO $$
BEGIN
  IF has_table_privilege('authenticated','public.wos_qa_p2_office_revisions','SELECT')
    OR has_table_privilege('authenticated','public.wos_qa_p2_review_receipts','INSERT')
    OR has_table_privilege('authenticated','public.wos_production_orders','UPDATE')
    OR has_function_privilege('anon',
      'public.wos_qa_p2_review_correction(uuid,integer,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'UNSAFE_DIRECT_GRANT';
  END IF;
END $$;

-- Even an authenticated request with correct identity is denied while OFF.
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_office_revision(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,
      'aaaa1111-1111-4111-8111-111111111111','SAVE_CORRECTION',
      '{"productName":"new"}'::jsonb,'default-off request must be denied');
    RAISE EXCEPTION 'OFFICE_GATE_FAILED_OPEN';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_review_correction(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',6,
      'aaaa2222-2222-4222-8222-222222222222',
      'default-off operator review denied');
    RAISE EXCEPTION 'REVIEW_GATE_FAILED_OPEN';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Synthetic-only bounded gates in an ephemeral PG17 CI service.
UPDATE public.wos_qa_p2_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+INTERVAL '10 minutes',
 approval_reference='SYNTHETIC_OFFICE_PG17_ONLY',updated_at=clock_timestamp()
 WHERE gate_name='OPERATOR_WRITES';
UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+INTERVAL '10 minutes',
 approval_reference='SYNTHETIC_OFFICE_PG17_ONLY',updated_at=clock_timestamp()
 WHERE gate_name='OFFICE_WRITES';

-- Same-org Viewer is denied Office and Operator paths.
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_office_revision(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,
      'aaaa3333-3333-4333-8333-333333333333','SAVE_CORRECTION',
      '{"productName":"forged"}'::jsonb,'viewer attempts a forbidden correction');
    RAISE EXCEPTION 'VIEWER_OFFICE_WRITE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.wos_qa_p2_review_correction(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',6,
      'aaaa4444-4444-4444-8444-444444444444',
      'viewer attempts unauthorized document approval');
    RAISE EXCEPTION 'VIEWER_REVIEW_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;

-- Cross-organization Operator denied even if the order ID is guessed.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_review_correction(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',6,
      'aaaa5555-5555-4555-8555-555555555555',
      'foreign operator cannot review target org');
    RAISE EXCEPTION 'FOREIGN_OPERATOR_REVIEW_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;

-- Operator ACCEPT -> RETURN_FOR_INFORMATION on immutable submitted P1.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_operator_action(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
   'bbbb1111-1111-4111-8111-111111111111',
   'ACCEPT',NULL,NULL,NULL,NULL,'operator accepts synthetic original QA task');
 IF r->>'workflowStatus'<>'WORKSHOP_REVIEW' OR (r->>'version')::integer<>3
 THEN RAISE EXCEPTION 'ACCEPT_NOT_APPLIED'; END IF;
 r:=public.wos_qa_p2_operator_action(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,
   'bbbb2222-2222-4222-8222-222222222222',
   'RETURN_FOR_INFORMATION',NULL,NULL,NULL,NULL,
   'missing customer acceptance information and print position');
 IF r->>'workflowStatus'<>'NEEDS_INFORMATION' OR (r->>'version')::integer<>4
 THEN RAISE EXCEPTION 'RETURN_NOT_APPLIED'; END IF;
END $$;
RESET ROLE;

-- Sales: SAVE correction; immutable before/after version snapshot.
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_office_revision(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,
  'cccc1111-1111-4111-8111-111111111111',
  'SAVE_CORRECTION',
  '{"productName":"New QA corrected cup","requestedQuantity":150,"currentBatchQuantity":100,"positionReference":"15mm left edge"}'::jsonb,
  'sales corrected exact returned customer document requirements');
 IF r->>'status'<>'UPDATED' OR r->>'versionLabel'<>'QA-R5'
   OR (r->>'version')::integer<>5 THEN RAISE EXCEPTION 'SAVE_BAD_RESPONSE'; END IF;
 r:=public.wos_qa_p2_office_revision(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,
  'cccc1111-1111-4111-8111-111111111111',
  'SAVE_CORRECTION',
  '{"productName":"New QA corrected cup","requestedQuantity":150,"currentBatchQuantity":100,"positionReference":"15mm left edge"}'::jsonb,
  'sales corrected exact returned customer document requirements');
 IF r->>'status'<>'REPLAYED' OR (r->>'version')::integer<>5
 THEN RAISE EXCEPTION 'SAVE_REPLAY_BAD'; END IF;
 BEGIN
  PERFORM public.wos_qa_p2_office_revision(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,
   'cccc2222-2222-4222-8222-222222222222',
   'SAVE_CORRECTION','{"productName":"forged stale"}'::jsonb,
   'stale Office save must reject old version');
  RAISE EXCEPTION 'STALE_SAVE_ALLOWED';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;

-- Saved correction can be RESUBMITTED without a redundant change,
-- but current exact prior saved revision and version are required.
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_office_revision(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',5,
  'cccc3333-3333-4333-8333-333333333333','RESUBMIT_CORRECTION',
  '{}'::jsonb,'re-submit the complete saved customer information for review');
 IF r->>'status'<>'RESUBMITTED' OR r->>'versionLabel'<>'QA-R6'
  OR (r->>'version')::integer<>6 THEN
  RAISE EXCEPTION 'RESUBMIT_BAD_RESPONSE'; END IF;
END $$;
RESET ROLE;

-- No Office role may remove the blocker via a direct UPDATE.
DO $$
BEGIN
 IF has_table_privilege('authenticated','public.wos_blockers','UPDATE')
  OR has_table_privilege('authenticated','public.wos_qa_p2_office_revisions','UPDATE')
 THEN RAISE EXCEPTION 'OFFICE_CIRCUMVENTED_REVIEW_GATE'; END IF;
 IF (SELECT count(*) FROM public.wos_blockers WHERE status='OPEN'
  AND entity_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>1
 THEN RAISE EXCEPTION 'OFFICE_CLOSED_BLOCKER_WITHOUT_REVIEW'; END IF;
 IF (SELECT count(*) FROM public.wos_qa_p2_office_revisions
  WHERE order_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>2
 THEN RAISE EXCEPTION 'OFFICE_REVISION_COUNT_INVALID'; END IF;
 IF (SELECT before_snapshot->>'versionLabel'
    FROM public.wos_qa_p2_office_revisions
   WHERE request_id='cccc1111-1111-4111-8111-111111111111')<>'V1'
 THEN RAISE EXCEPTION 'ORIGINAL_LABEL_LOST'; END IF;
 IF (SELECT after_snapshot->>'versionLabel'
    FROM public.wos_qa_p2_office_revisions
   WHERE request_id='cccc3333-3333-4333-8333-333333333333')<>'QA-R6'
 THEN RAISE EXCEPTION 'LATEST_LABEL_UNVERIFIED'; END IF;
END $$;

-- REVIEW_CORRECTION requires the actual resubmission. Only Operator can
-- resolve the documents blocker in an atomic transaction; not a START.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_review_correction(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',6,
  'dddd1111-1111-4111-8111-111111111111',
  'operator verified corrected QA position and customer requirements');
 IF r->>'status'<>'REVIEWED' OR (r->>'version')::integer<>7
   OR r->>'workflowStatus'<>'WAITING_MATERIAL'
   OR (r->>'resolvedBlockers')::integer<>1
 THEN RAISE EXCEPTION 'REVIEW_BAD_RESPONSE'; END IF;
 r:=public.wos_qa_p2_review_correction(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',6,
  'dddd1111-1111-4111-8111-111111111111',
  'operator verified corrected QA position and customer requirements');
 IF r->>'status'<>'REPLAYED' OR (r->>'resolvedBlockers')::integer<>1
 THEN RAISE EXCEPTION 'REVIEW_NOT_IDEMPOTENT'; END IF;
 BEGIN
  PERFORM public.wos_qa_p2_review_correction(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',6,
   'dddd2222-2222-4222-8222-222222222222',
   'stale operator version must fail transaction');
  RAISE EXCEPTION 'STALE_REVIEW_ALLOWED';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;

-- Final immutable P1 and versioned security evidence.
DO $$
BEGIN
 IF (SELECT workflow_status FROM public.wos_production_orders
  WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'WAITING_MATERIAL'
 OR (SELECT version FROM public.wos_production_orders
  WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>7
 THEN RAISE EXCEPTION 'FINAL_ORDER_UNVERIFIED'; END IF;
 IF (SELECT source_version_label FROM public.wos_workshop_inbox
  WHERE order_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'V1'
 THEN RAISE EXCEPTION 'ORIGINAL_INBOX_MUTATED'; END IF;
 IF (SELECT status FROM public.wos_blockers
  WHERE entity_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'RESOLVED'
 THEN RAISE EXCEPTION 'REVIEW_DID_NOT_RESOLVE_BLOCKER'; END IF;
 IF (SELECT count(*) FROM public.wos_qa_p2_review_receipts)<>1
  OR (SELECT count(*) FROM public.wos_status_history
   WHERE reason_code='QA_P2_REVIEW_CORRECTION')<>1
 THEN RAISE EXCEPTION 'REVIEW_NOT_ATOMIC'; END IF;
 IF (SELECT version_label FROM public.wos_production_orders
  WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')='V1'
 THEN RAISE EXCEPTION 'OLD_IMAGE_VERSION_NOT_INVALIDATED'; END IF;
 IF (SELECT count(*) FROM public.wos_reference_images img
    JOIN public.wos_production_orders o ON o.id=img.entity_id
    WHERE o.id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      AND img.version_label=o.version_label AND img.image_status='READY')<>0
 THEN RAISE EXCEPTION 'OLD_IMAGE_REUSED_FOR_CORRECTION'; END IF;
END $$;
UPDATE public.wos_qa_p2_execution_gate SET enabled=false,enabled_until=NULL,
  approval_reference='NOT_AUTHORIZED' WHERE gate_name='OPERATOR_WRITES';
UPDATE public.wos_qa_p2_office_execution_gate SET enabled=false,enabled_until=NULL,
  approval_reference='NOT_AUTHORIZED' WHERE gate_name='OFFICE_WRITES';
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled=true)
  OR EXISTS (SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled=true)
 THEN RAISE EXCEPTION 'SYNTHETIC_GATE_LEFT_ON'; END IF;
END $$;
SELECT 'WOS_P2_PG17_OFFICE_OPERATOR_REVISION_CHAIN=PASS' AS evidence;
SELECT 'WOS_P2_PG17_REPLAY_CAS_RLS_FOREIGN_VIEWER_AND_DEFAULT_OFF=PASS' AS evidence;
SELECT 'WOS_P2_PG17_ORIGINAL_INBOX_PRESERVED_AND_OLD_IMAGE_INVALIDATED=PASS' AS evidence;
