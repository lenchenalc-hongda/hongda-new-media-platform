-- WOS V1 production M2 emergency / launch-window closure.
-- Revokes only the two authenticated entry points; audit tables are retained.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.wos_v1_m2_action(
  uuid,integer,uuid,text,jsonb
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_v1_authorize_production_start(
  uuid,integer,uuid,uuid,text
) FROM authenticated;

COMMIT;
