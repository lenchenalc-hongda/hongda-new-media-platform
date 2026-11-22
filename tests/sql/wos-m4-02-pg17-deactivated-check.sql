\set ON_ERROR_STOP on

DO $deactivated$
BEGIN
  IF CURRENT_USER <> 'hosted_wos_installer'
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)',
      'EXECUTE'
    )
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname IN (
          'wos_p7_private_object_select',
          'wos_p7_storage_reader_roles'
        )
    ) <> 2
  THEN
    RAISE EXCEPTION 'M4_HOSTED_DEACTIVATED_CHECK_FAILED';
  END IF;
END;
$deactivated$;

SELECT 'WOS_M4_02_SYNTHETIC_DEACTIVATED=PASS';
