-- WOS V1 QA UAT application RPC deactivation.
-- NOT INSTALLED / NOT AUTHORIZED.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_uat_app_deactivation_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_DEACTIVATION_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
      IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_PROJECT_MISMATCH';
  END IF;
END;
$guard$;

REVOKE EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_office_resubmit_order(
  uuid,integer,uuid,text
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_operator_review_correction(
  uuid,integer,uuid,text
) FROM authenticated;

DO $postcheck$
DECLARE
  business_function regprocedure;
BEGIN
  FOREACH business_function IN ARRAY ARRAY[
    'public.wos_create_production_order(uuid,jsonb)',
    'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)',
    'public.wos_confirm_office_completeness(uuid,integer,text,text)',
    'public.wos_submit_production_order(uuid,integer,text,uuid)',
    'public.wos_operator_order_action(uuid,integer,uuid,text,text)',
    'public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)',
    'public.wos_office_resubmit_order(uuid,integer,uuid,text)',
    'public.wos_operator_review_correction(uuid,integer,uuid,text)'
  ]::regprocedure[] LOOP
    IF has_function_privilege(
        'authenticated', business_function, 'EXECUTE'
      )
      OR has_function_privilege('anon', business_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_DEACTIVATION_INCOMPLETE';
    END IF;
  END LOOP;
  IF has_function_privilege(
      'authenticated',
      'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_DEACTIVATION_INCOMPLETE';
  END IF;
END;
$postcheck$;

COMMIT;

-- NOT_AUTHORIZED
