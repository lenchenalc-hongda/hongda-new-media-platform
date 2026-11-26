-- QA-only wrapper activation. NOT AUTHORIZED FOR EXECUTION.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_uat_activation_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_M2_ACTIVATION_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROJECT_MISMATCH';
  END IF;
  IF to_regprocedure(
    'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
  ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_M2_NOT_INSTALLED';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_DIRECT_PRODUCTION_RPC_EXPOSED';
  END IF;
END;
$guard$;

GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_m2_action(
  text,uuid,integer,uuid,text,jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_authorize_production_start(
  text,uuid,integer,uuid,uuid,text
) TO authenticated;

COMMIT;

-- NOT_AUTHORIZED
