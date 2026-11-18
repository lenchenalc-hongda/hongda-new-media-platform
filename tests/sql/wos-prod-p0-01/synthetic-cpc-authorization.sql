-- Synthetic CPC permission stubs reflect only a MINIMAL aspect of Production CPC RLS.
-- They are not Production CPC policies and may be used ONLY in disposable PG17.
CREATE OR REPLACE FUNCTION public.cpc_can_read_project(p_project_id uuid,p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog'
AS $$
 SELECT EXISTS(
 SELECT 1 FROM public.cpc_projects p
 JOIN public.profiles actor ON actor.org_id=p.org_id
 WHERE p.id=p_project_id AND p.org_id=p_org_id AND actor.user_id=auth.uid()
  AND actor.is_active=true AND actor.role IN ('admin','manager','sales')
  AND (actor.role IN ('admin','manager') OR p.owner_profile_id=actor.id))
$$;
CREATE OR REPLACE FUNCTION public.cpc_can_read_customer_reference(p_customer_reference_id uuid,p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog'
AS $$
 SELECT EXISTS(
 SELECT 1 FROM public.cpc_customer_references c
 JOIN public.profiles actor ON actor.org_id=c.org_id
 WHERE c.id=p_customer_reference_id AND c.org_id=p_org_id AND actor.user_id=auth.uid()
  AND actor.is_active=true AND actor.role IN ('admin','manager','sales')
  AND (actor.role IN ('admin','manager') OR EXISTS (
    SELECT 1 FROM public.cpc_projects p WHERE p.customer_reference_id=c.id
      AND p.org_id=c.org_id AND p.owner_profile_id=actor.id)))
$$;
