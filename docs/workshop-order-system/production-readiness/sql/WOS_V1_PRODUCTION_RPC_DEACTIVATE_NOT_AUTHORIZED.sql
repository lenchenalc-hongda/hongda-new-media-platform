-- WOS V1 PRODUCTION RPC DEACTIVATION DRAFT
-- INSTALL_NOT_AUTHORIZED

BEGIN;

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

COMMIT;

SELECT 'WOS_V1_PRODUCTION_RPC_DEACTIVATED' AS check_name;
