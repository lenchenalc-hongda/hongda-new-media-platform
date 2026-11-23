-- WOS P1 QA ONLY: reviewed rollback design, NOT AUTHORIZED to execute.
-- Do NOT roll back existing WOS proof role/schema/function, RLS, Storage or
-- unrelated cron jobs. Stop only this isolated sentinel and its invoker function.
BEGIN;
DO $rollback$
DECLARE
  target_jobid bigint;
  removed boolean;
BEGIN
  IF session_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_WRONG_ADMIN_OR_DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles
                 WHERE rolname='wos_qa_readonly_preflight'
                   AND NOT rolcanlogin) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_LOGIN_NOT_OFF';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_authid
               WHERE rolname='wos_qa_readonly_preflight'
                 AND rolpassword IS NOT NULL) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_PASSWORD_STILL_SET';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_stat_activity
             WHERE usename='wos_qa_readonly_preflight') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_ACTIVE_SESSIONS';
  END IF;
  SELECT jobid INTO STRICT target_jobid
    FROM cron.job
   WHERE jobname='wos-p1-qa-readonly-credential-sentinel'
     AND username='postgres'
     AND database='postgres'
     AND schedule='* * * * *'
     AND command='SELECT wos_p1_preflight_private.enforce_credential_expiry();';
  SELECT cron.unschedule(target_jobid) INTO removed;
  IF removed IS NOT TRUE THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_UNSCHEDULE_FAILED';
  END IF;
END
$rollback$;

DROP FUNCTION wos_p1_preflight_private.enforce_credential_expiry() RESTRICT;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job
    WHERE jobname='wos-p1-qa-readonly-credential-sentinel') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_JOB_PERSISTS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
             WHERE n.nspname='wos_p1_preflight_private'
               AND p.proname='enforce_credential_expiry') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_FUNCTION_PERSISTS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
                 WHERE n.nspname='wos_p1_preflight_private'
                   AND p.proname='readonly_snapshot') THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_HISTORIC_PROOF_REMOVED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles
                 WHERE rolname='wos_qa_readonly_preflight'
                   AND NOT rolcanlogin) THEN
    RAISE EXCEPTION 'WOS_P1_SENTINEL_ROLLBACK_ROLE_CHANGED';
  END IF;
END
$verify$;
COMMIT;
