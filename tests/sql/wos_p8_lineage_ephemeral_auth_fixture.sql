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
-- Synthetic Supabase Storage metadata ONLY, no real file service or binary.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
 id text PRIMARY KEY,
 name text NOT NULL,
 public boolean NOT NULL DEFAULT false,
 file_size_limit bigint,
 allowed_mime_types text[]
);
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text NOT NULL REFERENCES storage.buckets(id),
 name text NOT NULL,
 owner_id text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(path text) RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT string_to_array(regexp_replace(path,'/[^/]+$',''),'/') $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT ON storage.objects TO authenticated;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;

-- Match Supabase: extension functions live in extensions, not public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SELECT 'WOS_P8_LOCAL_AUTH_CONTRACT_FIXTURE_ONLY=PASS' AS check_name;
