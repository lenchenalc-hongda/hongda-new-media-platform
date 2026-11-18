-- PostgreSQL17 ONLY. Public strict verified-submit RPC must stay denied.
\set ON_ERROR_STOP on
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $direct$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_submit_first_order_verified_candidate(
    '58888888-0000-4000-8000-0000000000bb',1,
    '78888888-0000-4000-8000-0000000000bb','BYPASS COMPLETE OFFICE DOCUMENT');
  RAISE EXCEPTION 'STRICT_RAW_SUBMIT_BYPASS_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $direct$;
RESET ROLE;
DO $grants$
BEGIN
 IF has_function_privilege('authenticated',
   'public.wos_mvp_submit_first_order_verified_candidate(uuid,integer,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'wos_mvp_attestation.submit_first_order_with_storage_proof(uuid,integer,uuid,text)','EXECUTE')
 OR has_table_privilege('authenticated','wos_mvp_attestation.private_image_proofs','INSERT')
 OR has_table_privilege('authenticated','wos_mvp_qa.cpc_order_bindings','UPDATE')
 THEN RAISE EXCEPTION 'OVERLAY_UNAUTHORIZED_CAPABILITY_AVAILABLE'; END IF;
END $grants$;
-- Real QA policy expressions, not newly introduced Storage policies.
SET ROLE authenticated;
DO $old_p7$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='wos-private';
 IF n<>83 THEN RAISE EXCEPTION 'OLD_P7_SAME_ORG_PRIVATE_READ_CHANGED %',n; END IF;
END $old_p7$;
RESET ROLE;
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000003';
SET ROLE authenticated;
DO $viewer$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'VIEWER_READ_OLD_P7_PRIVATE_OBJECT'; END IF;
END $viewer$;
RESET ROLE;
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000002';
SET ROLE authenticated;
DO $foreign$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'FOREIGN_ORG_PRIVATE_OBJECT_READ'; END IF;
END $foreign$;
RESET ROLE;
SELECT 'WOS_OVERLAY_OLD_P7_RLS_AND_STRICT_SUBMIT_DENY=PASS' AS result;