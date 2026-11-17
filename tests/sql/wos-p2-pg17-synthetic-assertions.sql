-- All records are synthetic in ephemeral GitHub-hosted PG17 only.
-- The source QA/production Supabase projects are NEVER connected.
DO $$
BEGIN
  IF pg_catalog.has_table_privilege('authenticated','public.wos_production_orders','UPDATE')
      OR pg_catalog.has_table_privilege('authenticated','public.wos_status_history','INSERT')
      OR pg_catalog.has_table_privilege('authenticated','public.wos_resource_readiness','INSERT')
      OR pg_catalog.has_table_privilege('authenticated','public.wos_resource_readiness','UPDATE') THEN
    RAISE EXCEPTION 'FAIL_DIRECT_TABLE_WRITE_GRANTS';
  END IF;
  IF pg_catalog.has_function_privilege('anon',
    'public.wos_qa_p2_operator_action(uuid,integer,uuid,text,text,text,integer,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL_ANON_EXECUTE';
  END IF;
END $$;

-- viewer cannot invoke as an operator even when same-org.
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_operator_action(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
      '01010101-0101-4101-8101-010101010101',
      'ACCEPT',NULL,NULL,NULL,NULL,'viewer attempts unauthorized acceptance');
    RAISE EXCEPTION 'FAIL_VIEWER_WAS_AUTHORIZED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Cross-organization operator is denied.
SELECT pg_catalog.set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_operator_action(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
      '02020202-0202-4202-8202-020202020202',
      'ACCEPT',NULL,NULL,NULL,NULL,'foreign user requests forbidden order');
    RAISE EXCEPTION 'FAIL_FOREIGN_ORG_WAS_AUTHORIZED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

-- Operator: ACCEPT, replay same request, tamper and stale version rejection.
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.wos_qa_p2_operator_action(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
   '03030303-0303-4303-8303-030303030303',
   'ACCEPT',NULL,NULL,NULL,NULL,'operator accepted original QA production order');
 IF v_result->>'status'<>'APPLIED'
    OR v_result->>'workflowStatus'<>'WORKSHOP_REVIEW'
    OR v_result->>'version'<>'3' THEN
   RAISE EXCEPTION 'FAIL_ACCEPT_RESPONSE: %',v_result;
 END IF;
 v_result:=public.wos_qa_p2_operator_action(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
   '03030303-0303-4303-8303-030303030303',
   'ACCEPT',NULL,NULL,NULL,NULL,'operator accepted original QA production order');
 IF v_result->>'status'<>'REPLAYED' OR v_result->>'version'<>'3' THEN
   RAISE EXCEPTION 'FAIL_IDEMPOTENT_REPLAY: %',v_result;
 END IF;

 BEGIN
   PERFORM public.wos_qa_p2_operator_action(
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
     '03030303-0303-4303-8303-030303030303',
     'ACCEPT',NULL,NULL,NULL,NULL,'tampered note must not reuse original uuid');
   RAISE EXCEPTION 'FAIL_REPLAY_PAYLOAD_TAMPER_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
 END;

 BEGIN
   PERFORM public.wos_qa_p2_operator_action(
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,
     '04040404-0404-4404-8404-040404040404',
     'ACCEPT',NULL,NULL,NULL,NULL,'stale distinct request cannot pass version');
   RAISE EXCEPTION 'FAIL_STALE_VERSION_ACCEPTED';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 BEGIN
   PERFORM public.wos_qa_p2_operator_action(
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,
     '05050505-0505-4505-8505-050505050505',
     'START',NULL,NULL,NULL,NULL,'attempt to bypass missing sample readiness');
   RAISE EXCEPTION 'FAIL_START_BYPASS';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;

 v_result:=public.wos_qa_p2_operator_action(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,
   '06060606-0606-4606-8606-060606060606',
   'RETURN_FOR_INFORMATION',NULL,NULL,NULL,NULL,
   'missing signed sample and film specification, send back to office');
 IF v_result->>'status'<>'APPLIED'
    OR v_result->>'workflowStatus'<>'NEEDS_INFORMATION'
    OR v_result->>'version'<>'4' THEN
   RAISE EXCEPTION 'FAIL_RETURN_FOR_INFORMATION: %',v_result;
 END IF;
END $$;
RESET ROLE;

-- Manager may accept as a supervisor and record material status.
SELECT pg_catalog.set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SET ROLE authenticated;
DO $$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.wos_qa_p2_operator_action(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,
   '07070707-0707-4707-8707-070707070707',
   'ACCEPT',NULL,NULL,NULL,NULL,'manager approved the original QA task receipt');
 IF v_result->>'status'<>'APPLIED' OR v_result->>'version'<>'3' THEN
  RAISE EXCEPTION 'FAIL_MANAGER_ACCEPT'; END IF;

 -- Signed sample cannot be verified if no READY image exists.
 BEGIN
   PERFORM public.wos_qa_p2_operator_action(
     'dddddddd-dddd-4ddd-8ddd-dddddddddddd',3,
     '08080808-0808-4808-8808-080808080808',
     'CONFIRM_MATERIAL','SIGNED_SAMPLE','VERIFIED',NULL,NULL,
     'signed sample claimed without any private signed image');
   RAISE EXCEPTION 'FAIL_FAKE_SIGNED_SAMPLE';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 -- Film can be physically arrived, but cannot be version-verified without image.
 BEGIN
   PERFORM public.wos_qa_p2_operator_action(
     'dddddddd-dddd-4ddd-8ddd-dddddddddddd',3,
     '09090909-0909-4909-8909-090909090909',
     'CONFIRM_MATERIAL','FILM','VERSION_VERIFIED',NULL,NULL,
     'film version proof missing current private pattern image');
   RAISE EXCEPTION 'FAIL_UNVERIFIED_FILM';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 v_result:=public.wos_qa_p2_operator_action(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',3,
   '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a',
   'CONFIRM_MATERIAL','FILM','ARRIVED',NULL,NULL,
   'film has arrived but current version has not been verified');
 IF v_result->>'workflowStatus'<>'WAITING_MATERIAL' OR v_result->>'version'<>'4' THEN
   RAISE EXCEPTION 'FAIL_FILM_ARRIVAL_BLOCKED'; END IF;

 -- Even after another transition, original acceptance replay is traceable.
 v_result:=public.wos_qa_p2_operator_action(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,
   '07070707-0707-4707-8707-070707070707',
   'ACCEPT',NULL,NULL,NULL,NULL,'manager approved the original QA task receipt');
 IF v_result->>'status'<>'REPLAYED' OR v_result->>'version'<>'3' THEN
   RAISE EXCEPTION 'FAIL_HISTORICAL_REPLAY'; END IF;
END $$;
RESET ROLE;

-- Independent post-transaction database assertions as synthetic DB owner.
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.wos_status_history
  WHERE entity_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF n<>2 THEN RAISE EXCEPTION 'FAIL_ORDER1_HISTORY_EXPECTED_2_GOT_%',n; END IF;
 SELECT count(*) INTO n FROM public.wos_confirmations
  WHERE entity_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 IF n<>0 THEN RAISE EXCEPTION 'FAIL_OPERATOR_FALSE_SUPERVISOR_APPROVAL'; END IF;
 SELECT count(*) INTO n FROM public.wos_blockers
  WHERE entity_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND status='OPEN';
 IF n<>1 THEN RAISE EXCEPTION 'FAIL_RETURN_BLOCKER_NOT_ATOMIC'; END IF;
 SELECT count(*) INTO n FROM public.wos_confirmations
  WHERE entity_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    AND confirmation_type='WORKSHOP_SUPERVISOR'
    AND decision='CONFIRMED';
 IF n<>1 THEN RAISE EXCEPTION 'FAIL_MANAGER_SUPERVISOR_CONFIRMATION'; END IF;
 SELECT count(*) INTO n FROM public.wos_resource_readiness
  WHERE entity_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    AND resource_type='FILM' AND status='ARRIVED';
 IF n<>1 THEN RAISE EXCEPTION 'FAIL_ATOMIC_FILM_ARRIVAL'; END IF;
 SELECT count(*) INTO n FROM public.wos_qa_p2_action_receipts;
 IF n<>4 THEN RAISE EXCEPTION 'FAIL_LEDGER_DUPLICATE_OR_MISSING_EXPECTED4_GOT_%',n; END IF;
 SELECT count(*) INTO n FROM public.wos_workshop_inbox
  WHERE workflow_status<>'SUBMITTED';
 IF n<>0 THEN RAISE EXCEPTION 'FAIL_MUTATED_ORIGINAL_INBOX_RECEIPT'; END IF;
 SELECT count(*) INTO n FROM public.wos_production_orders
  WHERE workflow_status IN ('IN_PRODUCTION','READY_TO_START');
 IF n<>0 THEN RAISE EXCEPTION 'FAIL_UNAUTHORIZED_PRODUCTION_START'; END IF;
 SELECT count(*) INTO n FROM public.wos_production_orders
  WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff'
    AND version=2 AND workflow_status='SUBMITTED';
 IF n<>1 THEN RAISE EXCEPTION 'FAIL_CROSS_TENANT_ORDER_MODIFIED'; END IF;
END $$;
\echo WOS_P2_PG17_SYNTHETIC_TRANSACTION_AUDIT=PASS
\echo WOS_P2_PG17_ZERO_QA_DB_CONNECTIONS=PASS
