-- WOS P2 QA-ONLY FAIL-CLOSE SAFETY CONTROLLER.
-- Review artifact. Only install to xulmpqaknlwqqculbsek after exact-source
-- validation. NEVER install in Production or activate either QA write gate.
-- This controller only disables gates. It has no path to enable them.
-- PostgreSQL 17. All public APIs use exact function signatures and deny anon.
BEGIN;
CREATE SCHEMA IF NOT EXISTS wos_qa_safety;
REVOKE ALL ON SCHEMA wos_qa_safety FROM PUBLIC, anon, authenticated;

CREATE TABLE wos_qa_safety.p2_gate_close_receipts (
  request_id uuid PRIMARY KEY,
  github_run_id text NOT NULL CHECK (github_run_id ~ '^[0-9]{5,20}$'),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK (reason IN ('PASS','FAIL','CANCEL','TIMEOUT','PREFLIGHT','VERIFY')),
  operator_was_enabled boolean NOT NULL,
  office_was_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE wos_qa_safety.p2_gate_close_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wos_qa_safety.p2_gate_close_receipts FROM PUBLIC, anon, authenticated;

CREATE TABLE wos_qa_safety.p2_gate_watchdog_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  closed_operator boolean NOT NULL,
  closed_office boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE wos_qa_safety.p2_gate_watchdog_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wos_qa_safety.p2_gate_watchdog_receipts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.wos_qa_p2_failclose(
  p_github_run_id text, p_request_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $wos_failclose$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_admins integer;
  v_old_operator boolean;
  v_old_office boolean;
  v_existing wos_qa_safety.p2_gate_close_receipts%ROWTYPE;
  v_is_replay boolean := false;
BEGIN
  -- No capability to enable either gate, alter business records, change RLS,
  -- manipulate storage, or issue an approval. Caller is QA-authenticated.
  IF auth.uid() IS NULL
    OR p_github_run_id IS NULL
    OR p_github_run_id !~ '^[0-9]{5,20}$'
    OR p_request_id IS NULL
    OR p_reason IS NULL
    OR p_reason NOT IN ('PASS','FAIL','CANCEL','TIMEOUT','PREFLIGHT','VERIFY')
  THEN RAISE EXCEPTION 'INVALID_FAILCLOSE_INPUT' USING ERRCODE='22023'; END IF;

  SELECT pg_catalog.count(*) INTO v_admins
  FROM public.profiles
  WHERE user_id = auth.uid() AND is_active = true AND role = 'admin';
  IF v_admins <> 1 THEN
    RAISE EXCEPTION 'QA_GATE_CLOSE_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles
    WHERE user_id=auth.uid() AND role='admin' AND is_active=true LIMIT 1;

  -- Serialize the two updates and all repeated request IDs.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wos-p2-qa-gates-failclose',0));

  SELECT * INTO v_existing FROM wos_qa_safety.p2_gate_close_receipts
    WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.actor_profile_id<>v_actor.id
       OR v_existing.github_run_id<>p_github_run_id
       OR v_existing.reason<>p_reason
    THEN RAISE EXCEPTION 'FAILCLOSE_IDEMPOTENCY_CONFLICT'
       USING ERRCODE='23505'; END IF;
    -- A replay must still re-close the gates if a later run opened them.
    -- Never return a stale CLOSED receipt without touching both gate rows.
    v_is_replay := true;
  END IF;

  SELECT enabled INTO STRICT v_old_operator
  FROM public.wos_qa_p2_execution_gate
  WHERE gate_name='OPERATOR_WRITES' FOR UPDATE;
  SELECT enabled INTO STRICT v_old_office
  FROM public.wos_qa_p2_office_execution_gate
  WHERE gate_name='OFFICE_WRITES' FOR UPDATE;

  UPDATE public.wos_qa_p2_execution_gate
    SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
        updated_at=pg_catalog.clock_timestamp()
    WHERE gate_name='OPERATOR_WRITES';
  UPDATE public.wos_qa_p2_office_execution_gate
    SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
        updated_at=pg_catalog.clock_timestamp()
    WHERE gate_name='OFFICE_WRITES';

  IF NOT v_is_replay THEN
    INSERT INTO wos_qa_safety.p2_gate_close_receipts(
      request_id,github_run_id,actor_profile_id,reason,
      operator_was_enabled,office_was_enabled)
    VALUES(p_request_id,p_github_run_id,v_actor.id,p_reason,
      v_old_operator,v_old_office);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_is_replay THEN 'REPLAYED' ELSE 'CLOSED' END,
    'githubRunId',p_github_run_id,
    'requestId',p_request_id,'operatorEnabled',false,'officeEnabled',false,
    'operatorWasEnabled',v_old_operator,'officeWasEnabled',v_old_office);
END;
$wos_failclose$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_failclose(text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_failclose(text,uuid,text)
  TO authenticated;

-- Watchdog is only run by trusted postgres/pg_cron; it cannot activate gates.
CREATE FUNCTION wos_qa_safety.reap_expired_p2_gates()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $wos_watchdog$
DECLARE
 v_operator boolean :=false;
 v_office boolean :=false;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('wos-p2-qa-gates-failclose',0));
 UPDATE public.wos_qa_p2_execution_gate
 SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
     updated_at=pg_catalog.clock_timestamp()
 WHERE gate_name='OPERATOR_WRITES'
   AND (enabled=true OR enabled_until IS NOT NULL
       OR approval_reference<>'NOT_AUTHORIZED')
   AND (enabled_until IS NULL OR enabled_until<=pg_catalog.clock_timestamp());
 v_operator := FOUND;
 UPDATE public.wos_qa_p2_office_execution_gate
 SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
     updated_at=pg_catalog.clock_timestamp()
 WHERE gate_name='OFFICE_WRITES'
   AND (enabled=true OR enabled_until IS NOT NULL
       OR approval_reference<>'NOT_AUTHORIZED')
   AND (enabled_until IS NULL OR enabled_until<=pg_catalog.clock_timestamp());
 v_office := FOUND;
 IF v_operator OR v_office THEN
   INSERT INTO wos_qa_safety.p2_gate_watchdog_receipts(
     closed_operator,closed_office) VALUES(v_operator,v_office);
 END IF;
 RETURN pg_catalog.jsonb_build_object('operatorClosed',v_operator,
   'officeClosed',v_office);
END;
$wos_watchdog$;
REVOKE ALL ON FUNCTION wos_qa_safety.reap_expired_p2_gates()
 FROM PUBLIC,anon,authenticated;
COMMIT;
-- No Cron installation here; independently deploy trusted cron after audit.
