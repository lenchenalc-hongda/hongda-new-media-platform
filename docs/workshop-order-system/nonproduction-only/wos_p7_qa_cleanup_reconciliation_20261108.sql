-- QA-only: recover uncertain Storage API cleanup results after a lease expires.
-- This touches ONLY private cleanup claims; it never SQL-deletes Storage bytes.
BEGIN;
DO $qa$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.wos_production_orders
 WHERE order_number LIKE 'QA-NONPROD-%') THEN RAISE EXCEPTION 'QA_REQUIRED'; END IF; END $qa$;
CREATE OR REPLACE FUNCTION public.wos_qa_reconcile_expired_cleanup_claims(
 p_organization_id uuid,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE rec public.wos_qa_orphan_cleanup_claims%ROWTYPE;
 v_missing integer:=0;v_present integer:=0;
BEGIN
 IF p_organization_id IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>100
 THEN RAISE EXCEPTION 'INVALID_RECONCILIATION_INPUT' USING ERRCODE='22023';END IF;
 FOR rec IN
  SELECT * FROM public.wos_qa_orphan_cleanup_claims
  WHERE organization_id=p_organization_id AND state='CLAIMED'
    AND lease_expires_at<clock_timestamp()-interval '5 minutes'
  ORDER BY lease_expires_at ASC
  LIMIT p_limit FOR UPDATE SKIP LOCKED
 LOOP
  IF NOT EXISTS(SELECT 1 FROM storage.objects so
       WHERE so.id=rec.storage_object_id AND so.name=rec.storage_path
         AND so.bucket_id='wos-private') THEN
   UPDATE public.wos_qa_orphan_cleanup_claims SET
    state='REMOVED',finished_at=clock_timestamp(),
    last_result='RECONCILED_METADATA_ABSENT_AFTER_LEASE'
    WHERE storage_object_id=rec.storage_object_id AND claim_token=rec.claim_token;
   v_missing:=v_missing+1;
  ELSE
   UPDATE public.wos_qa_orphan_cleanup_claims SET
    state='RELEASED',finished_at=clock_timestamp(),
    last_result='RECONCILED_METADATA_PRESENT_AFTER_LEASE'
    WHERE storage_object_id=rec.storage_object_id AND claim_token=rec.claim_token;
   v_present:=v_present+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('status','RECONCILED','metadataAbsent',v_missing,
   'metadataStillPresent',v_present);
END $fn$;
REVOKE ALL ON FUNCTION public.wos_qa_reconcile_expired_cleanup_claims(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_reconcile_expired_cleanup_claims(uuid,integer)
 TO service_role;
COMMIT;
