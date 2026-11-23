\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 only. Restores the explicit public-schema and
-- default ACL metadata present in Production but absent from migration replay.
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_p8_replay_ci'
    OR (SELECT count(*) FROM auth.users) <> 0
    OR (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE') <> 67
  THEN
    RAISE EXCEPTION 'WOS_P8_HISTORICAL_ACL_COMPENSATION_GUARD_FAILED';
  END IF;
END;
$guard$;

SET LOCAL ROLE pg_database_owner;
GRANT USAGE ON SCHEMA public
  TO postgres, anon, authenticated, service_role;
RESET ROLE;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLES
  TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.auth_user_id()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.organizations_protect_immutable()
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at()
  TO anon, authenticated;

COMMIT;

SELECT 'WOS_P8_HISTORICAL_ACL_COMPENSATION=PASS' AS check_name;
