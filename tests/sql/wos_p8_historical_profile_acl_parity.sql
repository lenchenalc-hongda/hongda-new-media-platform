-- Nonproduction P8 branch compensation for historically hand-installed profile ACL/RLS.
-- The real Production has authenticated SELECT on profiles; it was not recreated
-- by its 29 recorded migrations. This file never grants anonymous access.
BEGIN;
DO $check$
BEGIN
 IF to_regclass('public.profiles') IS NULL
   OR to_regprocedure('public.auth_has_role(text)') IS NULL
   OR to_regprocedure('public.auth_org_id()') IS NULL
 THEN RAISE EXCEPTION 'PROFILE_PREHISTORY_NOT_READY'; END IF;
END $check$;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY "Users can read own profile" ON public.profiles
 FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Admins can manage all profiles" ON public.profiles
 FOR ALL TO authenticated
 USING (public.auth_has_role('admin'))
 WITH CHECK (public.auth_has_role('admin'));
CREATE POLICY "Managers can read org profiles" ON public.profiles
 FOR SELECT TO authenticated
 USING (public.auth_has_role('manager') AND org_id::text=public.auth_org_id());
COMMIT;
