-- WOS V1 HOSTED QA EDGE DEPENDENCIES ROLLBACK
-- INSTALL_NOT_AUTHORIZED
--
-- Removes only the three additive QA Edge compatibility functions. Existing
-- Proof rows, Proof receipts, Storage objects and M2 history are preserved.

BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_hosted_rollback_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_HOSTED_QA_ROLLBACK_NOT_AUTHORIZED';
  END IF;
END;
$guard$;

DROP FUNCTION IF EXISTS public.wos_v1_renew_expired_image_proof(
  uuid, uuid, uuid, text, uuid, text, timestamptz, text
);
DROP FUNCTION IF EXISTS public.wos_p7_record_trusted_image_proof(
  uuid, uuid, uuid, text, uuid, text, timestamptz, text
);
DROP FUNCTION IF EXISTS public.wos_p7_service_storage_snapshot(text);

DO $postcheck$
BEGIN
  IF to_regprocedure(
      'public.wos_p7_service_storage_snapshot(text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_HOSTED_QA_ROLLBACK_INCOMPLETE';
  END IF;
END;
$postcheck$;

COMMIT;

SELECT 'WOS_V1_HOSTED_QA_DEPENDENCIES_ROLLBACK=PASS' AS check_name;
