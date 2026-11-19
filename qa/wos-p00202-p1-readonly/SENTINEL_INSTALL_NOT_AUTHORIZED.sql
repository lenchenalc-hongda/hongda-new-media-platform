-- WOS P1 QA ONLY: DESIGN / INDEPENDENT AUDIT, NOT AUTHORIZED TO INSTALL.
-- Never apply to Production, other Supabase projects, or an existing business role.
-- Expected managed QA project: xulmpqaknlwqqculbsek, database postgres, PG17.
-- This intentionally does NOT create a password, grant LOGIN, install a migration,
-- update Storage/RLS, send data, trigger Actions, or touch P1/P2 Gates.
BEGIN;

DO $scope$
BEGIN
  IF session_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_WRONG_ADMIN_OR_DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_PG_CRON_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'wos_p1_preflight_private') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_PRIVATE_SCHEMA_REQUIRED';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='wos_qa_readonly_preflight'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolbypassrls AND NOT rolinherit
      AND rolvaliduntil IS NULL
  ) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_QA_ROLE_NOT_SAFE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_authid WHERE rolname='wos_qa_readonly_preflight'
      AND rolpassword IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_PASSWORD_ALREADY_PRESENT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_stat_activity
             WHERE usename='wos_qa_readonly_preflight') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_PREEXISTING_SESSIONS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname='wos-p1-qa-readonly-credential-sentinel'
  ) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ALREADY_SCHEDULED';
  END IF;
END
$scope$;

-- SECURITY INVOKER means the cron job cannot gain extra privilege.
-- Only the existing QA postgres job owner may invoke it. No public EXECUTE.
CREATE FUNCTION wos_p1_preflight_private.enforce_credential_expiry()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE
  can_login boolean;
  expires_at timestamptz;
  has_password boolean;
  illegal_lease boolean;
  session_pid integer;
BEGIN
  IF session_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_INVOKER_DENIED';
  END IF;
  SELECT r.rolcanlogin, r.rolvaliduntil, (a.rolpassword IS NOT NULL)
    INTO STRICT can_login, expires_at, has_password
    FROM pg_catalog.pg_roles r
    JOIN pg_catalog.pg_authid a ON a.oid=r.oid
   WHERE r.rolname='wos_qa_readonly_preflight';

  -- A normal approved short lease may remain open. A missing, overlong,
  -- or expired lease is ALWAYS revoked, even if macOS/Actions is disconnected.
  illegal_lease :=
    (NOT can_login)
    OR has_password IS FALSE
    OR expires_at IS NULL
    OR expires_at <= clock_timestamp()
    OR expires_at > clock_timestamp() + interval '45 minutes';

  IF NOT illegal_lease THEN
    RETURN;
  END IF;

  -- The SQL command is a hardcoded constant, never derived from user input.
  -- ALTER ROLE is required to invalidate *new* connections and stored password.
  IF can_login OR has_password THEN
    EXECUTE 'ALTER ROLE wos_qa_readonly_preflight NOLOGIN PASSWORD NULL';
  END IF;

  -- Expired or forbidden sessions of THIS EXACT QA role only; do not terminate
  -- any postgres, application, Storage, production, or other user connections.
  FOR session_pid IN
    SELECT pid FROM pg_catalog.pg_stat_activity
     WHERE usename='wos_qa_readonly_preflight'
       AND pid <> pg_catalog.pg_backend_pid()
  LOOP
    BEGIN
      IF pg_catalog.pg_terminate_backend(session_pid) IS NOT TRUE THEN
        RAISE WARNING 'WOS_P1_SENTINEL_TERMINATE_DENIED';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Never roll back the prior ALTER ROLE NOLOGIN because a signal failed.
      -- Existing sessions are rechecked by the next minute's Cron run, and
      -- independent post-run attestation must still report incomplete cleanup.
      RAISE WARNING 'WOS_P1_SENTINEL_TERMINATE_FAILED';
    END;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_stat_activity
     WHERE usename='wos_qa_readonly_preflight'
       AND pid <> pg_catalog.pg_backend_pid()
  ) THEN
    -- WARNING rather than EXCEPTION: preserve the role's LOGIN/PASSWORD revoke.
    -- A live run MUST fail overall acceptance while ANY such session persists.
    RAISE WARNING 'WOS_P1_SENTINEL_SESSIONS_REMAIN';
  END IF;
END
$guard$;

REVOKE ALL ON FUNCTION wos_p1_preflight_private.enforce_credential_expiry()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION wos_p1_preflight_private.enforce_credential_expiry()
  FROM wos_qa_readonly_preflight;
GRANT EXECUTE ON FUNCTION wos_p1_preflight_private.enforce_credential_expiry()
  TO postgres;

-- Run each minute under the QA postgres role; leave ALL existing cron jobs intact.
-- If pg_cron has no worker support or role-management authority, fail closed.
SELECT cron.schedule(
  'wos-p1-qa-readonly-credential-sentinel',
  '* * * * *',
  'SELECT wos_p1_preflight_private.enforce_credential_expiry();'
);

DO $verify$
BEGIN
  IF (SELECT count(*) FROM cron.job
       WHERE jobname='wos-p1-qa-readonly-credential-sentinel'
       AND username='postgres'
       AND database='postgres'
       AND schedule='* * * * *'
       AND command='SELECT wos_p1_preflight_private.enforce_credential_expiry();'
     ) <> 1 THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_INCORRECT_SCHEDULE';
  END IF;
  IF pg_catalog.has_function_privilege(
       'wos_qa_readonly_preflight',
       'wos_p1_preflight_private.enforce_credential_expiry()','EXECUTE') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_QA_ROLE_EXECUTE_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))) priv
    WHERE n.nspname='wos_p1_preflight_private'
      AND p.proname='enforce_credential_expiry'
      AND priv.grantee=0 AND priv.privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_PUBLIC_EXECUTE_FORBIDDEN';
  END IF;
  IF NOT (SELECT NOT rolcanlogin FROM pg_roles
          WHERE rolname='wos_qa_readonly_preflight') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLE_CHANGED';
  END IF;
END
$verify$;
COMMIT;
