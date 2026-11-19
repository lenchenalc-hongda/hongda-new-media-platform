-- Minimal Supabase-managed Storage metadata SHAPE for isolated PG17 only.
-- Real bytes and Storage API behavior are not simulated by this table.
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END $roles$;
CREATE SCHEMA storage;
CREATE TABLE storage.objects(
 id uuid PRIMARY KEY,
 bucket_id text NOT NULL,
 name text NOT NULL,
 owner_id text,
 version text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 is_delete_marker boolean NOT NULL DEFAULT false,
 archived_at timestamptz,
 UNIQUE(bucket_id,name)
);
CREATE INDEX wos_synthetic_storage_object_idx ON storage.objects(bucket_id,name);
GRANT USAGE ON SCHEMA storage TO authenticated;
