\set ON_ERROR_STOP on

DO $phase2$
BEGIN
  IF CURRENT_USER <> 'supabase_storage_admin'
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname IN (
          'wos_m4_proof_owner_storage_read',
          'wos_m4_proof_verifier_storage_read'
        )
        AND policy.cmd = 'SELECT'
    ) <> 2
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_can_download_proof(text,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'M4_HOSTED_PHASE2_CHECK_FAILED';
  END IF;
END;
$phase2$;

SELECT 'WOS_M4_02_SYNTHETIC_PHASE2=PASS';

SELECT policy.polname AS policyname,
       pg_catalog.to_jsonb(policy.polroles) AS roles,
       pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) AS qual
FROM pg_catalog.pg_policy policy
WHERE policy.polname IN (
  'wos_m4_proof_owner_storage_read',
  'wos_m4_proof_verifier_storage_read'
)
ORDER BY policy.polname;
