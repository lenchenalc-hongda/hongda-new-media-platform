-- QA PROPOSAL ONLY. Do not apply without independent exact-HEAD review and QA-only Owner authorization.
-- This is ADDITIVE: original public.wos_qa_p2_owner_cas_attest(..., expected_version=2) remains unchanged.
-- Project xulmpqaknlwqqculbsek ONLY. Read-only evidence RPC. Does not enable either Gate.
-- Exact resumed order: 953d2204-3e65-4b75-b10e-c6e97f1bbb56 / WORKSHOP_REVIEW / QA-R6 / version 6.
-- Closed prior Run 44299301427 is terminal; never reuse its receipt.
BEGIN;
SET LOCAL statement_timeout='8000ms';
-- WOS P2 QA ONLY / PROPOSED SOURCE. DO NOT RUN on production.
-- NOT INSTALLED: requires a new, separate Owner authorization for
-- Supabase QA project xulmpqaknlwqqculbsek and independently reviewed SQL.
-- This function cannot open either Gate, modify orders, or create grants to
-- Gate tables. The existing owner DBA CAS is the only activation method.
-- Supabase QA expected order was created by real Run #44255738492.
BEGIN;
-- Private receipt is inserted by an *independent Owner DBA* in the SAME
-- transaction that changes both Gate rows. The attestor is read-only.
-- Creating this private QA ledger needs its own future Owner approval.
CREATE TABLE wos_qa_safety.p2_gate_open_receipts (
    github_run_id text PRIMARY KEY,
    order_id uuid NOT NULL,
    reviewed_sha text NOT NULL,
    approval_reference text NOT NULL,
    opened_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    CHECK (github_run_id ~ '^[0-9]{5,20}$'),
    CHECK (expires_at > opened_at AND expires_at <= opened_at + interval '15 minutes')
);
ALTER TABLE wos_qa_safety.p2_gate_open_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_qa_safety.p2_gate_open_receipts FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE wos_qa_safety.p2_gate_open_receipts
IS 'QA-only private evidence written atomically with dual Owner CAS Gate activation; never exposed to anon or authenticated.';

-- QA-only P2 scope enforcement. Existing SECURITY DEFINER P2 RPCs check
-- role, org, Gate and version but do not bind to the one authorized order.
-- While either write Gate remains enabled (even if it just expired), only
-- UPDATE of the exact existing QA synthetic order is permitted. INSERT,
-- DELETE and UPDATE to other orders fail the entire calling RPC transaction.
-- Gate OFF leaves all original QA writes unchanged. NEVER install without
-- a separate exact-source QA Owner schema authorization.
CREATE OR REPLACE FUNCTION wos_qa_safety.p2_single_order_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, wos_qa_safety AS $p2_scope$
DECLARE v_operator_on boolean; v_office_on boolean;
BEGIN
 SELECT coalesce((SELECT enabled FROM public.wos_qa_p2_execution_gate
   WHERE gate_name='OPERATOR_WRITES'),true) INTO v_operator_on;
 SELECT coalesce((SELECT enabled FROM public.wos_qa_p2_office_execution_gate
   WHERE gate_name='OFFICE_WRITES'),true) INTO v_office_on;
 IF v_operator_on OR v_office_on THEN
   IF TG_OP='UPDATE' THEN
     IF OLD.id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid AND NEW.id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
       AND OLD.organization_id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
       AND NEW.organization_id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
       AND OLD.order_number='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
       AND NEW.order_number='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
     THEN RETURN NEW; END IF;
   END IF;
   RAISE EXCEPTION 'QA_P2_GATE_SINGLE_ORDER_SCOPE_REJECTED'
     USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
$p2_scope$;
REVOKE ALL ON FUNCTION wos_qa_safety.p2_single_order_write_guard()
 FROM PUBLIC, anon, authenticated;
CREATE TRIGGER wos_qa_p2_single_order_gate_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.wos_production_orders
 FOR EACH ROW EXECUTE FUNCTION wos_qa_safety.p2_single_order_write_guard();
COMMENT ON FUNCTION wos_qa_safety.p2_single_order_write_guard()
 IS 'QA-only: prevent mutation of unrelated P2 orders during dual write Gate window';

