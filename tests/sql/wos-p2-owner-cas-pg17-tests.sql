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
     OR has_table_privilege('authenticated','wos_qa_safety.p2_gate_open_receipts','SELECT')
     OR has_table_privilege('authenticated','wos_qa_safety.p2_gate_open_receipts','INSERT')
     OR has_table_privilege('anon','wos_qa_safety.p2_gate_open_receipts','SELECT')
  THEN RAISE EXCEPTION 'QA_ATTEST_GRANTS_NOT_MINIMAL'; END IF;
END
$a$;
SELECT 'WOS_P2_QA_PG17_FUNCTION_GRANTS_MINIMAL=PASS' AS result;

-- Verify installed, enabled trigger and check no public execution grant.
DO $scope_preflight$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid='public.wos_production_orders'::regclass
   AND t.tgname='wos_qa_p2_single_order_gate_guard'
   AND t.tgenabled IN ('O','A')
   AND t.tgfoid='wos_qa_safety.p2_single_order_write_guard()'::regprocedure)
 OR has_function_privilege('authenticated',
  'wos_qa_safety.p2_single_order_write_guard()','EXECUTE')
 THEN RAISE EXCEPTION 'QA_SINGLE_ORDER_TRIGGER_NOT_RESTRICTED'; END IF;
END $scope_preflight$;
BEGIN;
UPDATE public.wos_production_orders SET version=version+1
 WHERE id='44444444-4444-4444-8444-444444444444'::uuid;
ROLLBACK;
SELECT 'WOS_P2_QA_PG17_GATE_OFF_EXISTING_ORDER_MUTATIONS_UNCHANGED=PASS' AS result;


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

-- Deliberately simulate two ON Gates WITHOUT the durable Owner CAS
-- receipt. Even same timestamps/references are insufficient authorization.
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
BEGIN
 PERFORM public.wos_qa_p2_owner_cas_attest(
  '55555555555','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',2);
 RAISE EXCEPTION 'TWO_ON_GATES_WITHOUT_OWNER_RECEIPT_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_ON_GATES_WITHOUT_OPEN_RECEIPT_DENIED=PASS' AS result;

-- The Owner's durable private receipt is source-of-truth and must be
-- committed atomically with BOTH Gate writes in the real QA activation
-- template. Fixture simulates this expected post-commit state.
INSERT INTO wos_qa_safety.p2_gate_open_receipts
 (github_run_id,order_id,reviewed_sha,approval_reference,opened_at,expires_at)
 SELECT '55555555555',
   '953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid,
   '89bb408d13e45458c608db29c47e2803d49b3170',
   approval_reference,updated_at,enabled_until
 FROM public.wos_qa_p2_execution_gate
 WHERE gate_name='OPERATOR_WRITES';

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

-- Transactional negative tests: target update permitted, unrelated UPDATE,
-- new INSERT, any DELETE and target order-number tampering rejected.
BEGIN;
UPDATE public.wos_production_orders SET version=version+1
 WHERE id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid;
DO $scope$
BEGIN
 UPDATE public.wos_production_orders SET version=version+1
 WHERE id='44444444-4444-4444-8444-444444444444'::uuid;
 RAISE EXCEPTION 'UNRELATED_ORDER_UPDATE_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $scope$;
DO $scope$
BEGIN
 INSERT INTO public.wos_production_orders
 (id,order_number,organization_id,workflow_status,version)
 VALUES ('55555555-5555-4555-8555-555555555555'::uuid,
 'QA-NONPROD-EXTRA','0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid,'SUBMITTED',1);
 RAISE EXCEPTION 'NEW_ORDER_INSERT_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $scope$;
DO $scope$
BEGIN
 DELETE FROM public.wos_production_orders WHERE id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid;
 RAISE EXCEPTION 'TARGET_ORDER_DELETE_WAS_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $scope$;
DO $scope$
BEGIN
 UPDATE public.wos_production_orders SET order_number='QA-CHANGED'
 WHERE id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid;
 RAISE EXCEPTION 'TARGET_ORDER_NUMBER_TAMPERING_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $scope$;
ROLLBACK;
SELECT 'WOS_P2_QA_PG17_ONLY_PINNED_ORDER_UPDATE_ALLOWED=PASS' AS result;


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
 IF (SELECT count(*) FROM public.wos_production_orders)<>2
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>1
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>1
 OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts)<>0
 THEN RAISE EXCEPTION 'ATTESTOR_CREATED_BUSINESS_RECORDS'; END IF;
END
$a$;
SELECT 'WOS_P2_QA_PG17_ATTESTOR_ZERO_BUSINESS_WRITES=PASS' AS result;
