-- Disposable PostgreSQL 17 only. This is NOT a real Supabase Auth/Storage stack.
-- The replay runner refuses to apply this file outside wos_p8_replay_ci.
DO $guard$ BEGIN
 IF current_database() <> 'wos_p8_replay_ci' THEN
   RAISE EXCEPTION 'WOS_P8_CI_ONLY_DATABASE_REQUIRED';
 END IF;
END $guard$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text UNIQUE, created_at timestamptz DEFAULT now());
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
 AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),'anon') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
 AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
 id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
 file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now()
);
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text NOT NULL REFERENCES storage.buckets(id),
 name text NOT NULL, owner text, owner_id text,
 metadata jsonb DEFAULT '{}'::jsonb,
 created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now(),
 version text, UNIQUE(bucket_id,name)
);
CREATE OR REPLACE FUNCTION storage.foldername(object_name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN array_length(string_to_array(object_name,'/'),1)>1
  THEN (string_to_array(object_name,'/'))[1:array_length(string_to_array(object_name,'/'),1)-1]
  ELSE ARRAY[]::text[] END
$$;
CREATE OR REPLACE FUNCTION storage.filename(object_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT (string_to_array(object_name,'/'))[array_length(string_to_array(object_name,'/'),1)]
$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated,service_role;
GRANT SELECT ON storage.buckets TO anon,authenticated,service_role;
