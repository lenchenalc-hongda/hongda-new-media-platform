-- WOS M4-02 ROLLBACK STEP 2: STORAGE POLICY OWNER ROLLBACK
-- INSTALL_NOT_AUTHORIZED
--
-- Execute only after the authenticated EXECUTE grants have been removed by
-- the deactivation phase. This file drops only the two M4 Storage policies.

BEGIN;

DO $storage_rollback_preflight$
DECLARE
  v_storage_owner oid;
  v_storage_owner_name text;
BEGIN
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

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'wos_m4_proof_owner_storage_read',
        'wos_m4_proof_verifier_storage_read'
      )
  ) NOT IN (0, 2) THEN
    RAISE EXCEPTION 'M4_STORAGE_ROLLBACK_POLICY_STATE_PARTIAL'
      USING ERRCODE = '55000';
  END IF;
END;
$storage_rollback_preflight$;

DROP POLICY IF EXISTS wos_m4_proof_owner_storage_read
  ON storage.objects;
DROP POLICY IF EXISTS wos_m4_proof_verifier_storage_read
  ON storage.objects;

DO $storage_rollback_postcheck$
BEGIN
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
    RAISE EXCEPTION 'M4_STORAGE_ROLLBACK_POSTCHECK_FAILED'
      USING ERRCODE = '55000';
  END IF;
END;
$storage_rollback_postcheck$;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
