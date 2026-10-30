-- CPC project list: show the responsible employee's display name.
-- SECURITY: Do not widen profiles RLS or reveal any other profile attributes.
-- Only the owner name of a project that the caller can already read is exposed.
BEGIN;

CREATE OR REPLACE FUNCTION public.cpc_project_owner_names(
  p_project_ids UUID[]
)
RETURNS TABLE (
  project_id UUID,
  owner_name TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT project.id AS project_id,
         NULLIF(btrim(owner.full_name), '')::TEXT AS owner_name
  FROM public.cpc_projects AS project
  JOIN public.profiles AS viewer
    ON viewer.org_id = project.org_id
   AND viewer.user_id = auth.uid()
   AND viewer.is_active = TRUE
   AND viewer.role IN ('admin','manager','sales')
  JOIN public.profiles AS owner
    ON owner.org_id = project.org_id
   AND owner.id = project.owner_profile_id
  WHERE cardinality(p_project_ids) BETWEEN 1 AND 500
    AND project.id = ANY(p_project_ids)
    AND public.cpc_can_read_project(project.id, project.org_id)
  ORDER BY project.id;
$$;

COMMENT ON FUNCTION public.cpc_project_owner_names(UUID[])
  IS 'Read-only project-owner display names for up to 500 projects already visible to the authenticated CPC user; never returns employee private fields or other organizations projects.';

REVOKE ALL ON FUNCTION public.cpc_project_owner_names(UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_project_owner_names(UUID[])
  TO authenticated;

COMMIT;
