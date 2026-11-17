-- WOS isolated QA reader-role hardening (nonproduction ONLY).
-- Scope: hongda-review-dev Supabase xulmpqaknlwqqculbsek, never Production.
-- Add RESTRICTIVE read role gates on existing same-org PERMISSIVE RLS.
-- Existing org isolation remains in effect; viewer is deliberately excluded.

DROP POLICY IF EXISTS wos_p7_read_roles_production_orders ON public.wos_production_orders;
CREATE POLICY wos_p7_read_roles_production_orders ON public.wos_production_orders
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
   AND p.org_id=wos_production_orders.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')
 ));

DROP POLICY IF EXISTS wos_p7_read_roles_reference_images ON public.wos_reference_images;
CREATE POLICY wos_p7_read_roles_reference_images ON public.wos_reference_images
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
   AND p.org_id=wos_reference_images.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')
 ));

DROP POLICY IF EXISTS wos_p7_read_roles_status_history ON public.wos_status_history;
CREATE POLICY wos_p7_read_roles_status_history ON public.wos_status_history
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
   AND p.org_id=wos_status_history.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')
 ));

DROP POLICY IF EXISTS wos_p7_read_roles_office_readiness_receipts ON public.wos_office_readiness_receipts;
CREATE POLICY wos_p7_read_roles_office_readiness_receipts ON public.wos_office_readiness_receipts
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
   AND p.org_id=wos_office_readiness_receipts.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')
 ));

DROP POLICY IF EXISTS wos_p7_read_roles_submission_receipts ON public.wos_submission_receipts;
CREATE POLICY wos_p7_read_roles_submission_receipts ON public.wos_submission_receipts
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
   AND p.org_id=wos_submission_receipts.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')
 ));

DROP POLICY IF EXISTS wos_p7_read_roles_workshop_inbox ON public.wos_workshop_inbox;
CREATE POLICY wos_p7_read_roles_workshop_inbox ON public.wos_workshop_inbox
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
   AND p.org_id=wos_workshop_inbox.organization_id
   AND p.role IN ('admin','manager','sales','operator','workshop','technician')
 ));

-- This is RESTRICTIVE on storage.objects SELECT across all buckets,
-- but does NOT affect any non-WOS bucket because that branch is true.
DROP POLICY IF EXISTS wos_p7_storage_reader_roles ON storage.objects;
CREATE POLICY wos_p7_storage_reader_roles ON storage.objects
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR EXISTS (
   SELECT 1 FROM public.profiles p
   WHERE p.user_id=auth.uid() AND p.is_active=true
    AND p.role IN ('admin','manager','sales','operator','workshop','technician')
    AND p.org_id::text=(storage.foldername(name))[2]
  )
 );
