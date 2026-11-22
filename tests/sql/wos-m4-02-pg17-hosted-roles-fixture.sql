\set ON_ERROR_STOP on

-- Bootstrap-only synthetic split-owner fixture. The login-role executor proves
-- PostgreSQL permission mechanics only; it is NOT evidence that hosted
-- Supabase exposes this exact Storage-owner executor.

CREATE ROLE hosted_wos_installer
  LOGIN NOSUPERUSER CREATEROLE INHERIT BYPASSRLS
  PASSWORD 'synthetic';
CREATE ROLE supabase_storage_admin
  LOGIN NOSUPERUSER CREATEROLE NOINHERIT NOBYPASSRLS
  PASSWORD 'synthetic';
CREATE ROLE supabase_auth_admin
  LOGIN NOSUPERUSER CREATEROLE NOINHERIT NOBYPASSRLS
  PASSWORD 'synthetic';

GRANT USAGE, CREATE ON SCHEMA public
  TO hosted_wos_installer WITH GRANT OPTION;
GRANT USAGE ON SCHEMA auth TO hosted_wos_installer;
GRANT USAGE ON SCHEMA storage
  TO hosted_wos_installer WITH GRANT OPTION;
GRANT USAGE ON SCHEMA public, storage TO supabase_storage_admin;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;

ALTER TABLE public.profiles OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_production_orders OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_visual_baselines OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_visual_baseline_items OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_reference_images OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_qa_verified_image_proofs OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_qa_p2_m2_receipts OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_qa_p2_execution_gate OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_qa_p2_office_execution_gate OWNER TO hosted_wos_installer;
ALTER TABLE public.wos_qa_p2_m2_gate OWNER TO hosted_wos_installer;

ALTER FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  OWNER TO hosted_wos_installer;
ALTER FUNCTION public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)
  OWNER TO hosted_wos_installer;
ALTER FUNCTION public.wos_qa_p2_m2_spec_digest(uuid)
  OWNER TO hosted_wos_installer;

ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
REVOKE ALL ON storage.objects FROM hosted_wos_installer;
GRANT SELECT ON storage.objects
  TO hosted_wos_installer WITH GRANT OPTION;

ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

DO $hosted_fixture_check$
BEGIN
  IF pg_catalog.has_table_privilege(
      'hosted_wos_installer',
      'storage.objects',
      'TRIGGER'
    )
    OR pg_catalog.pg_has_role(
      'hosted_wos_installer',
      'supabase_storage_admin',
      'SET'
    )
    OR pg_catalog.has_function_privilege(
      'hosted_wos_installer',
      'auth.uid()',
      'EXECUTE WITH GRANT OPTION'
    )
  THEN
    RAISE EXCEPTION 'M4_HOSTED_ROLE_FIXTURE_OVERPRIVILEGED';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
      'hosted_wos_installer',
      'storage.objects',
      'SELECT WITH GRANT OPTION'
    )
    OR pg_catalog.pg_get_userbyid((
      SELECT relation.relowner
      FROM pg_catalog.pg_class relation
      WHERE relation.oid = 'storage.objects'::regclass
    )) <> 'supabase_storage_admin'
    OR pg_catalog.pg_get_userbyid((
      SELECT procedure.proowner
      FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid = 'auth.uid()'::regprocedure
    )) <> 'supabase_auth_admin'
  THEN
    RAISE EXCEPTION 'M4_HOSTED_ROLE_FIXTURE_BASELINE_INVALID';
  END IF;
END;
$hosted_fixture_check$;
