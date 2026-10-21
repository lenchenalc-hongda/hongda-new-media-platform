-- Production-shape SQL/RLS integration smoke on disposable PostgreSQL 17 only.
-- Requires tests/sql/glh_stage1_synthetic_supabase_baseline.sql and four GLH migrations.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'glh\_%' ESCAPE '\'
        AND c.relkind IN ('r','p')) < 18 THEN
    RAISE EXCEPTION 'GLH migration set did not create all 18 tables';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'glh\_%' ESCAPE '\'
        AND c.relkind IN ('r','p') AND c.relrowsecurity = false) <> 0 THEN
    RAISE EXCEPTION 'GLH table missing RLS';
  END IF;
  IF has_table_privilege('anon', 'public.glh_leads', 'SELECT')
     OR has_table_privilege('anon', 'public.glh_leads', 'INSERT')
     OR has_table_privilege('authenticated', 'public.glh_leads', 'INSERT')
     OR has_table_privilege('authenticated', 'public.glh_leads', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.glh_leads', 'DELETE') THEN
    RAISE EXCEPTION 'Unsafe GLH direct table privileges';
  END IF;
  IF EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='glh_ingest_whatsapp_inbound'
       AND (has_function_privilege('anon',p.oid,'EXECUTE')
         OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'WhatsApp ingestion RPC exposed to browser roles';
  END IF;
  IF NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='glh_ingest_whatsapp_inbound'
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Ingestion RPC missing private server grant';
  END IF;
END
$$;

INSERT INTO public.glh_contacts (id,org_id,source_platform,created_by_profile_id) VALUES
 ('00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000000001','UNKNOWN','00000000-0000-4000-8000-000000002001'),
 ('00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000000001','UNKNOWN','00000000-0000-4000-8000-000000002002'),
 ('00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000000002','UNKNOWN','00000000-0000-4000-8000-000000002004');
INSERT INTO public.glh_leads (id,org_id,contact_id,owner_profile_id,created_by_profile_id) VALUES
 ('00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000002001'),
 ('00000000-0000-4000-8000-000000004002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000002002'),
 ('00000000-0000-4000-8000-000000004003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000002004');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.glh_contacts (id,org_id,created_by_profile_id) VALUES
      ('00000000-0000-4000-8000-000000003099',
       '00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000002004');
    RAISE EXCEPTION 'Wrong-organization profile FK unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001001',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_leads) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.glh_leads WHERE id='00000000-0000-4000-8000-000000004001')
     OR EXISTS (SELECT 1 FROM public.glh_leads WHERE id IN (
       '00000000-0000-4000-8000-000000004002','00000000-0000-4000-8000-000000004003'
     )) THEN RAISE EXCEPTION 'Sales A authorization boundary failed'; END IF;
END
$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001002',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_leads) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.glh_leads WHERE id='00000000-0000-4000-8000-000000004002')
  THEN RAISE EXCEPTION 'Sales B authorization boundary failed'; END IF;
END
$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001003',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_leads) <> 2
     OR EXISTS (SELECT 1 FROM public.glh_leads WHERE id='00000000-0000-4000-8000-000000004003')
  THEN RAISE EXCEPTION 'Manager org isolation failed'; END IF;
END
$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001004',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.glh_leads) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.glh_leads WHERE id='00000000-0000-4000-8000-000000004003')
  THEN RAISE EXCEPTION 'Org B isolation failed'; END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 4 THEN
    RAISE EXCEPTION 'Existing profile data unexpectedly changed';
  END IF;
END
$$;
SELECT 'GLH_STAGE1_POSTGRESQL17_SMOKE_PASS' AS result;
