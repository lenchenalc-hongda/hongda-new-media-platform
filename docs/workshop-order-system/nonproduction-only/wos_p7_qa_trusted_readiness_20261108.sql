-- WOS isolated QA ONLY. Existing historic submitted synthetic orders are not modified.
BEGIN;
DO $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.wos_production_orders
 WHERE order_number LIKE 'QA-NONPROD-%') THEN RAISE EXCEPTION 'SYNTHETIC_QA_REQUIRED'; END IF; END $qa$;
CREATE OR REPLACE FUNCTION public.wos_confirm_office_completeness(
 p_order_id uuid,p_expected_revision integer,p_expected_label text,p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_id uuid;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
  WHERE user_id=auth.uid() AND is_active=true AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_expected_label IS NULL OR length(p_expected_label)>120
  OR nullif(btrim(p_note),'') IS NULL OR length(p_note) NOT BETWEEN 10 AND 2000
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
   OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
       AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_revision
   OR v_order.version_label<>p_expected_label
 THEN RAISE EXCEPTION 'STALE_OR_UNEDITABLE_ORDER' USING ERRCODE='PT409'; END IF;
 -- A READY row alone cannot be trusted. Before readiness, ensure the
 -- underlying binary was attested by the isolated Edge verifier and that
 -- its Storage object identity has not changed.
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_reference_images im
   JOIN public.wos_qa_verified_image_proofs proof
     ON proof.image_id=im.id AND proof.order_id=im.entity_id
     AND proof.organization_id=im.organization_id
     AND proof.storage_path=im.storage_path
   JOIN storage.objects obj ON obj.id=proof.storage_object_id
     AND obj.bucket_id='wos-private' AND obj.name=im.storage_path
     AND obj.version IS NOT DISTINCT FROM proof.storage_object_version
     AND obj.updated_at IS NOT DISTINCT FROM proof.storage_object_updated_at
     AND obj.is_delete_marker=false AND obj.archived_at IS NULL
   WHERE im.organization_id=v_actor.org_id AND im.entity_type='PRODUCTION_ORDER'
     AND im.entity_id=p_order_id AND im.image_status='READY'
     AND im.version_label=p_expected_label AND im.storage_bucket='wos-private'
 ) THEN RAISE EXCEPTION 'TRUSTED_PRIVATE_IMAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.wos_office_readiness_receipts(
  organization_id,order_id,source_revision,source_version_label,actor_profile_id,note)
 VALUES(v_actor.org_id,p_order_id,p_expected_revision,p_expected_label,v_actor.id,p_note)
 ON CONFLICT (order_id,source_revision) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM public.wos_office_readiness_receipts
   WHERE order_id=p_order_id AND source_revision=p_expected_revision
     AND organization_id=v_actor.org_id AND source_version_label=p_expected_label
     AND actor_profile_id=v_actor.id AND note=p_note;
  IF v_id IS NULL THEN
   RAISE EXCEPTION 'READINESS_ALREADY_CONFIRMED_DIFFERENTLY' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.wos_confirm_office_completeness(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_confirm_office_completeness(uuid,integer,text,text) TO authenticated;
COMMIT;
