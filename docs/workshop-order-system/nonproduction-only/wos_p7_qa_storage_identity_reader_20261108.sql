BEGIN;
DO $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.wos_production_orders WHERE order_number LIKE 'QA-NONPROD-%') THEN RAISE EXCEPTION 'WOS_QA_REQUIRED'; END IF; END $qa$;
-- Privileged metadata lookup only for the audited isolated QA Edge Function.
-- No direct caller can supply owner/org proof; the Edge Function checks them.
CREATE OR REPLACE FUNCTION public.wos_qa_get_storage_object_for_proof(p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $wos$ DECLARE obj storage.objects%ROWTYPE;
BEGIN
 IF p_path IS NULL OR length(p_path)>600
    OR p_path NOT LIKE 'organizations/%/wos/production-order/%/images/%'
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='22023'; END IF;
 SELECT * INTO obj FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_path
  AND is_delete_marker=false AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_OBJECT_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
   WHERE c.storage_object_id=obj.id AND c.state='CLAIMED'
     AND c.lease_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'QA_ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('id',obj.id,'ownerId',obj.owner_id,
  'version',obj.version,'updatedAt',obj.updated_at,
  'mimeType',obj.metadata->>'mimetype','byteSize',obj.metadata->>'size');
END $wos$;
REVOKE ALL ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
 TO service_role;

COMMIT;
