-- WOS V1-APP-01 PROOF RENEWAL ROLLBACK
-- INSTALL_NOT_AUTHORIZED

BEGIN;

DROP FUNCTION IF EXISTS public.wos_v1_renew_expired_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
);

COMMIT;
