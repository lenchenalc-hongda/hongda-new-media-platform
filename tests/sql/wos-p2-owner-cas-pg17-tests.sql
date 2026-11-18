-- EPHEMERAL PG17 only. Execute after setup.sql + candidate proposed SQL.
-- Assert real SQL function behavior with no external QA credentials or writes.
\set ON_ERROR_STOP on
DO $a$
BEGIN
  IF has_function_privilege('anon',
      'public.wos_qa_p2_owner_cas_attest(text,uuid,text,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
      'public.wos_qa_p2_owner_cas_attest(text,uuid,text,integer)','EXECUTE')
     OR has_table_privilege('authenticated','public.wos_qa_p2_execution_gate','SELECT')
     OR has_table_privilege('authenticated','public.wos_qa_p2_execution_gate','UPDATE')
     OR has_table_privilege('authenticated','public.wos_qa_p2_office_execution_gate','SELECT')
     OR has_table_privilege('authenticated','public.wos_qa_p2_office_execution_gate','UPDATE')
  THEN RAISE EXCEPTION 'QA_ATTEST_GRANTS_NOT_MINIMAL'; END IF;
END
$a$;
SELECT 'WOS_P2_QA_PG17_FUNCTION_GRANTS_MINIMAL=PASS' AS result;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
DECLARE v jsonb;
BEGIN
  v:=public.wos_qa_p2_owner_cas_attest(
   '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
   '89bb408d13e45458c608db29c47e2803d49b3170',2);
  IF v->>'status' <> 'WAITING' THEN
    RAISE EXCEPTION 'OFF_GATES_MUST_ONLY_RETURN_WAITING'; END IF;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_BOTH_OFF_WAITING=PASS' AS result;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $a$
BEGIN
  PERFORM public.wos_qa_p2_owner_cas_attest('55555555555',
   '953d2204-3e65-4b75-b10e-c6e97f1bbb56',
   '89bb408d13e45458c608db29c47e2803d49b3170',2);
  RAISE EXCEPTION 'OPERATOR_DID_NOT_GET_DENIED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_OPERATOR_NOT_PRIVILEGED=PASS' AS result;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
DO $a$
BEGIN
  PERFORM public.wos_qa_p2_owner_cas_attest('55555555555',
   '953d2204-3e65-4b75-b10e-c6e97f1bbb56',
   '89bb408d13e45458c608db29c47e2803d49b3170',2);
  RAISE EXCEPTION 'FOREIGN_ADMIN_NOT_DENIED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_CROSS_ORG_ADMIN_DENIED=PASS' AS result;

UPDATE public.wos_qa_p2_execution_gate
 SET enabled=true, enabled_until=clock_timestamp()+interval '12 minutes',
     approval_reference='OWNER_RUN_55555555555_PR241_89bb408d',
     updated_at=clock_timestamp();
UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=true,
     enabled_until=(SELECT enabled_until FROM public.wos_qa_p2_execution_gate),
     approval_reference='OWNER_RUN_55555555555_PR241_89bb408d',
     updated_at=(SELECT updated_at FROM public.wos_qa_p2_execution_gate);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
DECLARE v jsonb;
BEGIN
  v:=public.wos_qa_p2_owner_cas_attest(
   '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
   '89bb408d13e45458c608db29c47e2803d49b3170',2);
  IF v->>'status' <> 'READY' OR v->>'githubRunId'<>'55555555555'
    OR v->>'orderId'<>'953d2204-3e65-4b75-b10e-c6e97f1bbb56'
    OR v->>'reviewedSha'<>'89bb408d13e45458c608db29c47e2803d49b3170'
    OR v->>'expectedVersion'<>'2'
    OR v->>'operatorEnabled'<>'true' OR v->>'officeEnabled'<>'true'
  THEN RAISE EXCEPTION 'LIVE_DB_READY_PROOF_MISMATCH'; END IF;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_RUN_BOUND_DUAL_GATE_READY=PASS' AS result;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
BEGIN
 PERFORM public.wos_qa_p2_owner_cas_attest(
  '77777777777','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',2);
 RAISE EXCEPTION 'WRONG_RUN_ID_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
DO $a$
BEGIN
 PERFORM public.wos_qa_p2_owner_cas_attest(
  '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',3);
 RAISE EXCEPTION 'WRONG_ORDER_VERSION_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_WRONG_RUN_AND_VERSION_DENIED=PASS' AS result;

UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=false,enabled_until=NULL,
     approval_reference='NOT_AUTHORIZED',updated_at=clock_timestamp();
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
BEGIN
 PERFORM public.wos_qa_p2_owner_cas_attest(
  '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',2);
 RAISE EXCEPTION 'PARTIAL_GATE_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_PARTIAL_GATE_DENIED=PASS' AS result;

UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+interval '12 minutes',
    approval_reference='OWNER_RUN_55555555555_PR241_89bb408d',
    updated_at=clock_timestamp();
UPDATE public.wos_qa_p2_execution_gate
 SET enabled_until=clock_timestamp()-interval '1 second',
     updated_at=clock_timestamp();
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
BEGIN
 PERFORM public.wos_qa_p2_owner_cas_attest(
  '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',2);
 RAISE EXCEPTION 'EXPIRED_OPERATOR_GATE_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_EXPIRED_GATE_DENIED=PASS' AS result;

INSERT INTO wos_qa_safety.p2_gate_close_receipts VALUES ('55555555555');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
BEGIN
 PERFORM public.wos_qa_p2_owner_cas_attest(
  '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',2);
 RAISE EXCEPTION 'CLOSED_RUN_WAS_REATTESTED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_CLOSED_RUN_REPLAY_DENIED=PASS' AS result;

DO $a$
BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>1
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts)<>0
 THEN RAISE EXCEPTION 'ATTESTOR_CREATED_BUSINESS_RECORDS'; END IF;
END
$a$;
SELECT 'WOS_P2_QA_PG17_ATTESTOR_ZERO_BUSINESS_WRITES=PASS' AS result;
