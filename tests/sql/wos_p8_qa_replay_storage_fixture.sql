-- Disposable PostgreSQL 17 only. Lightweight Storage API metadata emulator.
-- This synthetic fixture NEVER downloads, stores, or deletes real binaries.
DO $guard$ BEGIN
  IF current_database()<>'wos_p8_ci' OR to_regclass('public.wos_production_orders') IS NULL
  THEN RAISE EXCEPTION 'WOS_P8_EPHEMERAL_REQUIRED'; END IF;
END $guard$;

CREATE TABLE public.organizations (id uuid PRIMARY KEY);
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
 name text NOT NULL UNIQUE,
 owner_id text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 version text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 is_delete_marker boolean NOT NULL DEFAULT false,
 archived_at timestamptz
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
CREATE FUNCTION storage.foldername(path text) RETURNS text[]
 LANGUAGE sql IMMUTABLE STRICT AS $$
   SELECT string_to_array(regexp_replace(path,'/[^/]+$',''),'/')
 $$;
CREATE FUNCTION storage.filename(path text) RETURNS text
 LANGUAGE sql IMMUTABLE STRICT AS $$
   SELECT (string_to_array(path,'/'))[
     array_length(string_to_array(path,'/'),1)]
 $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
GRANT EXECUTE ON FUNCTION storage.filename(text) TO authenticated;
CREATE ROLE service_role NOLOGIN;

INSERT INTO public.organizations(id) VALUES
 ('aaaaaaaa-1111-1111-1111-111111111111'),
 ('bbbbbbbb-2222-2222-2222-222222222222');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111','admin',true),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','aaaaaaaa-1111-1111-1111-111111111111','viewer',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','bbbbbbbb-2222-2222-2222-222222222222','admin',true),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','44444444-4444-4444-4444-444444444444','aaaaaaaa-1111-1111-1111-111111111111','operator',true);
INSERT INTO public.wos_production_orders (
  id,organization_id,customer_name_snapshot,order_number,product_name,
  sales_owner_profile_id,project_owner_profile_id,priority,version_label,
  requested_quantity,current_batch_quantity,product_material,created_by_profile_id
) VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'aaaaaaaa-1111-1111-1111-111111111111',
  'P8 SYNTHETIC','QA-NONPROD-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Synthetic Print',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'LOW','V1',10,10,'SYNTHETIC','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('wos-private','wos-private',false,20971520,ARRAY['image/png','image/jpeg','image/webp']::text[]);
INSERT INTO storage.objects (
 id,bucket_id,name,owner_id,metadata,version
) VALUES (
 'ffffffff-ffff-ffff-ffff-ffffffffffff',
 'wos-private',
 'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/qa-preview-proof.png',
 '11111111-1111-1111-1111-111111111111',
 '{"mimetype":"image/png","size":"96"}'::jsonb,
 'fixture-v1'
);
