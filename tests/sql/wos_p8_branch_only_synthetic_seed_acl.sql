-- WOS P8-08 ONLY: single-use permissions for synthetic QA seeding on an
-- exact owner-approved, empty-data Supabase development BRANCH.
-- Do not add to supabase/migrations or deploy on Production.
-- The user must independently approve any new hourly-cost branch.
-- Execute within an authorized session setting both custom GUCs to the
-- exact approved branch ref and 'yes', respectively, BEFORE this SQL.
BEGIN;
DO $branch_only$
DECLARE v_ref text;
BEGIN
  v_ref:=current_setting('wos_p8.approved_branch_ref',true);
  IF current_database()<>'postgres'
     OR v_ref IS NULL OR v_ref !~ '^[a-z0-9]{20}$'
     OR v_ref='amqpvxrurenevniilhtl'
     OR current_setting('wos_p8.rehearsal_only',true)<>'yes'
  THEN RAISE EXCEPTION 'WOS_P8_APPROVED_BRANCH_REQUIRED'; END IF;
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.wos_production_orders') IS NULL
     OR to_regclass('public.wos_workshop_inbox') IS NULL
  THEN RAISE EXCEPTION 'WOS_P8_P07_MIGRATION_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations)
     OR EXISTS (SELECT 1 FROM public.profiles)
     OR EXISTS (SELECT 1 FROM public.wos_production_orders)
  THEN RAISE EXCEPTION 'WOS_P8_BRANCH_MUST_HAVE_ZERO_BUSINESS_DATA'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='wos-private')
  THEN RAISE EXCEPTION 'WOS_P8_BRANCH_STORAGE_NOT_EMPTY'; END IF;
END $branch_only$;

-- Production source has NOT granted service_role INSERT to these core tables.
-- Avoid altering Production ACL or relaxing RLS; this is a disposable
-- test-only impersonation used exclusively to create synthetic records.
GRANT SELECT,INSERT ON public.organizations TO service_role;
GRANT SELECT,INSERT ON public.profiles TO service_role;
GRANT SELECT,INSERT ON public.wos_production_orders TO service_role;
GRANT SELECT ON public.wos_workshop_inbox TO service_role;

DO $assert$
BEGIN
  IF NOT has_table_privilege('service_role','public.organizations','INSERT')
     OR NOT has_table_privilege('service_role','public.profiles','INSERT')
     OR NOT has_table_privilege('service_role','public.wos_production_orders','INSERT')
     OR NOT has_table_privilege('service_role','public.wos_workshop_inbox','SELECT')
  THEN RAISE EXCEPTION 'P8_TEST_ONLY_SERVICE_ROLE_GRANT_MISSING'; END IF;
  IF has_table_privilege('anon','public.organizations','INSERT')
     OR has_table_privilege('anon','public.profiles','INSERT')
  THEN RAISE EXCEPTION 'ANONYMOUS_CORE_INSERT_LEAK'; END IF;
END $assert$;
COMMIT;

-- Do not attempt this against Production. The entire nonproduction branch
-- is disposed through official Supabase branch deletion after evidence capture.
