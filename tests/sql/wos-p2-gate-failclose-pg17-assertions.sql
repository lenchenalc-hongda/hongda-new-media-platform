-- PG17 temporary database, NEVER Supabase QA or Production.
-- Assert that unprivileged roles can't call the close-only endpoint.
DO $$
BEGIN
 IF has_function_privilege('anon','public.wos_qa_p2_failclose(text,uuid,text)','EXECUTE')
   OR has_table_privilege('authenticated','public.wos_qa_p2_execution_gate','UPDATE')
   OR has_table_privilege('authenticated','public.wos_qa_p2_office_execution_gate','UPDATE')
   OR has_table_privilege('authenticated','wos_qa_safety.p2_gate_close_receipts','SELECT')
 THEN RAISE EXCEPTION 'UNSAFE_GRANTS'; END IF;
END $$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
   PERFORM public.wos_qa_p2_failclose(
     '9000012345','aaaa1111-1111-4111-8111-111111111111','FAIL');
   RAISE EXCEPTION 'VIEWER_UNEXPECTEDLY_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
   PERFORM public.wos_qa_p2_failclose(
     '9000012345','aaaa2222-2222-4222-8222-222222222222','FAIL');
   RAISE EXCEPTION 'OPERATOR_UNEXPECTEDLY_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
   PERFORM public.wos_qa_p2_failclose(
     '9000012345','aaaa3333-3333-4333-8333-333333333333','FAIL');
   RAISE EXCEPTION 'DISABLED_ADMIN_UNEXPECTEDLY_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;

UPDATE public.wos_qa_p2_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+INTERVAL '10 minutes',
     approval_reference='SYNTHETIC_PG17_ONLY';
UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+INTERVAL '10 minutes',
     approval_reference='SYNTHETIC_PG17_ONLY';
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_failclose(
   '9000012345','aaaaaaaa-1111-4111-8111-111111111111','FAIL');
 IF r->>'status'<>'CLOSED'
   OR r->>'operatorEnabled'<>'false'
   OR r->>'officeEnabled'<>'false'
   OR r->>'operatorWasEnabled'<>'true'
   OR r->>'officeWasEnabled'<>'true'
 THEN RAISE EXCEPTION 'INITIAL_FAILURE_CLOSE_DID_NOT_CLOSE_BOTH'; END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.wos_qa_p2_execution_gate
  WHERE enabled=true OR enabled_until IS NOT NULL
    OR approval_reference<>'NOT_AUTHORIZED')
 OR EXISTS(SELECT 1 FROM public.wos_qa_p2_office_execution_gate
  WHERE enabled=true OR enabled_until IS NOT NULL
    OR approval_reference<>'NOT_AUTHORIZED')
 THEN RAISE EXCEPTION 'GATES_STILL_ENABLED'; END IF;
END $$;

-- A replay of an old close receipt MUST still close gates reopened by
-- a separately-approved later run; it must not return stale OFF evidence.
UPDATE public.wos_qa_p2_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+INTERVAL '10 minutes',
     approval_reference='SYNTHETIC_SECOND_RUN';
UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+INTERVAL '10 minutes',
     approval_reference='SYNTHETIC_SECOND_RUN';
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_failclose(
   '9000012345','aaaaaaaa-1111-4111-8111-111111111111','FAIL');
 IF r->>'status'<>'REPLAYED'
   OR r->>'operatorEnabled'<>'false' OR r->>'officeEnabled'<>'false'
 THEN RAISE EXCEPTION 'REPLAY_DID_NOT_CLOSE_NEW_GATES'; END IF;
 BEGIN
  PERFORM public.wos_qa_p2_failclose(
   '9000012345','aaaaaaaa-1111-4111-8111-111111111111','PASS');
  RAISE EXCEPTION 'CONFLICTING_REQUEST_REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM wos_qa_safety.p2_gate_close_receipts)<>1
   OR EXISTS(SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled)
   OR EXISTS(SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled)
 THEN RAISE EXCEPTION 'REPLAY_DID_NOT_REMAIN_ATOMIC'; END IF;
END $$;

-- Simulated lost Runner leaves both gates expired; independent DB watchdog
-- must close them, preserving one non-public watchdog receipt.
UPDATE public.wos_qa_p2_execution_gate SET enabled=true,
 enabled_until=clock_timestamp()-INTERVAL '30 seconds',
 approval_reference='SYNTHETIC_ABANDONED_RUN';
UPDATE public.wos_qa_p2_office_execution_gate SET enabled=true,
 enabled_until=clock_timestamp()-INTERVAL '30 seconds',
 approval_reference='SYNTHETIC_ABANDONED_RUN';
DO $$
DECLARE r jsonb;
BEGIN
 r:=wos_qa_safety.reap_expired_p2_gates();
 IF r->>'operatorClosed'<>'true' OR r->>'officeClosed'<>'true'
 THEN RAISE EXCEPTION 'LOST_RUN_WATCHDOG_DID_NOT_REAP_BOTH'; END IF;
END $$;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.wos_qa_p2_execution_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.wos_qa_p2_office_execution_gate WHERE enabled)
 OR (SELECT count(*) FROM wos_qa_safety.p2_gate_watchdog_receipts)<>1
 THEN RAISE EXCEPTION 'WATCHDOG_RECEIPT_OR_GATES_BAD'; END IF;
END $$;
-- A premature watchdog must never disable a still-valid approved lease.
UPDATE public.wos_qa_p2_execution_gate SET enabled=true,
 enabled_until=clock_timestamp()+INTERVAL '10 minutes',
 approval_reference='SYNTHETIC_VALID_LEASE';
UPDATE public.wos_qa_p2_office_execution_gate SET enabled=true,
 enabled_until=clock_timestamp()+INTERVAL '10 minutes',
 approval_reference='SYNTHETIC_VALID_LEASE';
DO $$
DECLARE r jsonb;
BEGIN
 r:=wos_qa_safety.reap_expired_p2_gates();
 IF r->>'operatorClosed'<>'false' OR r->>'officeClosed'<>'false'
 THEN RAISE EXCEPTION 'WATCHDOG_EARLY_GATE_CLOSURE'; END IF;
END $$;
UPDATE public.wos_qa_p2_execution_gate
 SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED';
UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED';
SELECT 'WOS_P2_PG17_ADMIN_ONLY_FAIL_CLOSE=PASS' AS evidence;
SELECT 'WOS_P2_PG17_NORMAL_FAILURE_CLOSE_BOTH_GATES=PASS' AS evidence;
SELECT 'WOS_P2_PG17_REPLAY_REQUIRES_REAL_CLOSE=PASS' AS evidence;
SELECT 'WOS_P2_PG17_RUNNER_LOSS_EXPIRY_WATCHDOG=PASS' AS evidence;
SELECT 'WOS_P2_PG17_NO_PREMATURE_WATCHDOG_CLOSE=PASS' AS evidence;
SELECT 'WOS_P2_PG17_ROLE_AND_DML_GRANT_NEGATIVES=PASS' AS evidence;
