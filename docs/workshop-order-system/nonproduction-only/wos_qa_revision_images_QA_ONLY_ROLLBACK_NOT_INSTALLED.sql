-- QA-ONLY / NOT INSTALLED / ROLLBACK ONLY.
-- Restores the pre-upgrade trusted proof guard captured by the candidate
-- installation. Audit receipts and the guard backup are retained for review.
BEGIN;

DO $restore_guard$
DECLARE v_definition text;
BEGIN
 SELECT function_definition INTO v_definition
 FROM wos_qa_safety.wos_proof_guard_backup
 WHERE function_oid=(
   SELECT p.oid
   FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='wos_qa_proof_write_guard'
     AND p.pronargs=0
   LIMIT 1
 )
 ORDER BY captured_at
 LIMIT 1;
 IF v_definition IS NULL THEN
   RAISE EXCEPTION 'ORIGINAL_PROOF_GUARD_BACKUP_MISSING';
 END IF;
 EXECUTE v_definition;
END $restore_guard$;

DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard
 ON public.wos_qa_verified_image_proofs;
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_write_guard
 ON public.wos_qa_verified_image_proofs;
CREATE TRIGGER wos_qa_trusted_proof_guard
BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION public.wos_qa_proof_write_guard();

DO $restore_m2_guard$
BEGIN
 IF pg_catalog.to_regprocedure(
   'public.wos_qa_p2_m2_proof_change_guard()') IS NOT NULL THEN
   EXECUTE 'DROP TRIGGER IF EXISTS wos_qa_p2_m2_verified_proof_guard '
     || 'ON public.wos_qa_verified_image_proofs';
   EXECUTE 'CREATE TRIGGER wos_qa_p2_m2_verified_proof_guard '
     || 'BEFORE INSERT OR UPDATE OF storage_bucket,storage_path,storage_object_id,'
     || 'storage_object_version,storage_object_updated_at,verified_sha256,'
     || 'verified_at,expires_at ON public.wos_qa_verified_image_proofs '
     || 'FOR EACH ROW EXECUTE FUNCTION public.wos_qa_p2_m2_proof_change_guard()';
 END IF;
END $restore_m2_guard$;

DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_record_trusted_proof(
 uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text);

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE
 ON public.wos_qa_verified_image_proofs TO service_role;

COMMIT;
