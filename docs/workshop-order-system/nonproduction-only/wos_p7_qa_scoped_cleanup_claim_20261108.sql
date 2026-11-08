-- QA-only cleanup claim is strictly scoped to requesting admin organization.
BEGIN;
DO $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.wos_production_orders
  WHERE order_number LIKE 'QA-NONPROD-%') THEN RAISE EXCEPTION 'QA_REQUIRED'; END IF; END $qa$;
CREATE OR REPLACE FUNCTION public.wos_qa_claim_stale_orphan_for_org(
 p_organization_id uuid,p_min_age_hours integer DEFAULT 48)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $claim$
DECLARE
 v_obj record; v_claim public.wos_qa_orphan_cleanup_claims%ROWTYPE;
 v_claim_token uuid:=gen_random_uuid();
BEGIN
 IF p_organization_id IS NULL OR p_min_age_hours IS NULL OR p_min_age_hours<24 OR p_min_age_hours>720 THEN
  RAISE EXCEPTION 'INVALID_CLEANUP_AGE' USING ERRCODE='22023'; END IF;
 SELECT so.id AS obj_id,so.name,so.version,so.updated_at AS object_updated_at,
  po.id AS order_id,po.organization_id
 INTO v_obj
 FROM storage.objects so
 JOIN public.wos_production_orders po
   ON po.id::text=(storage.foldername(so.name))[5]
   AND po.organization_id::text=(storage.foldername(so.name))[2]
 LEFT JOIN public.wos_qa_orphan_cleanup_claims c ON c.storage_object_id=so.id
 WHERE so.bucket_id='wos-private'
  AND so.name LIKE 'organizations/%/wos/production-order/%/images/%'
  AND so.is_delete_marker=false AND so.archived_at IS NULL
  AND po.organization_id=p_organization_id
  AND po.order_number LIKE 'QA-NONPROD-%'
  AND po.workflow_status IN ('DRAFT','SUBMITTED')
  AND so.created_at<now()-make_interval(hours=>p_min_age_hours)
  AND po.updated_at<now()-make_interval(hours=>p_min_age_hours)
  AND (po.workflow_status='SUBMITTED' OR NOT EXISTS (
    SELECT 1 FROM public.wos_office_readiness_receipts ready WHERE ready.order_id=po.id))
  AND NOT EXISTS (SELECT 1 FROM public.wos_reference_images im
    WHERE im.storage_bucket='wos-private' AND im.storage_path=so.name)
  AND NOT EXISTS (SELECT 1 FROM public.wos_qa_verified_image_proofs pf
    WHERE pf.storage_path=so.name AND pf.expires_at>clock_timestamp())
  AND (c.storage_object_id IS NULL OR c.state<>'CLAIMED'
       OR c.lease_expires_at<clock_timestamp())
 ORDER BY so.created_at ASC
 LIMIT 1 FOR UPDATE OF so,po SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_ELIGIBLE_ORPHAN');END IF;
 INSERT INTO public.wos_qa_orphan_cleanup_claims AS claim (
  storage_object_id,storage_path,order_id,organization_id,object_version,
  object_updated_at,claim_token,state,claimed_at,lease_expires_at)
 VALUES(v_obj.obj_id,v_obj.name,v_obj.order_id,v_obj.organization_id,
  v_obj.version,v_obj.object_updated_at,v_claim_token,'CLAIMED',
  now(),now()+interval '5 minutes')
 ON CONFLICT(storage_object_id) DO UPDATE SET
  claim_token=excluded.claim_token,storage_path=excluded.storage_path,
  order_id=excluded.order_id,organization_id=excluded.organization_id,
  object_version=excluded.object_version,
  object_updated_at=excluded.object_updated_at,state='CLAIMED',
  claimed_at=now(),lease_expires_at=now()+interval '5 minutes',
  finished_at=NULL,last_result=NULL
 WHERE claim.state<>'CLAIMED' OR claim.lease_expires_at<clock_timestamp()
 RETURNING * INTO v_claim;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','ALREADY_CLAIMED');END IF;
 RETURN jsonb_build_object('status','CLAIMED','claimToken',v_claim.claim_token,
  'objectId',v_claim.storage_object_id,'path',v_claim.storage_path,
  'orderId',v_claim.order_id,'organizationId',v_claim.organization_id,
  'leaseExpiresAt',v_claim.lease_expires_at);
END $claim$;
REVOKE ALL ON FUNCTION public.wos_qa_claim_stale_orphan_for_org(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_claim_stale_orphan_for_org(uuid,integer)
 TO service_role;
REVOKE ALL ON FUNCTION public.wos_qa_claim_one_stale_orphan(integer) FROM PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.wos_qa_claim_one_stale_orphan(integer);
COMMIT;
