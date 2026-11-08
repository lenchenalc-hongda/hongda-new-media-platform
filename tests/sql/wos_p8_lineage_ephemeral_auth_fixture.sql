-- WOS P8 line-of-history rehearsal -- disposable PostgreSQL 17 ONLY.
-- Mimics Supabase auth function signatures without any user rows or secrets.
DO $safety$
BEGIN
  IF current_database() <> 'wos_p8_lineage_ci' THEN
    RAISE EXCEPTION 'WOS_P8_LINEAGE_DISPOSABLE_DATABASE_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('spatial_ref_sys')
  ) THEN
    RAISE EXCEPTION 'WOS_P8_LINEAGE_EXPECTS_EMPTY_PUBLIC_SCHEMA';
  END IF;
END $safety$;

DO $roles$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $roles$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT '{}'::jsonb
$$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT 'WOS_P8_LOCAL_AUTH_CONTRACT_FIXTURE_ONLY=PASS' AS check_name;