CREATE OR REPLACE FUNCTION public.wos_qa_p2_resume_v6_owner_attest(
    p_github_run_id text,
    p_order_id uuid,
    p_reviewed_sha text,
    p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, wos_qa_safety
AS $$
DECLARE
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_order record;
    v_operator record;
    v_office record;
    v_receipt record;
    v_receipt_found boolean;
    v_expected_ref text;
BEGIN
    -- A QA Admin's verified JWT, NOT arbitrary user_metadata or a client
    -- supplied role, must authorize this narrowly scoped read-only RPC.
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
        AND p.is_active = true
        AND p.org_id = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
    ) THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    -- Hard binding prevents a generic reusable Gate oracle. The trusted
    -- master workflow pins these same values and rejects rerun attempts.
    IF p_github_run_id IS NULL
       OR p_github_run_id !~ '^[0-9]{5,20}$'
       OR p_order_id IS DISTINCT FROM
          '953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
       OR p_reviewed_sha IS DISTINCT FROM
          '89bb408d13e45458c608db29c47e2803d49b3170'
       OR p_expected_version IS DISTINCT FROM 6
    THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_PIN_REJECTED' USING ERRCODE = '42501';
    END IF;


    -- Fail closed if enforced single-order write guard was not installed
    -- (or was disabled). Two ON Gates and an Owner receipt alone are NOT
    -- sufficient proof of the exact authorized business-write scope.
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger tr
      WHERE tr.tgrelid='public.wos_production_orders'::regclass
        AND tr.tgname='wos_qa_p2_single_order_gate_guard'
        AND tr.tgfoid='wos_qa_safety.p2_single_order_write_guard()'::regprocedure
        AND tr.tgenabled IN ('O','A')
        AND (tr.tgtype & 1)=1 AND (tr.tgtype & 2)=2
        AND (tr.tgtype & 4)=4 AND (tr.tgtype & 8)=8
        AND (tr.tgtype & 16)=16
    ) THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_SINGLE_ORDER_GUARD_MISSING'
        USING ERRCODE='42501';
    END IF;

    -- A closed run is terminal: it may never be attested or replayed.
    IF EXISTS (
      SELECT 1 FROM wos_qa_safety.p2_gate_close_receipts closed
      WHERE closed.github_run_id = p_github_run_id
    ) THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_RUN_ALREADY_CLOSED'
        USING ERRCODE = '42501';
    END IF;

    SELECT o.id, o.order_number, o.organization_id,
           o.workflow_status, o.version, o.version_label
      INTO v_order
      FROM public.wos_production_orders o
      WHERE o.id = p_order_id;
    IF NOT FOUND
       OR v_order.organization_id IS DISTINCT FROM
          '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
       OR v_order.order_number IS DISTINCT FROM
          'QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
       OR v_order.workflow_status IS DISTINCT FROM 'WORKSHOP_REVIEW'
       OR v_order.version IS DISTINCT FROM 6
       OR (SELECT count(*) FROM public.wos_submission_receipts s
           WHERE s.order_id = p_order_id) <> 1
       OR (SELECT count(*) FROM public.wos_workshop_inbox wi
           WHERE wi.order_id = p_order_id) <> 1
       OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts a
           WHERE a.order_id = p_order_id) <> 2
       OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts a
           WHERE a.order_id = p_order_id AND a.action='ACCEPT' AND a.expected_version=2) <> 1
       OR (SELECT count(*) FROM public.wos_qa_p2_action_receipts a
           WHERE a.order_id = p_order_id AND a.action='RETURN_FOR_INFORMATION' AND a.expected_version=3) <> 1
       OR (SELECT count(*) FROM public.wos_qa_p2_office_revisions r
           WHERE r.order_id = p_order_id) <> 2
       OR (SELECT count(*) FROM public.wos_qa_p2_office_revisions r
           WHERE r.order_id = p_order_id AND r.action='SAVE_CORRECTION' AND r.expected_version=4 AND r.new_version=5) <> 1
       OR (SELECT count(*) FROM public.wos_qa_p2_office_revisions r
           WHERE r.order_id = p_order_id AND r.action='RESUBMIT_CORRECTION' AND r.expected_version=5 AND r.new_version=6) <> 1
       OR (SELECT count(*) FROM public.wos_qa_p2_review_receipts r
           WHERE r.order_id=p_order_id) <> 0
       OR NOT EXISTS (SELECT 1 FROM wos_qa_safety.p2_gate_close_receipts c
           WHERE c.github_run_id='44299301427' AND c.reason='FAIL')
       OR v_order.version_label IS DISTINCT FROM 'QA-R6'
    THEN
      RAISE EXCEPTION 'QA_V6_OWNER_ATTEST_ORDER_HISTORY_OR_VERSION_MISMATCH'
        USING ERRCODE = '42501';
    END IF;

    SELECT enabled, enabled_until, approval_reference, updated_at
      INTO v_operator
      FROM public.wos_qa_p2_execution_gate
      WHERE gate_name = 'OPERATOR_WRITES';
    SELECT enabled, enabled_until, approval_reference, updated_at
      INTO v_office
      FROM public.wos_qa_p2_office_execution_gate
      WHERE gate_name = 'OFFICE_WRITES';
    IF NOT FOUND OR v_operator.enabled IS NULL OR v_office.enabled IS NULL
    THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_GATE_NOT_INSTALLED'
        USING ERRCODE = '42501';
    END IF;

    SELECT github_run_id, order_id, reviewed_sha, approval_reference,
           opened_at, expires_at INTO v_receipt
      FROM wos_qa_safety.p2_gate_open_receipts
      WHERE github_run_id = p_github_run_id;
    v_receipt_found := FOUND;

    -- Before Owner CAS, return only WAITING; NO Gate table read grant and
    -- no user/order details are leaked. The Runner polls this state
    -- under a fixed maximum deadline, never a blind fixed 90-second sleep.
    IF v_operator.enabled IS FALSE AND v_office.enabled IS FALSE
       AND v_operator.enabled_until IS NULL AND v_office.enabled_until IS NULL
       AND v_operator.approval_reference = 'NOT_AUTHORIZED'
       AND v_office.approval_reference = 'NOT_AUTHORIZED'
       AND NOT v_receipt_found
    THEN
      RETURN pg_catalog.jsonb_build_object('status','WAITING');
    END IF;

    -- Both separately protected Gate rows must have been atomically CAS
    -- changed by a privileged Owner DBA. Never attest a partial update.
    v_expected_ref := 'OWNER_RUN_' || p_github_run_id || '_PR241_89bb408d_V6';
    IF NOT v_receipt_found
       OR v_receipt.order_id IS DISTINCT FROM p_order_id
       OR v_receipt.reviewed_sha IS DISTINCT FROM p_reviewed_sha
       OR v_receipt.approval_reference IS DISTINCT FROM v_expected_ref
       OR v_receipt.expires_at <= v_now + interval '120 seconds'
       OR v_receipt.expires_at > v_now + interval '15 minutes'
       OR v_receipt.opened_at NOT BETWEEN v_now - interval '15 minutes' AND v_now
       OR v_operator.enabled IS DISTINCT FROM TRUE
       OR v_office.enabled IS DISTINCT FROM TRUE
       OR v_operator.approval_reference IS DISTINCT FROM v_expected_ref
       OR v_office.approval_reference IS DISTINCT FROM v_expected_ref
       OR v_operator.enabled_until IS NULL OR v_office.enabled_until IS NULL
       OR v_operator.enabled_until <= v_now + interval '120 seconds'
       OR v_office.enabled_until <= v_now + interval '120 seconds'
       OR v_operator.enabled_until > v_now + interval '15 minutes'
       OR v_office.enabled_until > v_now + interval '15 minutes'
       OR v_operator.updated_at NOT BETWEEN v_now - interval '15 minutes' AND v_now
       OR v_office.updated_at NOT BETWEEN v_now - interval '15 minutes' AND v_now
       OR v_operator.enabled_until IS DISTINCT FROM v_receipt.expires_at
       OR v_office.enabled_until IS DISTINCT FROM v_receipt.expires_at
       OR v_operator.updated_at IS DISTINCT FROM v_receipt.opened_at
       OR v_office.updated_at IS DISTINCT FROM v_receipt.opened_at
    THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_CAS_NOT_VERIFIED'
        USING ERRCODE = '42501';
    END IF;

    -- This is a live DB observation, not a caller claim or browser flag.
    -- The existing business RPCs independently enforce Gate expiry again
    -- on every individual mutation (TOCTOU remains fail-closed).
    RETURN pg_catalog.jsonb_build_object(
      'status','READY',
      'githubRunId',p_github_run_id,
      'reviewedSha',p_reviewed_sha,
      'orderId',p_order_id,
      'expectedVersion',p_expected_version,
      'operatorEnabled',true,
      'officeEnabled',true,
      'expiresAt',pg_catalog.to_char(
        least(v_operator.enabled_until,v_office.enabled_until)
        AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
END
$$;
-- Functions in an exposed schema default to PUBLIC EXECUTE unless revoked.
REVOKE ALL ON FUNCTION public.wos_qa_p2_owner_cas_attest(
  text,uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_owner_cas_attest(
  text,uuid,text,integer) TO authenticated;
COMMENT ON FUNCTION public.wos_qa_p2_owner_cas_attest(text,uuid,text,integer)
IS 'QA-only, Admin-only, read-only proof of Owner CAS for Run and fixed SUBMITTED synthetic order. NOT a Gate opener.';
COMMIT;

-- Default EXECUTE to PUBLIC on new Postgres functions is forbidden.
REVOKE ALL ON FUNCTION public.wos_qa_p2_resume_v6_owner_attest(text,uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_resume_v6_owner_attest(text,uuid,text,integer) TO authenticated;
COMMIT;
