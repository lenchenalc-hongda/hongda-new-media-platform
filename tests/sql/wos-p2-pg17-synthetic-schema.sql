-- EPHEMERAL GitHub-hosted PG17 ONLY. All IDs and rows are synthetic.
-- This file is never run against a Supabase project.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;

CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE,
 org_id uuid NOT NULL REFERENCES public.organizations(id),
 role text NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.wos_production_orders (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL,
 order_number text NOT NULL, workflow_status text NOT NULL,
 version integer NOT NULL, version_label text NOT NULL,
 current_batch_quantity integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 requested_quantity integer NOT NULL DEFAULT 200,
 product_name text NOT NULL DEFAULT 'QA synthetic product',
 product_material text NOT NULL DEFAULT 'QA synthetic plastic',
 customer_acceptance_standard text,
 position_reference text,
 created_by_profile_id uuid NOT NULL DEFAULT '50505050-5050-4050-8050-505050505050'
);
CREATE TABLE public.wos_submission_receipts (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,order_id uuid NOT NULL,
 source_revision integer NOT NULL,source_version_label text NOT NULL
);
CREATE TABLE public.wos_workshop_inbox (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,order_id uuid NOT NULL,
 submission_id uuid NOT NULL,source_revision integer NOT NULL,
 source_version_label text NOT NULL,workflow_status text NOT NULL
 CHECK (workflow_status='SUBMITTED')
);
CREATE TABLE public.wos_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,
 confirmation_type text NOT NULL,decision text NOT NULL,profile_id uuid NOT NULL,
 role_snapshot text NOT NULL,note text,confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_blockers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,
 blocker_code text NOT NULL,blocker_category text NOT NULL,description text NOT NULL,
 status text NOT NULL,opened_by_profile_id uuid NOT NULL,
 opened_at timestamptz NOT NULL DEFAULT now(),
 resolved_by_profile_id uuid,
 resolved_at timestamptz,
 resolution_note text
);
CREATE TABLE public.wos_resource_readiness (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,
 resource_type text NOT NULL,status text NOT NULL,
 quantity_expected integer,quantity_arrived integer,version_label text,
 confirmed_by_profile_id uuid,confirmed_at timestamptz,note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (entity_type,entity_id,resource_type)
);
CREATE TABLE public.wos_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,
 previous_status text,next_status text NOT NULL,actor_profile_id uuid NOT NULL,
 actor_role text NOT NULL,reason_code text NOT NULL,note text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_reference_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,
 entity_type text NOT NULL,entity_id uuid NOT NULL,
 category text NOT NULL,version_label text NOT NULL,image_status text NOT NULL,
 storage_bucket text NOT NULL
);
CREATE TABLE public.wos_visual_baselines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,
 entity_type text NOT NULL,entity_id uuid NOT NULL,
 version_label text NOT NULL,status text NOT NULL,
 office_confirmed_at timestamptz,workshop_confirmed_at timestamptz
);
CREATE TABLE public.wos_visual_baseline_items (
 baseline_id uuid NOT NULL,reference_image_id uuid NOT NULL,
 display_order integer NOT NULL DEFAULT 0,is_required boolean NOT NULL DEFAULT true
);
ALTER TABLE public.wos_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_resource_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_workshop_inbox ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO authenticated,anon;
GRANT SELECT ON public.profiles,public.wos_production_orders,
 public.wos_workshop_inbox,public.wos_submission_receipts,
 public.wos_resource_readiness,public.wos_status_history,public.wos_confirmations,
 public.wos_blockers,public.wos_visual_baselines TO authenticated;
-- No UPDATE/INSERT/DELETE grants for authenticated on WOS business tables.

INSERT INTO public.organizations (id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator',true),
 ('20202020-2020-4020-8020-202020202020','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','operator',true),
 ('30303030-3030-4030-8030-303030303030','33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer',true),
 ('40404040-4040-4040-8040-404040404040','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager',true),
 ('50505050-5050-4050-8050-505050505050','55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','sales',true);
INSERT INTO public.wos_production_orders
 (id,organization_id,order_number,workflow_status,version,version_label,current_batch_quantity)
 VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA-NONPROD-P2-001','SUBMITTED',2,'V1',100),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA-NONPROD-P2-002','SUBMITTED',2,'V1',200),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','QA-NONPROD-P2-FOREIGN','SUBMITTED',2,'V1',100);
INSERT INTO public.wos_submission_receipts
 (id,organization_id,order_id,source_revision,source_version_label) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'V1'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'V1'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ffffffff-ffff-4fff-8fff-ffffffffffff',1,'V1');
INSERT INTO public.wos_workshop_inbox
 (id,organization_id,order_id,submission_id,source_revision,source_version_label,workflow_status) VALUES
 ('12121212-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1,'V1','SUBMITTED'),
 ('13131313-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1,'V1','SUBMITTED'),
 ('14141414-1414-4414-8414-141414141414','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ffffffff-ffff-4fff-8fff-ffffffffffff','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',1,'V1','SUBMITTED');
