-- Exact live QA trusted-proof guard captured at definition SHA-256
-- 9a91e8e6441e0beee2c4fa3d4d410582784d3d310939c99007ac65f06d7a63fd.
CREATE OR REPLACE FUNCTION public.wos_qa_proof_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE
 v_obj storage.objects%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_profile public.profiles%ROWTYPE;
BEGIN
 IF pg_catalog.current_setting('wos.qa.trusted_proof_rpc',true)
      IS DISTINCT FROM '1'
    OR pg_catalog.current_setting('wos.qa.actor_user_id',true)
      IS DISTINCT FROM NEW.actor_user_id::text
 THEN RAISE EXCEPTION 'TRUSTED_PROOF_RPC_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id=NEW.order_id AND organization_id=NEW.organization_id;
 IF NOT FOUND OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
 THEN RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_AUTHORIZED' USING ERRCODE='23514'; END IF;
 IF v_order.workflow_status='DRAFT' THEN
   NULL;
 ELSIF v_order.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')
   AND v_order.version_label ~ '^QA-R[1-9][0-9]*$' THEN
   SELECT * INTO v_profile FROM public.profiles
    WHERE user_id=NEW.actor_user_id AND is_active=true
      AND role IN ('admin','manager','sales')
      AND (auth.uid() IS NULL OR user_id=auth.uid()) LIMIT 1;
   IF v_profile.id IS NULL OR v_profile.org_id<>v_order.organization_id
     OR (v_profile.role='sales' AND v_profile.id NOT IN
       (v_order.created_by_profile_id,v_order.sales_owner_profile_id))
     OR NOT public.wos_qa_revision_gate_allows(
       v_order.id,v_order.organization_id,v_profile.id)
   THEN RAISE EXCEPTION 'QA_REVISION_PROOF_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
   RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_EDITABLE' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_obj FROM storage.objects
  WHERE id=NEW.storage_object_id AND name=NEW.storage_path
    AND bucket_id='wos-private' AND is_delete_marker=false
    AND archived_at IS NULL;
 IF NOT FOUND OR v_obj.version IS DISTINCT FROM NEW.storage_object_version
   OR v_obj.updated_at IS DISTINCT FROM NEW.storage_object_updated_at
   OR v_obj.owner_id IS DISTINCT FROM NEW.actor_user_id::text
 THEN RAISE EXCEPTION 'QA_PROOF_OBJECT_CHANGED' USING ERRCODE='23514'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
   WHERE c.storage_object_id=v_obj.id AND c.state='CLAIMED'
     AND c.lease_expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
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
