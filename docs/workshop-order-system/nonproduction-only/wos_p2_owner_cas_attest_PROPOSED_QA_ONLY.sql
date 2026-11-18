-- WOS P2 QA ONLY / PROPOSED SOURCE. DO NOT RUN on production.
-- NOT INSTALLED: requires a new, separate Owner authorization for
-- Supabase QA project xulmpqaknlwqqculbsek and independently reviewed SQL.
-- This function cannot open either Gate, modify orders, or create grants to
-- Gate tables. The existing owner DBA CAS is the only activation method.
-- Supabase QA expected order was created by real Run #44255738492.
BEGIN;
CREATE OR REPLACE FUNCTION public.wos_qa_p2_owner_cas_attest(
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
       OR p_expected_version IS DISTINCT FROM 2
    THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_PIN_REJECTED' USING ERRCODE = '42501';
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
           o.workflow_status, o.version
      INTO v_order
      FROM public.wos_production_orders o
      WHERE o.id = p_order_id;
    IF NOT FOUND
       OR v_order.organization_id IS DISTINCT FROM
          '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
       OR v_order.order_number IS DISTINCT FROM
          'QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
       OR v_order.workflow_status IS DISTINCT FROM 'SUBMITTED'
       OR v_order.version IS DISTINCT FROM 2
       OR (SELECT count(*) FROM public.wos_submission_receipts s
           WHERE s.order_id = p_order_id) <> 1
       OR (SELECT count(*) FROM public.wos_workshop_inbox wi
           WHERE wi.order_id = p_order_id) <> 1
       OR EXISTS(SELECT 1 FROM public.wos_qa_p2_action_receipts a
           WHERE a.order_id = p_order_id)
    THEN
      RAISE EXCEPTION 'QA_OWNER_ATTEST_EXISTING_ORDER_NOT_SUBMITTED'
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

    -- Before Owner CAS, return only WAITING; NO Gate table read grant and
    -- no user/order details are leaked. The Runner polls this state
    -- under a fixed maximum deadline, never a blind fixed 90-second sleep.
    IF v_operator.enabled IS FALSE AND v_office.enabled IS FALSE
       AND v_operator.enabled_until IS NULL AND v_office.enabled_until IS NULL
       AND v_operator.approval_reference = 'NOT_AUTHORIZED'
       AND v_office.approval_reference = 'NOT_AUTHORIZED'
    THEN
      RETURN pg_catalog.jsonb_build_object('status','WAITING');
    END IF;

    -- Both separately protected Gate rows must have been atomically CAS
    -- changed by a privileged Owner DBA. Never attest a partial update.
    v_expected_ref := 'OWNER_RUN_' || p_github_run_id || '_PR241_89bb408d';
    IF v_operator.enabled IS DISTINCT FROM TRUE
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
       OR abs(extract(epoch FROM (v_operator.enabled_until - v_office.enabled_until))) > 2
       OR abs(extract(epoch FROM (v_operator.updated_at - v_office.updated_at))) > 2
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
