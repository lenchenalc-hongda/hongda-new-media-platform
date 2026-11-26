-- Ephemeral PostgreSQL 17 fixture only. All identities and records are synthetic.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  ALTER ROLE service_role BYPASSRLS;
END $$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.role()
 TO authenticated,anon,service_role;
CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN array_length(parts,1)>1 THEN parts[1:array_length(parts,1)-1]
    ELSE ARRAY[]::text[]
  END
  FROM (SELECT string_to_array(name,'/') AS parts) parsed
$$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.wos_production_orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_number text NOT NULL,
  workflow_status text NOT NULL,
  version integer NOT NULL,
  version_label text NOT NULL,
  customer_id uuid,
  customer_name_snapshot text NOT NULL,
  product_name text NOT NULL,
  product_material text NOT NULL,
  surface_treatment text,
  pattern_scope text,
  seam_tolerance text,
  position_reference text,
  customer_acceptance_standard text,
  packaging_method text,
  carton_quantity integer,
  label_marking_rule text,
  requested_quantity integer NOT NULL,
  current_batch_quantity integer NOT NULL,
  created_by_profile_id uuid NOT NULL DEFAULT '11111111-1111-4111-8111-111111111111',
  sales_owner_profile_id uuid NOT NULL DEFAULT '11111111-1111-4111-8111-111111111111',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_resource_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  resource_type text NOT NULL,
  status text NOT NULL,
  expected_at timestamptz,
  arrived_at timestamptz,
  quantity_expected integer,
  quantity_arrived integer,
  version_label text,
  confirmed_by_profile_id uuid,
  confirmed_at timestamptz,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type,entity_id,resource_type)
);
CREATE TABLE public.wos_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  actor_profile_id uuid NOT NULL,
  actor_role text NOT NULL,
  reason_code text NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_submission_receipts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  source_revision integer NOT NULL,
  source_version_label text NOT NULL
);
CREATE TABLE public.wos_workshop_inbox (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  source_revision integer NOT NULL,
  source_version_label text NOT NULL,
  workflow_status text NOT NULL CHECK (workflow_status='SUBMITTED')
);
CREATE TABLE public.wos_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  confirmation_type text NOT NULL,
  decision text NOT NULL,
  profile_id uuid NOT NULL,
  role_snapshot text NOT NULL,
  note text,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  blocker_code text NOT NULL,
  blocker_category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL,
  opened_by_profile_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_by_profile_id uuid,
  resolved_at timestamptz,
  resolution_note text
);
CREATE TABLE public.wos_reference_images (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  category text NOT NULL,
  version_label text NOT NULL,
  image_status text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL DEFAULT 'qa-preview-proof.png',
  mime_type text NOT NULL DEFAULT 'image/png',
  file_size bigint NOT NULL DEFAULT 100,
  supersedes_image_id uuid,
  superseded_at timestamptz,
  uploaded_by_profile_id uuid NOT NULL DEFAULT '11111111-1111-4111-8111-111111111111',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_visual_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  version_label text NOT NULL,
  status text NOT NULL,
  confirmed_by_office_profile_id uuid,
  confirmed_by_workshop_profile_id uuid,
  office_confirmed_at timestamptz,
  workshop_confirmed_at timestamptz,
  superseded_at timestamptz
);
CREATE TABLE public.wos_visual_baseline_items (
  baseline_id uuid NOT NULL,
  reference_image_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true
);
CREATE TABLE public.wos_verified_image_proofs (
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_object_version text NOT NULL,
  storage_object_updated_at timestamptz NOT NULL,
  actor_user_id uuid NOT NULL DEFAULT '10101010-1010-4010-8010-101010101010',
  verified_sha256 text NOT NULL,
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  updated_at timestamptz NOT NULL,
  owner_id text,
  metadata jsonb NOT NULL DEFAULT '{"mimetype":"image/png","size":"100"}'::jsonb,
  archived_at timestamptz,
  is_delete_marker boolean NOT NULL DEFAULT false
);
CREATE TABLE public.wos_qa_orphan_cleanup_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  storage_object_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'RELEASED',
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public,storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT SELECT ON storage.objects TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.wos_verified_image_proofs TO service_role;
GRANT SELECT ON public.profiles,public.wos_production_orders TO service_role;
GRANT SELECT ON public.profiles,public.wos_production_orders,public.wos_reference_images,
  public.wos_visual_baselines,public.wos_visual_baseline_items,
  public.wos_verified_image_proofs,public.wos_resource_readiness,
  storage.objects TO authenticated;

