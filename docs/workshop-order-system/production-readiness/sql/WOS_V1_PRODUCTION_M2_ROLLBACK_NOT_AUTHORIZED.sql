-- WOS V1 production M2 data-retaining rollback. Not approved for execution.
-- Removes callable entry points and triggers while preserving all receipts,
-- start-release rows, material history, baselines and business data.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.production_m2_rollback_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED';
  END IF;
END;
$guard$;

REVOKE EXECUTE ON FUNCTION public.wos_v1_m2_action(
  uuid,integer,uuid,text,jsonb
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wos_v1_authorize_production_start(
  uuid,integer,uuid,uuid,text
) FROM authenticated;

DROP TRIGGER IF EXISTS wos_v1_m2_reference_image_guard
  ON public.wos_reference_images;
DROP TRIGGER IF EXISTS wos_v1_m2_proof_change_guard
  ON public.wos_verified_image_proofs;

DROP FUNCTION IF EXISTS public.wos_v1_authorize_production_start(
  uuid,integer,uuid,uuid,text
);
DROP FUNCTION IF EXISTS public.wos_v1_m2_action(
  uuid,integer,uuid,text,jsonb
);
DROP FUNCTION IF EXISTS public.wos_v1_m2_proof_change_guard();
DROP FUNCTION IF EXISTS public.wos_v1_m2_image_change_guard();
DROP FUNCTION IF EXISTS public.wos_v1_m2_invalidate_signoff(
  uuid,uuid,uuid
);
DROP FUNCTION IF EXISTS public.wos_v1_m2_spec_digest(uuid);
DROP FUNCTION IF EXISTS public.wos_v1_m2_checked_proof_set(
  uuid,uuid,uuid,text
);

COMMIT;

-- Data retention:
-- public.wos_v1_m2_receipts and public.wos_v1_start_releases are intentionally
-- retained. Office/Workshop digest columns and all business rows are retained.
