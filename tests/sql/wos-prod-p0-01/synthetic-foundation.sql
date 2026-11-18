-- PostgreSQL 17 isolated CI fixture ONLY. No real business tables, accounts, or data.
-- This is a minimal structural stand-in for independently reviewed Production CPC names.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$auth$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  role text NOT NULL CHECK(role IN ('admin','manager','sales','operator','viewer')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(id,org_id)
);
CREATE TABLE public.cpc_customer_references (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  status text NOT NULL,
  display_name_snapshot text NOT NULL,
  UNIQUE(id,org_id)
);
CREATE TABLE public.cpc_projects (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  customer_reference_id uuid NOT NULL,
  title text NOT NULL,
  owner_profile_id uuid NOT NULL,
  status text NOT NULL,
  archived_at timestamptz,
  UNIQUE(id,org_id),
  FOREIGN KEY (customer_reference_id,org_id) REFERENCES public.cpc_customer_references(id,org_id),
  FOREIGN KEY (owner_profile_id,org_id) REFERENCES public.profiles(id,org_id)
);
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
-- The fixture deliberately does not recreate real Auth/CPC triggers, data, or RLS.
-- Those still require a separate production-structure rehearsal and live employee UAT.
