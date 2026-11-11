-- QA-only refresh of read-only orphan dry-run inventory.
BEGIN;
DO $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.wos_production_orders
 WHERE order_number LIKE 'QA-NONPROD-%') THEN RAISE EXCEPTION 'QA_REQUIRED'; END IF; END $qa$;
CREATE OR REPLACE FUNCTION public.wos_qa_list_stale_orphans(
 p_min_age_hours integer DEFAULT 24, p_limit integer DEFAULT 100)
RETURNS TABLE(storage_path text,storage_object_id uuid,object_created_at timestamptz,
 order_id uuid,organization_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF p_min_age_hours IS NULL OR p_limit IS NULL OR p_min_age_hours<24 OR p_min_age_hours>720 OR p_limit<1 OR p_limit>100
 THEN RAISE EXCEPTION 'INVALID_ORPHAN_INVENTORY_LIMIT' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT so.name,so.id,so.created_at,po.id,po.organization_id
 FROM storage.objects so
 JOIN public.wos_production_orders po
   ON po.id::text=(storage.foldername(so.name))[5]
   AND po.organization_id::text=(storage.foldername(so.name))[2]
 WHERE so.bucket_id='wos-private'
 AND so.name LIKE 'organizations/%/wos/production-order/%/images/%'
 AND so.is_delete_marker=false AND so.archived_at IS NULL
 AND po.order_number LIKE 'QA-NONPROD-%'
 AND so.created_at<now()-make_interval(hours=>p_min_age_hours)
 AND po.updated_at<now()-make_interval(hours=>p_min_age_hours)
 AND po.workflow_status IN ('DRAFT','SUBMITTED')
 AND (po.workflow_status='SUBMITTED' OR NOT EXISTS (
  SELECT 1 FROM public.wos_office_readiness_receipts rd WHERE rd.order_id=po.id))
 AND NOT EXISTS (SELECT 1 FROM public.wos_reference_images im
  WHERE im.storage_bucket='wos-private' AND im.storage_path=so.name)
 AND NOT EXISTS (SELECT 1 FROM public.wos_qa_verified_image_proofs proof
  WHERE proof.storage_path=so.name AND proof.expires_at>clock_timestamp())
 AND NOT EXISTS (SELECT 1 FROM public.wos_qa_orphan_cleanup_claims claim
  WHERE claim.storage_object_id=so.id AND claim.state='CLAIMED'
    AND claim.lease_expires_at>clock_timestamp())
 ORDER BY so.created_at ASC LIMIT p_limit;
END $fn$;
REVOKE ALL ON FUNCTION public.wos_qa_list_stale_orphans(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_list_stale_orphans(integer,integer) TO service_role;
COMMIT;
