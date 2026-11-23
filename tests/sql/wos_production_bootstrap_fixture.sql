-- Disposable PostgreSQL 17 only. Emulates the Supabase-managed schemas that
-- the Production public schema bootstrap expects. No users, passwords,
-- Storage binaries or Production data are created.
DO $guard$
BEGIN
  IF current_database() NOT IN ('wos_prod_bootstrap_ci', 'wos_p8_replay_ci') THEN
    RAISE EXCEPTION 'WOS_PRODUCTION_BOOTSTRAP_DISPOSABLE_DATABASE_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION 'WOS_PRODUCTION_BOOTSTRAP_EXPECTS_EMPTY_PUBLIC_SCHEMA';
  END IF;
END;
$guard$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN NOINHERIT;
  END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;
CREATE FUNCTION auth.role() RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  )
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner text,
  owner_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version text,
  archived_at timestamptz,
  is_delete_marker boolean NOT NULL DEFAULT false,
  UNIQUE (bucket_id, name)
);
CREATE FUNCTION storage.foldername(object_name text) RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN array_length(string_to_array(object_name, '/'), 1) > 1
      THEN (string_to_array(object_name, '/'))[
        1:array_length(string_to_array(object_name, '/'), 1) - 1
      ]
    ELSE ARRAY[]::text[]
  END
$$;
CREATE FUNCTION storage.filename(object_name text) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (string_to_array(object_name, '/'))[
    array_length(string_to_array(object_name, '/'), 1)
  ]
$$;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON storage.objects TO authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

SELECT 'WOS_PRODUCTION_BOOTSTRAP_SYNTHETIC_SUPABASE_FIXTURE=PASS' AS check_name;
