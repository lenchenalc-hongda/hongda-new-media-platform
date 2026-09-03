-- Case Center Migration Immutability Repair
-- Forward migration for auth helper and legacy RLS policy semantics.
-- Restores profiles-backed identity behavior before Review Center migrations.

BEGIN;

-- ===== Helper function: check if user has a role =====
CREATE OR REPLACE FUNCTION public.auth_has_role(required_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND is_active = true
      AND role = required_role
  );
$$;

-- ===== Helper function: user's org_id =====
CREATE OR REPLACE FUNCTION public.auth_org_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT org_id::text FROM public.profiles
      WHERE user_id = auth.uid() AND is_active = true
      LIMIT 1),
    ''
  );
$$;

-- ===== Helper function: user's internal profile id =====
CREATE OR REPLACE FUNCTION public.auth_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- ===== Legacy topics policy =====
DROP POLICY IF EXISTS "Update topics: admin/manager/operator" ON public.topics;

CREATE POLICY "Update topics: admin/manager/operator" ON public.topics
  FOR UPDATE USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    (auth_has_role('operator') AND created_by = auth_profile_id())
  );

-- ===== Legacy leads read policy =====
DROP POLICY IF EXISTS "Read own leads: sales" ON public.leads;

CREATE POLICY "Read own leads: sales" ON public.leads
  FOR SELECT USING (
    auth_has_role('sales') AND assigned_to = auth_profile_id()
  );

-- ===== Legacy leads update policy =====
DROP POLICY IF EXISTS "Update own assigned leads: sales" ON public.leads;

CREATE POLICY "Update own assigned leads: sales" ON public.leads
  FOR UPDATE USING (
    auth_has_role('sales') AND assigned_to = auth_profile_id()
  );

COMMIT;
