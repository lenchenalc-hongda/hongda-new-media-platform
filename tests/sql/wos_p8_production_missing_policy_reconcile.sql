\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 only. Recreates three historical Production
-- policies that are not present in the replayable early source files.
-- This is NOT a Production migration.
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_p8_replay_ci'
    OR (SELECT count(*) FROM auth.users) <> 0
    OR (
      SELECT count(*)
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) <> 67
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND policyname IN ('org_isolation', 'anon_insert', 'anon_select', 'anon_update')
    )
  THEN
    RAISE EXCEPTION 'WOS_P8_MISSING_POLICY_RECONCILE_GUARD_FAILED';
  END IF;
END;
$guard$;

CREATE POLICY org_isolation ON public.accounts
USING (
  org_id IN (
    SELECT profiles.org_id
    FROM public.profiles
    WHERE profiles.user_id = auth.uid()
  )
);

CREATE POLICY anon_insert ON public.site_data
FOR INSERT
WITH CHECK (true);

CREATE POLICY anon_select ON public.site_data
FOR SELECT
USING (true);

CREATE POLICY anon_update ON public.site_data
FOR UPDATE
USING (true);

COMMIT;

SELECT 'WOS_P8_HISTORICAL_POLICY_RECONCILE=PASS' AS check_name;
