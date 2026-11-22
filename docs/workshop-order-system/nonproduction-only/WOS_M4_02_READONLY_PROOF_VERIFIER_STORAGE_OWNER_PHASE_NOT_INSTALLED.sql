-- WOS M4-02 PHASE 2 OF 3: STORAGE POLICY OWNER PHASE
-- INSTALL_NOT_AUTHORIZED
--
-- BLOCKED: no project-specific Supabase-supported executor has yet been
-- demonstrated for this exact transaction. Do not execute with QA postgres.
-- PostgreSQL 17 requires table ownership for CREATE POLICY; a SELECT grant
-- option is not sufficient. This file creates no function, table, role or
-- business-data change.

BEGIN;

DO $storage_phase_preflight$
DECLARE
  v_storage_owner oid;
  v_storage_owner_name text;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer
      NOT BETWEEN 170000 AND 179999
    OR pg_catalog.to_regclass('storage.objects') IS NULL
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'M4_STORAGE_PHASE_PREREQUISITE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner,
         pg_catalog.pg_get_userbyid(relation.relowner)
    INTO STRICT v_storage_owner, v_storage_owner_name
  FROM pg_catalog.pg_class relation
  WHERE relation.oid = 'storage.objects'::regclass;

  IF CURRENT_USER::regrole <> v_storage_owner
    OR v_storage_owner_name <> 'supabase_storage_admin'
  THEN
    RAISE EXCEPTION 'M4_STORAGE_POLICY_OWNER_EXECUTOR_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.has_schema_privilege(CURRENT_USER, 'public', 'USAGE')
      IS NOT TRUE
    OR pg_catalog.to_regprocedure(
      'public.wos_qa_m4_can_download_proof(text,text)'
    ) IS NULL
    OR pg_catalog.pg_get_userbyid((
      SELECT p.proowner
      FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(
        'public.wos_qa_m4_can_download_proof(text,text)'
      )
    )) <> 'wos_m4_proof_verifier_owner'
  THEN
    RAISE EXCEPTION 'M4_STORAGE_PHASE_FUNCTION_BASELINE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'wos_m4_proof_owner_storage_read',
        'wos_m4_proof_verifier_storage_read'
      )
  ) THEN
    RAISE EXCEPTION 'M4_STORAGE_PHASE_POLICY_ALREADY_EXISTS'
      USING ERRCODE = '42710';
  END IF;
END;
$storage_phase_preflight$;

CREATE POLICY wos_m4_proof_owner_storage_read
  ON storage.objects FOR SELECT TO wos_m4_proof_verifier_owner
  USING (bucket_id = 'wos-private');
COMMENT ON POLICY wos_m4_proof_owner_storage_read ON storage.objects IS
  'WOS_M4_02_PRIVATE_OWNER_STORAGE_READ_V1';

CREATE POLICY wos_m4_proof_verifier_storage_read
  ON storage.objects FOR SELECT TO authenticated
  USING (public.wos_qa_m4_can_download_proof(bucket_id, name));
COMMENT ON POLICY wos_m4_proof_verifier_storage_read ON storage.objects IS
  'WOS_M4_02_AUTHENTICATED_ORDER_PROOF_READ_V1';

DO $storage_phase_postcheck$
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'wos_m4_proof_owner_storage_read',
        'wos_m4_proof_verifier_storage_read'
      )
      AND policy.cmd = 'SELECT'
  ) <> 2 THEN
    RAISE EXCEPTION 'M4_STORAGE_PHASE_POSTCHECK_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$storage_phase_postcheck$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED: storage-owner execution is a separate Owner gate.
