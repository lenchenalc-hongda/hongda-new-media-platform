-- WOS V1 PRODUCTION RPC ACTIVATION TEMPLATE
-- INSTALL_NOT_AUTHORIZED
--
-- This is the only draft that would expose Production write RPCs to the
-- application role. It requires a separate exact-SQL Owner authorization and
-- a separately approved Production release window.

BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.production_activation_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_ACTIVATION_NOT_AUTHORIZED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid =
      'public.wos_create_production_order(uuid,jsonb)'::regprocedure
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid =
      'public.wos_operator_review_correction(uuid,integer,uuid,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_PREREQUISITE_MISSING';
  END IF;
END;
$guard$;

GRANT EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)
TO authenticated;
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
BEGIN
  IF pg_catalog.has_function_privilege(
      'anon',
      'public.wos_create_production_order(uuid,jsonb)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_v1_assert_current_image_set(uuid,uuid,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'INSERT,UPDATE,DELETE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_office_revisions',
      'SELECT,INSERT,UPDATE,DELETE'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_ACTIVATION_PRIVILEGE_VIOLATION';
  END IF;
END;
$postcheck$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
