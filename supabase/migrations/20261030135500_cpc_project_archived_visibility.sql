-- CPC project visibility: owner-requested removal without destroying immutable
-- lifecycle events, existing tasks, customer links or append-only audit logs.
--
-- This is a backward-compatible nullable column; existing projects remain
-- visible. Only explicitly archived projects disappear from user-facing
-- SELECT queries under the existing CPC project RLS policy.
BEGIN;

ALTER TABLE public.cpc_projects
  ADD COLUMN archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cpc_projects.archived_at
  IS 'Owner-authorized tombstone for hiding a cancelled project from CPC user-facing reads. A non-NULL timestamp keeps immutable project events, work items and audit histories intact; only a controlled, audited maintenance action may set/restore it.';

-- The existing authz function is preserved. In particular, a sales user still
-- cannot see another salesperson's project just because it is not archived.
-- Conversely, admins/managers do not see an explicitly archived project in
-- ordinary CPC lists or direct project detail reads.
ALTER POLICY cpc_projects_select
  ON public.cpc_projects
  USING (
    archived_at IS NULL
    AND public.cpc_can_read_project(id, org_id)
  );

COMMIT;
