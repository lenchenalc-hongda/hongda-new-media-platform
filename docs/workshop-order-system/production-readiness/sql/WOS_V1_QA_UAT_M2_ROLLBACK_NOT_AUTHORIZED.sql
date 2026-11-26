-- QA-only data-retaining rollback. NOT AUTHORIZED FOR EXECUTION.
-- Removes the QA wrappers but preserves the private gate audit table.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_uat_rollback_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_M2_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROJECT_MISMATCH';
  END IF;
END;
$guard$;

UPDATE wos_v1_qa_uat.write_gates
SET state='CLOSED',closed_at=clock_timestamp()
WHERE project_ref='xulmpqaknlwqqculbsek'
  AND state='OPEN';

DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_authorize_production_start(
  text,uuid,integer,uuid,uuid,text
);
DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_m2_action(
  text,uuid,integer,uuid,text,jsonb
);
DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_open_gate(
  text,uuid,uuid,uuid,text[],timestamptz
);
DROP FUNCTION IF EXISTS wos_v1_qa_uat.gate_allowed(
  uuid,uuid,uuid,text
);

COMMIT;

-- Data retention:
-- wos_v1_qa_uat.write_gates, all production M2 receipts, baselines,
-- material history, status history, confirmations and Storage objects remain.
