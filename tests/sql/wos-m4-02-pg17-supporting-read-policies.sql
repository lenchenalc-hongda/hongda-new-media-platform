\set ON_ERROR_STOP on

-- Minimum synthetic support policies representing the already-installed QA
-- reader surface used by the P7 expressions. They are not part of the M4
-- fallback and are discarded with the disposable database.

CREATE POLICY wos_pg17_profile_self_read ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY wos_pg17_order_same_org_read
ON public.wos_production_orders
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.user_id = auth.uid()
      AND profile.is_active = true
      AND profile.org_id = wos_production_orders.organization_id
  )
);
