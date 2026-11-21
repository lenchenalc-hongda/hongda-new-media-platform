-- Representative isolated copy of the existing QA trusted proof trigger shape.
CREATE OR REPLACE FUNCTION public.wos_qa_proof_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE v_status text;
BEGIN
 SELECT workflow_status INTO v_status
 FROM public.wos_production_orders
 WHERE id=NEW.order_id AND organization_id=NEW.organization_id;
 IF v_status IS DISTINCT FROM 'DRAFT' THEN
   RAISE EXCEPTION 'QA_LEGACY_DRAFT_ONLY' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.wos_qa_proof_write_guard()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_proof_write_guard()
 TO service_role;
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard
 ON public.wos_qa_verified_image_proofs;
CREATE TRIGGER wos_qa_trusted_proof_guard
BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION public.wos_qa_proof_write_guard();

-- Real QA baseline: service_role had all five managed table privileges.
REVOKE ALL ON public.wos_qa_verified_image_proofs FROM service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE
 ON public.wos_qa_verified_image_proofs TO service_role;
