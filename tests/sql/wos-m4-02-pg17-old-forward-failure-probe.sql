\set ON_ERROR_STOP on

BEGIN;

SELECT tests.wos_m4_hosted_expect_error(
  $sql$
    CREATE POLICY hosted_old_storage_policy_probe
      ON storage.objects FOR SELECT TO authenticated USING (true)
  $sql$,
  '42501'
);

CREATE ROLE hosted_old_owner_probe NOLOGIN;
CREATE FUNCTION public.hosted_old_owner_probe_function()
RETURNS integer
LANGUAGE sql
AS 'SELECT 1';

SELECT tests.wos_m4_hosted_expect_error(
  $sql$
    ALTER FUNCTION public.hosted_old_owner_probe_function()
      OWNER TO hosted_old_owner_probe
  $sql$,
  '42501'
);
CREATE TEMP TABLE auth_uid_acl_before ON COMMIT DROP AS
SELECT COALESCE(procedure.proacl::text, 'NULL') AS acl
FROM pg_catalog.pg_proc procedure
WHERE procedure.oid = 'auth.uid()'::regprocedure;

GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

DO $auth_uid_acl_unchanged$
DECLARE
  v_after text;
BEGIN
  SELECT COALESCE(procedure.proacl::text, 'NULL')
    INTO STRICT v_after
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid = 'auth.uid()'::regprocedure;
  IF v_after IS DISTINCT FROM (
    SELECT acl FROM auth_uid_acl_before
  ) THEN
    RAISE EXCEPTION 'M4_OLD_AUTH_UID_GRANT_CHANGED_ACL';
  END IF;
END;
$auth_uid_acl_unchanged$;

ROLLBACK;

DO $probe_cleanup$
BEGIN
  IF pg_catalog.to_regrole('hosted_old_owner_probe') IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'public.hosted_old_owner_probe_function()'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies policy
      WHERE policy.policyname = 'hosted_old_storage_policy_probe'
    )
  THEN
    RAISE EXCEPTION 'M4_OLD_FORWARD_PROBE_LEFT_PARTIAL_STATE';
  END IF;
END;
$probe_cleanup$;

SELECT 'WOS_M4_02_OLD_FORWARD_HOSTED_FAILURE=PASS';
