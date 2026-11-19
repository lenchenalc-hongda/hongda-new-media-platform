-- WOS P1 QA-only isolated proof role rollback DESIGN, NOT AUTHORIZED.
-- Target project must first be verified as xulmpqaknlwqqculbsek.
-- Never run against Production; never terminate other database sessions.
BEGIN;
DO $guard$
BEGIN
 IF session_user <> 'postgres' OR current_database() <> 'postgres' THEN
   RAISE EXCEPTION 'WOS_QA_POSTGRES_OWNER_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wos_qa_readonly_preflight')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
                   WHERE nspname='wos_p1_preflight_private') THEN
   RAISE EXCEPTION 'WOS_QA_PREFLIGHT_NOT_INSTALLED' USING ERRCODE='55000';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity
            WHERE usename='wos_qa_readonly_preflight' AND pid <> pg_catalog.pg_backend_pid()) THEN
   RAISE EXCEPTION 'WOS_QA_PREFLIGHT_LIVE_SESSION_REVOKE_FIRST' USING ERRCODE='55006';
 END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='wos_p1_preflight_private') <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='wos_p1_preflight_private'
         AND p.proname='readonly_snapshot'
         AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
         AND pg_catalog.pg_get_userbyid(p.proowner)='postgres') THEN
   RAISE EXCEPTION 'WOS_QA_PREFLIGHT_UNKNOWN_SCHEMA_OBJECTS' USING ERRCODE='55000';
 END IF;
END
$guard$;

-- Does not kill active sessions. Abort above and require separate Owner action.
ALTER ROLE wos_qa_readonly_preflight NOLOGIN PASSWORD NULL;
REVOKE EXECUTE ON FUNCTION wos_p1_preflight_private.readonly_snapshot()
  FROM wos_qa_readonly_preflight;
REVOKE USAGE ON SCHEMA wos_p1_preflight_private FROM wos_qa_readonly_preflight;
DROP FUNCTION wos_p1_preflight_private.readonly_snapshot();
DROP SCHEMA wos_p1_preflight_private RESTRICT;
DROP ROLE wos_qa_readonly_preflight;
COMMIT;

-- Afterwards verify that role, schema and function are absent.
-- Never touch existing RLS/Storage policies or historical orders.
