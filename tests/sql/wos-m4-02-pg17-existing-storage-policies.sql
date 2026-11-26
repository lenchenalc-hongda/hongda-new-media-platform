\set ON_ERROR_STOP on

-- Existing QA P7 Storage RLS, copied into the disposable fixture exactly for
-- the SELECT predicates used by the Office-only fallback. This suite does not
-- install these policies on a hosted project.

CREATE POLICY wos_p7_private_object_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'wos-private'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (storage.foldername(name))[3] = 'wos'
  AND (storage.foldername(name))[4] = 'production-order'
  AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.wos_production_orders production_order
      ON production_order.organization_id = profile.org_id
    WHERE profile.user_id = auth.uid()
      AND profile.is_active
      AND profile.org_id::text = (storage.foldername(name))[2]
      AND production_order.id::text = (storage.foldername(name))[5]
      AND (
        profile.role IN ('admin', 'manager')
        OR (
          profile.role = 'sales'
          AND profile.id IN (
            production_order.created_by_profile_id,
            production_order.sales_owner_profile_id
          )
        )
        OR (
          profile.role IN ('operator', 'workshop', 'technician')
          AND production_order.workflow_status = 'SUBMITTED'
        )
      )
  )
);

CREATE POLICY wos_p7_storage_reader_roles ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.user_id = auth.uid()
      AND profile.is_active = true
      AND profile.role IN (
        'admin',
        'manager',
        'sales',
        'operator',
        'workshop',
        'technician'
      )
      AND profile.org_id::text = (storage.foldername(name))[2]
  )
);
