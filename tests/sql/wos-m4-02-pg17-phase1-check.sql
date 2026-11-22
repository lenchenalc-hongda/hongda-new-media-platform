\set ON_ERROR_STOP on

DO $phase1$
BEGIN
  IF CURRENT_USER <> 'hosted_wos_installer'
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_current_user_id()'
    ) IS NULL
    OR pg_catalog.has_schema_privilege(
      'wos_m4_proof_verifier_owner',
      'public',
      'CREATE'
    )
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
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_m4_current_user_id()',
      'EXECUTE'
    )
    OR pg_catalog.pg_has_role(
      CURRENT_USER,
      'wos_m4_proof_verifier_owner',
      'SET'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname LIKE 'wos_m4_%'
    )
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_auth_members membership
      WHERE membership.member = CURRENT_USER::regrole
        AND membership.roleid =
          'wos_m4_proof_verifier_owner'::regrole
        AND membership.admin_option IS TRUE
        AND membership.inherit_option IS FALSE
        AND membership.set_option IS FALSE
    ) <> 1
  THEN
    RAISE EXCEPTION 'M4_HOSTED_PHASE1_CHECK_FAILED';
  END IF;
END;
$phase1$;

SELECT 'WOS_M4_02_SYNTHETIC_PHASE1=PASS';