INSERT INTO public.organizations(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
  ('11111111-1111-4111-8111-111111111111','10101010-1010-4010-8010-101010101010','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','sales',true),
  ('22222222-2222-4222-8222-222222222222','20202020-2020-4020-8020-202020202020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator',true),
  ('33333333-3333-4333-8333-333333333333','30303030-3030-4030-8030-303030303030','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator',true),
  ('44444444-4444-4444-8444-444444444444','40404040-4040-4040-8040-404040404040','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer',true),
  ('55555555-5555-4555-8555-555555555555','50505050-5050-4050-8050-505050505050','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','sales',true),
  ('88888888-8888-4888-8888-888888888888','80808080-8080-4080-8080-808080808080','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager',true);
INSERT INTO public.wos_production_orders(
  id,organization_id,order_number,workflow_status,version,version_label,
  customer_id,customer_name_snapshot,product_name,product_material,
  surface_treatment,pattern_scope,seam_tolerance,position_reference,
  customer_acceptance_standard,packaging_method,carton_quantity,
  label_marking_rule,requested_quantity,current_batch_quantity
) VALUES(
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','WOS-PRODUCTION-M2-001',
  'WAITING_MATERIAL',7,'V1',NULL,'WOS M2 CUSTOMER','WOS M2 PRODUCT',
  'WOS M2 MATERIAL','WOS M2 SURFACE','FULL','1mm','15mm QA reference',
  'WOS M2 acceptance','WOS M2 packaging',50,'WOS M2 label',100,100
);
INSERT INTO public.wos_submission_receipts(
  id,organization_id,order_id,source_revision,source_version_label)
VALUES(
  '61111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333',1,'V1');
INSERT INTO public.wos_workshop_inbox(
  id,organization_id,order_id,submission_id,source_revision,
  source_version_label,workflow_status)
VALUES(
  '62222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333',
  '61111111-1111-4111-8111-111111111111',1,'V1','SUBMITTED');

INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path
) VALUES
  ('41111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER','33333333-3333-4333-8333-333333333333','PRODUCT','V1','READY','wos-private','organizations/qa/product.png'),
  ('42222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER','33333333-3333-4333-8333-333333333333','FILM_PATTERN','V1','READY','wos-private','organizations/qa/film.png'),
  ('43333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER','33333333-3333-4333-8333-333333333333','SIGNED_SAMPLE','V1','READY','wos-private','organizations/qa/signed.png'),
  ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER','33333333-3333-4333-8333-333333333333','CUSTOMER_APPROVED_SAMPLE','V1','READY','wos-private','organizations/qa/customer.png');

INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,is_delete_marker)
VALUES
  ('51111111-1111-4111-8111-111111111111','wos-private','organizations/qa/product.png','v1',now(),'10101010-1010-4010-8010-101010101010',false),
  ('52222222-2222-4222-8222-222222222222','wos-private','organizations/qa/film.png','v1',now(),'10101010-1010-4010-8010-101010101010',false),
  ('53333333-3333-4333-8333-333333333333','wos-private','organizations/qa/signed.png','v1',now(),'10101010-1010-4010-8010-101010101010',false),
  ('54444444-4444-4444-8444-444444444444','wos-private','organizations/qa/customer.png','v1',now(),'10101010-1010-4010-8010-101010101010',false);

INSERT INTO public.wos_verified_image_proofs(
  image_id,organization_id,order_id,storage_bucket,storage_path,
  storage_object_id,storage_object_version,storage_object_updated_at,
  actor_user_id,verified_sha256,verified_at,expires_at
)
SELECT im.id,im.organization_id,im.entity_id,im.storage_bucket,im.storage_path,
  ob.id,ob.version,ob.updated_at,
  '10101010-1010-4010-8010-101010101010',
  encode(sha256(convert_to(im.id::text,'UTF8')),'hex'),
  now()-interval '1 minute',now()+interval '1 hour'
FROM public.wos_reference_images im
JOIN storage.objects ob ON ob.name=im.storage_path;
