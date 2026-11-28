-- WOS V1 RC03 QA RUNTIME ACTIVATION
-- NOT INSTALLED / NOT AUTHORIZED

BEGIN;

DO $rc03_activation_guard$
BEGIN
  IF current_setting('wos_v1.rc03_activation_authorized', true)
      IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'RC03_ACTIVATION_NOT_AUTHORIZED';
  END IF;
  IF to_regnamespace('wos_v1_rc02_safety') IS NULL THEN
    RAISE EXCEPTION 'RC02_GATE_MUST_BE_INSTALLED_BEFORE_ACTIVATION';
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_rc02_safety.rc02_business_grants
  ) <> 0 THEN
    RAISE EXCEPTION 'RC02_ACTIVATION_REQUIRES_EMPTY_GRANT_TABLE';
  END IF;
END;
$rc03_activation_guard$;

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

COMMIT;
