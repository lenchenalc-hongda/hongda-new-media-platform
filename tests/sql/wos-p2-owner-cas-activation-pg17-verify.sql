-- Only on EPHEMERAL PostgreSQL 17 database qa_attest_owner_fixture.
\set ON_ERROR_STOP on
DO $a$
DECLARE v_op record; v_off record; v_receipt record;
BEGIN
 SELECT * INTO v_op FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES';
 SELECT * INTO v_off FROM public.wos_qa_p2_office_execution_gate WHERE gate_name='OFFICE_WRITES';
 SELECT * INTO v_receipt FROM wos_qa_safety.p2_gate_open_receipts
 WHERE github_run_id='55555555556';
 IF v_op.enabled IS DISTINCT FROM true
 OR v_off.enabled IS DISTINCT FROM true
 OR v_receipt.github_run_id IS DISTINCT FROM '55555555556'
 OR v_op.enabled_until IS DISTINCT FROM v_receipt.expires_at
 OR v_off.enabled_until IS DISTINCT FROM v_receipt.expires_at
 OR v_op.updated_at IS DISTINCT FROM v_receipt.opened_at
 OR v_off.updated_at IS DISTINCT FROM v_receipt.opened_at
 OR v_op.approval_reference IS DISTINCT FROM v_receipt.approval_reference
 OR v_off.approval_reference IS DISTINCT FROM v_receipt.approval_reference
 OR v_receipt.order_id IS DISTINCT FROM
   '953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
 OR v_receipt.reviewed_sha IS DISTINCT FROM
   '89bb408d13e45458c608db29c47e2803d49b3170'
 OR (SELECT count(*) FROM wos_qa_safety.p2_gate_open_receipts)<>1
 THEN RAISE EXCEPTION 'OWNER_CAS_TEMPLATE_NOT_ATOMIC'; END IF;
END
$a$;
SELECT 'WOS_P2_QA_PG17_ACTUAL_OWNER_CAS_TEMPLATE_ATOMIC_COMMIT=PASS' AS result;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $a$
DECLARE v jsonb;
BEGIN
 v:=public.wos_qa_p2_owner_cas_attest(
  '55555555556','953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  '89bb408d13e45458c608db29c47e2803d49b3170',2);
 IF v->>'status'<>'READY'
   OR v->>'githubRunId'<>'55555555556'
 THEN RAISE EXCEPTION 'CAS_TEMPLATE_LIVE_RPC_NOT_READY'; END IF;
END
$a$;
COMMIT;
SELECT 'WOS_P2_QA_PG17_ACTUAL_OWNER_CAS_READ_ONLY_PROOF=PASS' AS result;
