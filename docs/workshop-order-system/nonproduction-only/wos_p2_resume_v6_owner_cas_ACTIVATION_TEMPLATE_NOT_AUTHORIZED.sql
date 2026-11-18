-- WOS P2 QA RESUME V6 OWNER-DBA ATOMIC CAS / PROPOSAL ONLY.
-- NEVER EXECUTE until NEW exact Run/SQL/QA-project Owner authorization and v6 attestor audit & install.
-- Project ONLY xulmpqaknlwqqculbsek. NO Production. Not a migration. NOT for v2 SUBMITTED.
-- Literal placeholder intentionally fails; previous Run #44299301427 is terminal.
BEGIN;
SET LOCAL statement_timeout='8000ms';
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-p2-qa-gates-failclose',0));
DO $owner_only$
DECLARE
  v_run_id text := 'REPLACE_WITH_FRESH_SEPARATELY_OWNER_APPROVED_RESUME_V6_RUN_ID';
  v_at timestamptz := pg_catalog.transaction_timestamp();
  v_until timestamptz := pg_catalog.transaction_timestamp() + interval '15 minutes';
  v_ref text;
  v_rows integer;
BEGIN
  IF v_run_id !~ '^[0-9]{5,20}$'
    OR v_run_id='44255738492' -- previously failed; NEVER REUSE
    OR v_run_id='44242557421' -- previously failed; NEVER REUSE
    OR v_run_id='44232596314' -- previously failed; NEVER REUSE
    OR v_run_id='44299301427' -- previous real E2E failed and CAS already closed, NEVER REUSE
  THEN
    RAISE EXCEPTION 'QA_OWNER_CAS_EXPLICIT_NEW_RUN_ID_REQUIRED'; END IF;
  v_ref:='OWNER_RUN_'||v_run_id||'_PR241_89bb408d_V6';
  IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger tr
   WHERE tr.tgrelid='public.wos_production_orders'::regclass
     AND tr.tgname='wos_qa_p2_single_order_gate_guard'
     AND tr.tgenabled IN ('O','A')
     AND tr.tgfoid='wos_qa_safety.p2_single_order_write_guard()'::regprocedure
  ) THEN RAISE EXCEPTION 'QA_OWNER_CAS_SINGLE_ORDER_GUARD_MISSING'; END IF;


  -- CAS is allowed only against both completely closed Gates and a fresh,
  -- unconsumed Run. Never let this template modify an existing business order.
  IF (SELECT count(*) FROM public.wos_qa_p2_execution_gate
        WHERE gate_name='OPERATOR_WRITES' AND enabled=false
          AND enabled_until IS NULL AND approval_reference='NOT_AUTHORIZED')<>1
     OR (SELECT count(*) FROM public.wos_qa_p2_office_execution_gate
        WHERE gate_name='OFFICE_WRITES' AND enabled=false
          AND enabled_until IS NULL AND approval_reference='NOT_AUTHORIZED')<>1
     OR EXISTS(SELECT 1 FROM wos_qa_safety.p2_gate_close_receipts
        WHERE github_run_id=v_run_id)
     OR EXISTS(SELECT 1 FROM wos_qa_safety.p2_gate_open_receipts
        WHERE github_run_id=v_run_id)
  THEN RAISE EXCEPTION 'QA_OWNER_CAS_CLOSED_GATE_OR_REPLAY_PRECONDITION_FAILED'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.wos_production_orders o
    WHERE o.id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
      AND o.order_number='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
      AND o.organization_id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
      AND o.workflow_status='WORKSHOP_REVIEW' AND o.version=6
      AND o.version_label='QA-R6'
  )
  OR (SELECT count(*) FROM public.wos_submission_receipts
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid)<>1
  OR (SELECT count(*) FROM public.wos_workshop_inbox
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid)<>1
  OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid)<>2
  OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
      AND action='ACCEPT' AND expected_version=2)<>1
  OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
      AND action='RETURN_FOR_INFORMATION' AND expected_version=3)<>1
  OR (SELECT count(*) FROM public.wos_qa_p2_office_revisions
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid)<>2
  OR (SELECT count(*) FROM public.wos_qa_p2_office_revisions
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
      AND action='SAVE_CORRECTION' AND expected_version=4 AND new_version=5)<>1
  OR (SELECT count(*) FROM public.wos_qa_p2_office_revisions
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
      AND action='RESUBMIT_CORRECTION' AND expected_version=5 AND new_version=6)<>1
  OR EXISTS(SELECT 1 FROM public.wos_qa_p2_review_receipts
     WHERE order_id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid)
  OR NOT EXISTS(SELECT 1 FROM wos_qa_safety.p2_gate_close_receipts
     WHERE github_run_id='44299301427' AND reason='FAIL')
  THEN RAISE EXCEPTION 'QA_RESUME_V6_BASELINE_CHANGED_FAIL_CLOSED'; END IF;
  IF to_regprocedure('public.wos_qa_p2_resume_v6_owner_attest(text,uuid,text,integer)') IS NULL
    THEN RAISE EXCEPTION 'QA_V6_READONLY_ATTESTOR_NOT_INSTALLED'; END IF;

  -- Both Gate rows and this durable open receipt commit together or roll
  -- back together. Browser proof MUST verify the unique receipt first.
  UPDATE public.wos_qa_p2_execution_gate
    SET enabled=true,enabled_until=v_until,
        approval_reference=v_ref,updated_at=v_at
    WHERE gate_name='OPERATOR_WRITES' AND enabled=false
       AND enabled_until IS NULL AND approval_reference='NOT_AUTHORIZED';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'QA_OWNER_CAS_OPERATOR_CONFLICT'; END IF;

  UPDATE public.wos_qa_p2_office_execution_gate
    SET enabled=true,enabled_until=v_until,
        approval_reference=v_ref,updated_at=v_at
    WHERE gate_name='OFFICE_WRITES' AND enabled=false
       AND enabled_until IS NULL AND approval_reference='NOT_AUTHORIZED';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'QA_OWNER_CAS_OFFICE_CONFLICT'; END IF;

  INSERT INTO wos_qa_safety.p2_gate_open_receipts
    (github_run_id,order_id,reviewed_sha,approval_reference,opened_at,expires_at)
  VALUES
    (v_run_id,'953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid,
     '89bb408d13e45458c608db29c47e2803d49b3170',
     v_ref,v_at,v_until);
END
$owner_only$;
-- Only an explicitly approved QA Owner DBA may commit this atomic write.
COMMIT;
