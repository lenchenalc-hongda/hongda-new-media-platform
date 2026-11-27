-- WOS V1 QA-only Storage compatibility rollback.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- Drops only the two UAT compatibility policies/functions, restores the exact
-- reviewed source policies, and verifies that non-WOS policies are unchanged.

BEGIN;

DO $guard$
BEGIN
  IF current_setting(
    'wos_v1.qa_storage_compat_rollback_authorized',
    true
  ) IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_STORAGE_COMPAT_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_PROJECT_MISMATCH';
  END IF;
  IF to_regnamespace('wos_v1_qa_storage_compat') IS NULL
    OR to_regclass(
      'wos_v1_qa_storage_compat.policy_backup'
    ) IS NULL
    OR to_regclass(
      'wos_v1_qa_storage_compat.install_state'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_COMPAT_NOT_INSTALLED';
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_qa_storage_compat.policy_backup
  ) <> 4
    OR EXISTS (
      SELECT 1
      FROM wos_v1_qa_storage_compat.policy_backup backup
      WHERE backup.roles IS DISTINCT FROM
          ARRAY['authenticated']::name[]
        OR backup.command NOT IN ('SELECT', 'INSERT')
        OR backup.permissive NOT IN ('PERMISSIVE', 'RESTRICTIVE')
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_POLICY_BACKUP_INVALID';
  END IF;
  IF (
    SELECT array_agg(policy.policyname ORDER BY policy.policyname)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
  ) IS DISTINCT FROM ARRAY[
    'wos_qa_uat_private_insert',
    'wos_qa_uat_private_insert_guard',
    'wos_qa_uat_private_select',
    'wos_qa_uat_private_select_guard'
  ]::name[] THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_STORAGE_ACTIVE_POLICY_SET_MISMATCH';
  END IF;
  IF to_regprocedure(
      'public.wos_v1_qa_storage_write_allowed(uuid,text,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_qa_storage_read_allowed(uuid,text,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_FUNCTION_MISSING';
  END IF;
END;
$guard$;

DROP POLICY wos_qa_uat_private_insert ON storage.objects;
DROP POLICY wos_qa_uat_private_insert_guard ON storage.objects;
DROP POLICY wos_qa_uat_private_select ON storage.objects;
DROP POLICY wos_qa_uat_private_select_guard ON storage.objects;

DROP FUNCTION public.wos_v1_qa_storage_write_allowed(
  uuid,text,text,text
);
DROP FUNCTION public.wos_v1_qa_storage_read_allowed(
  uuid,text,text
);

DO $restore_policies$
DECLARE
  backup record;
BEGIN
  FOR backup IN
    SELECT policy.*
    FROM wos_v1_qa_storage_compat.policy_backup policy
    ORDER BY policy.backup_order
  LOOP
    IF backup.command = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects AS %s '
        'FOR INSERT TO authenticated WITH CHECK (%s)',
        backup.policy_name,
        backup.permissive,
        backup.with_check
      );
    ELSIF backup.command = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects AS %s '
        'FOR SELECT TO authenticated USING (%s)',
        backup.policy_name,
        backup.permissive,
        backup.qual
      );
    ELSE
      RAISE EXCEPTION
        'WOS_V1_QA_UAT_STORAGE_ROLLBACK_COMMAND_UNSUPPORTED';
    END IF;
  END LOOP;
END;
$restore_policies$;

DO $postcheck$
DECLARE
  v_state wos_v1_qa_storage_compat.install_state%ROWTYPE;
  v_restored_fingerprint text;
  v_non_wos_fingerprint text;
BEGIN
  SELECT state.* INTO v_state
  FROM wos_v1_qa_storage_compat.install_state state
  WHERE state.singleton = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_INSTALL_STATE_MISSING';
  END IF;
  SELECT md5(jsonb_build_object(
    'wosPolicies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname LIKE 'wos\_%' ESCAPE '\'
    ),
    'nonWosPolicies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname NOT LIKE 'wos\_%' ESCAPE '\'
    )
  )::text) INTO v_restored_fingerprint;
  SELECT md5(jsonb_build_object(
    'nonWosPolicies',(
      SELECT jsonb_agg(jsonb_build_object(
        'name',policy.policyname,
        'permissive',policy.permissive,
        'roles',policy.roles::text[],
        'command',policy.cmd,
        'qual',policy.qual,
        'withCheck',policy.with_check
      ) ORDER BY policy.policyname)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname NOT LIKE 'wos\_%' ESCAPE '\'
    )
  )::text) INTO v_non_wos_fingerprint;
  IF v_restored_fingerprint IS DISTINCT FROM
      v_state.source_policy_fingerprint
    OR v_non_wos_fingerprint IS DISTINCT FROM
      v_state.non_wos_policy_fingerprint
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_STORAGE_ROLLBACK_FINGERPRINT_MISMATCH';
  END IF;
END;
$postcheck$;

UPDATE storage.buckets
SET public = state.bucket_public,
    file_size_limit = state.bucket_file_size_limit,
    allowed_mime_types = state.bucket_allowed_mime_types
FROM wos_v1_qa_storage_compat.install_state state
WHERE storage.buckets.id = 'wos-private'
  AND state.singleton = true;

DO $bucket_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets bucket
    JOIN wos_v1_qa_storage_compat.install_state state
      ON state.singleton = true
    WHERE bucket.id = 'wos-private'
      AND bucket.public = state.bucket_public
      AND bucket.file_size_limit = state.bucket_file_size_limit
      AND bucket.allowed_mime_types
        IS NOT DISTINCT FROM state.bucket_allowed_mime_types
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_STORAGE_BUCKET_ROLLBACK_MISMATCH';
  END IF;
END;
$bucket_check$;

DROP TABLE wos_v1_qa_storage_compat.policy_backup;
DROP TABLE wos_v1_qa_storage_compat.install_state;
DROP SCHEMA wos_v1_qa_storage_compat;

COMMIT;

-- NOT_AUTHORIZED
