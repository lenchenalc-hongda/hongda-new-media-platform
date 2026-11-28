-- WOS V1 QA UAT application RPC activation.
-- NOT INSTALLED / NOT AUTHORIZED.
BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.wos_production_orders
FROM PUBLIC, authenticated;
DO $revision_acl$
BEGIN
  IF to_regclass('public.wos_office_revisions') IS NOT NULL THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE
    ON public.wos_office_revisions FROM PUBLIC, authenticated;
  END IF;
END;
$revision_acl$;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_uat_app_activation_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_ACTIVATION_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
      IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_PROJECT_MISMATCH';
  END IF;
  IF current_setting('wos_v1.qa_authorization_id', true)
      IS DISTINCT FROM 'WOS-V1-PRODUCTION-M2-QA-UAT-007'
    OR (
      current_setting('wos_v1.qa_execution_id', true)
        IS DISTINCT FROM 'a36e5a05-8403-45ef-a700-1440046949ba'
      AND current_setting('wos_v1.qa_local_test', true)
        IS DISTINCT FROM 'yes'
    )
    OR current_setting('wos_v1.qa_execution_id', true)
      !~ '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_EXECUTION_MISMATCH';
  END IF;
  IF to_regclass('wos_v1_qa_uat.closeout_controls') IS NULL
    OR to_regclass('wos_v1_qa_uat.write_gates') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_CLOSERS_NOT_INSTALLED';
  END IF;
  IF to_regprocedure('public.wos_create_production_order(uuid,jsonb)') IS NULL
    OR to_regprocedure(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_operator_order_action(uuid,integer,uuid,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_office_resubmit_order(uuid,integer,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_operator_review_correction(uuid,integer,uuid,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_RPC_NOT_INSTALLED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM wos_v1_qa_uat.closeout_controls control
    WHERE control.project_ref = 'xulmpqaknlwqqculbsek'
      AND control.authorization_id =
        current_setting('wos_v1.qa_authorization_id', true)
      AND control.execution_id =
        current_setting('wos_v1.qa_execution_id', true)::uuid
      AND control.db_state = 'ARMED'
      AND control.edge_state = 'ARMED'
      AND control.write_deadline_at >
        clock_timestamp() + interval '4 minutes'
      AND control.db_last_heartbeat_at >=
        clock_timestamp() - interval '30 seconds'
      AND control.edge_last_heartbeat_at >=
        clock_timestamp() - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_REQUIRES_ARMED_CLOSERS';
  END IF;
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
    OR (
      to_regprocedure(
        'public.wos_v1_assert_current_image_set(uuid,uuid,text)'
      ) IS NOT NULL
      AND has_function_privilege(
        'authenticated',
        'public.wos_v1_assert_current_image_set(uuid,uuid,text)',
        'EXECUTE'
      )
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_PRIVATE_RPC_EXPOSED';
  END IF;
  IF has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'INSERT'
    )
    OR has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'UPDATE'
    )
    OR has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'DELETE'
    )
    OR (
      to_regclass('public.wos_office_revisions') IS NOT NULL
      AND (
        has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'SELECT'
        )
        OR has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'INSERT'
        )
        OR has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'UPDATE'
        )
        OR has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'DELETE'
        )
      )
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_BROAD_TABLE_ACCESS';
  END IF;
END;
$guard$;

REVOKE EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wos_office_resubmit_order(
  uuid,integer,uuid,text
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wos_operator_review_correction(
  uuid,integer,uuid,text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(
  uuid,uuid,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_office_resubmit_order(
  uuid,integer,uuid,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_operator_review_correction(
  uuid,integer,uuid,text
) TO authenticated;

DO $postcheck$
DECLARE
  business_function regprocedure;
BEGIN
  FOREACH business_function IN ARRAY ARRAY[
    'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)',
    'public.wos_confirm_office_completeness(uuid,integer,text,text)',
    'public.wos_submit_production_order(uuid,integer,text,uuid)',
    'public.wos_operator_order_action(uuid,integer,uuid,text,text)',
    'public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)',
    'public.wos_office_resubmit_order(uuid,integer,uuid,text)',
    'public.wos_operator_review_correction(uuid,integer,uuid,text)'
  ]::regprocedure[] LOOP
    IF NOT has_function_privilege(
        'authenticated', business_function, 'EXECUTE'
      )
      OR has_function_privilege('anon', business_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'WOS_V1_QA_UAT_APP_RPC_ACL_VIOLATION';
    END IF;
  END LOOP;
  IF has_function_privilege(
      'authenticated',
      'public.wos_create_production_order(uuid,jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.wos_create_production_order(uuid,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CREATE_FORBIDDEN_IN_RESUME_MODE';
  END IF;
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
    OR (
      to_regprocedure(
        'public.wos_v1_assert_current_image_set(uuid,uuid,text)'
      ) IS NOT NULL
      AND has_function_privilege(
        'authenticated',
        'public.wos_v1_assert_current_image_set(uuid,uuid,text)',
        'EXECUTE'
      )
    )
    OR has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'INSERT'
    )
    OR has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'UPDATE'
    )
    OR has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'DELETE'
    )
    OR (
      to_regclass('public.wos_office_revisions') IS NOT NULL
      AND (
        has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'SELECT'
        )
        OR has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'INSERT'
        )
        OR has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'UPDATE'
        )
        OR has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'DELETE'
        )
      )
    )
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_APP_PRIVILEGE_VIOLATION prodIns=% prodUpd=% prodDel=% revSel=% revIns=% revUpd=% revDel=%',
      has_table_privilege(
        'authenticated', 'public.wos_production_orders', 'INSERT'
      ),
      has_table_privilege(
        'authenticated', 'public.wos_production_orders', 'UPDATE'
      ),
      has_table_privilege(
        'authenticated', 'public.wos_production_orders', 'DELETE'
      ),
      CASE WHEN to_regclass('public.wos_office_revisions') IS NULL
        THEN NULL
        ELSE has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'SELECT'
        )
      END,
      CASE WHEN to_regclass('public.wos_office_revisions') IS NULL
        THEN NULL
        ELSE has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'INSERT'
        )
      END,
      CASE WHEN to_regclass('public.wos_office_revisions') IS NULL
        THEN NULL
        ELSE has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'UPDATE'
        )
      END,
      CASE WHEN to_regclass('public.wos_office_revisions') IS NULL
        THEN NULL
        ELSE has_table_privilege(
          'authenticated', 'public.wos_office_revisions', 'DELETE'
        )
      END;
  END IF;
END;
$postcheck$;

COMMIT;

-- NOT_AUTHORIZED
