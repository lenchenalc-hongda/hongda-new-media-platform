-- Synthetic PostgreSQL 17 Supabase baseline. CI-only; never run on Production.
-- No real credentials, people, customer names or business data.
\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
-- Production already has this non-constraint UNIQUE index. Do not modify CPC table.
CREATE UNIQUE INDEX uq_profiles_id_org ON public.profiles (id,org_id);
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

INSERT INTO public.organizations (id,name) VALUES
 ('00000000-0000-4000-8000-000000000001','Org A (synthetic)'),
 ('00000000-0000-4000-8000-000000000002','Org B (synthetic)');
INSERT INTO public.profiles (id,user_id,org_id,full_name,role,is_active) VALUES
 ('00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000000001','Sales A','sales',true),
 ('00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000000001','Sales B','sales',true),
 ('00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000000001','Manager A','manager',true),
 ('00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000000002','Sales C','sales',true);
