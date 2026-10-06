-- Customer Project Center - Phase 12 Pilot Environment Hardening
-- Scope: forward-only, idempotent repository remediation for isolated non-Production pilot environments.
-- Safety:
--   - NO Production execution in this task.
--   - NO DROP / TRUNCATE / DELETE / data overwrite.
--   - NO customer ownership / finance / order / quotation / conversation source-of-truth changes.
--   - Requires the approved CPC migration sequence through Phase 7A to already be present.

BEGIN;

DO $cpc_pilot_env_hardening$
BEGIN
  IF to_regclass('public.cpc_projects') IS NULL THEN
    RAISE EXCEPTION 'CPC pilot hardening requires public.cpc_projects (Phase 5A)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cpc_record_customer_follow_up'
  ) THEN
    RAISE EXCEPTION 'CPC pilot hardening requires cpc_record_customer_follow_up (Phase 5F)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cpc_reschedule_work_item'
  ) THEN
    RAISE EXCEPTION 'CPC pilot hardening requires cpc_reschedule_work_item (Phase 6B)';
  END IF;

  IF to_regclass('public.cpc_ai_drafts') IS NULL THEN
    RAISE EXCEPTION 'CPC pilot hardening requires public.cpc_ai_drafts (Phase 6C)';
  END IF;

  IF to_regclass('public.cpc_reports') IS NULL THEN
    RAISE EXCEPTION 'CPC pilot hardening requires public.cpc_reports (Phase 7A)';
  END IF;

  IF to_regprocedure('public.auth_has_role(text)') IS NULL
     OR to_regprocedure('public.auth_org_id()') IS NULL
     OR to_regprocedure('public.auth_profile_id()') IS NULL THEN
    RAISE EXCEPTION 'CPC pilot hardening requires all three base auth helper functions';
  END IF;
END;
$cpc_pilot_env_hardening$;

-- SECURITY DEFINER helpers are implementation primitives for RLS / authenticated
-- application flows. They must not remain directly executable by PUBLIC or anon.
REVOKE ALL ON FUNCTION public.auth_has_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_has_role(text) FROM anon;
REVOKE ALL ON FUNCTION public.auth_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_org_id() FROM anon;
REVOKE ALL ON FUNCTION public.auth_profile_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_profile_id() FROM anon;

-- Preserve only the application role needed by existing RLS policies / CPC RPCs.
GRANT EXECUTE ON FUNCTION public.auth_has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_profile_id() TO authenticated;

COMMIT;
