-- WOS V1 production M2 activation. Not approved for execution.
-- Apply only inside an Owner-approved Production launch window.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.production_m2_activation_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED';
  END IF;
  IF to_regprocedure(
    'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)'
  ) IS NULL OR to_regprocedure(
    'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)'
  ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_M2_NOT_INSTALLED';
  END IF;
END;
$guard$;

GRANT EXECUTE ON FUNCTION public.wos_v1_m2_action(
  uuid,integer,uuid,text,jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_authorize_production_start(
  uuid,integer,uuid,uuid,text
) TO authenticated;

COMMIT;

-- NOT_AUTHORIZED
