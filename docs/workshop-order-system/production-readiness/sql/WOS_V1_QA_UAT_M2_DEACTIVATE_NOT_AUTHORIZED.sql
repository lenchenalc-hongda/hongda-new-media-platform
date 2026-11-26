-- QA-only data-retaining close. NOT AUTHORIZED FOR EXECUTION.
-- Closes every open QA UAT gate and revokes only the two wrapper entry points.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_uat_close_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_M2_CLOSE_NOT_AUTHORIZED';
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

DO $revoke$
BEGIN
  IF to_regprocedure(
    'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb) FROM authenticated';
  END IF;
  IF to_regprocedure(
    'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text) FROM authenticated';
  END IF;
END;
$revoke$;

COMMIT;

-- Gate rows and all M2/business audit data are retained.
