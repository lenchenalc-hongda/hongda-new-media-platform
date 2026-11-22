\set ON_ERROR_STOP on

DO $storage_rolled_back$
BEGIN
  IF CURRENT_USER <> 'supabase_storage_admin'
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname LIKE 'wos_m4_%'
    )
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'M4_HOSTED_STORAGE_ROLLBACK_CHECK_FAILED';
  END IF;
END;
$storage_rolled_back$;

SELECT 'WOS_M4_02_SYNTHETIC_STORAGE_ROLLBACK=PASS';
