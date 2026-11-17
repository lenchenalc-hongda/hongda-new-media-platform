-- PROPOSAL ONLY. NOT EXECUTED.
-- Emergency fail-close *after* separate owner authorization and only against
-- QA project xulmpqaknlwqqculbsek (never amqpvxrurenevniilhtl).
-- No data deletion, no DROP, no production usage.
-- Execute with a privileged QA database identity only if exact objects exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF to_regclass('public.wos_qa_p2_execution_gate') IS NULL THEN
    RAISE EXCEPTION 'QA_P2_EXECUTION_GATE_NOT_INSTALLED';
  END IF;
  IF to_regprocedure('public.wos_qa_p2_operator_action(uuid,integer,uuid,text,text,text,integer,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'QA_P2_RPC_NOT_INSTALLED';
  END IF;
END $$;
UPDATE public.wos_qa_p2_execution_gate
   SET enabled=false,
       enabled_until=NULL,
       approval_reference='NOT_AUTHORIZED',
       updated_at=pg_catalog.clock_timestamp()
 WHERE gate_name='OPERATOR_WRITES';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES' AND enabled=false AND enabled_until IS NULL) <> 1 THEN
    RAISE EXCEPTION 'QA_P2_EXECUTION_GATE_FAIL_CLOSE_NOT_VERIFIED';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_operator_action(
  uuid,integer,uuid,text,text,text,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
COMMIT;
-- Read-back must be independently recorded. Confirm ordinary authenticated
-- and anon role have zero EXECUTE, and Preview flags turned OFF independently.
