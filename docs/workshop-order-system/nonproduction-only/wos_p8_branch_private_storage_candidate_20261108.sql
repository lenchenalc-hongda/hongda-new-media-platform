-- WOS P8 | NONPRODUCTION STAGING BRANCH ONLY | private Storage contract.
-- This creates a real private Supabase Storage bucket in the disposable branch.
-- It does not upload, copy, or remove a Storage binary.
-- It must never be committed to the deployable supabase/migrations directory.
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('public.wos_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_production_orders') IS NULL
    OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='wos-private')
    OR (SELECT count(*) FROM public.profiles)<>0
    OR (SELECT count(*) FROM public.organizations)<>0
  THEN RAISE EXCEPTION 'WOS_P8_EMPTY_STAGING_SCHEMA_REQUIRED'; END IF;
END $preflight$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('wos-private','wos-private',false,20971520,
 ARRAY['image/jpeg','image/png','image/webp']::text[]);

-- No browser UPDATE/DELETE of existing WOS objects, even if another module
-- later adds a more permissive Storage policy.
CREATE POLICY wos_p8_stage_object_no_update
 ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
 USING(bucket_id IS DISTINCT FROM 'wos-private')
 WITH CHECK(bucket_id IS DISTINCT FROM 'wos-private');
CREATE POLICY wos_p8_stage_object_no_delete
 ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
 USING(bucket_id IS DISTINCT FROM 'wos-private');

-- Every policy includes a specific bucket scope so other business buckets
-- cannot obtain WOS access accidentally through permissive OR-composition.
CREATE POLICY wos_p8_stage_private_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (
   bucket_id='wos-private'
   AND (storage.foldername(name))[1]='organizations'
   AND (storage.foldername(name))[3]='wos'
   AND (storage.foldername(name))[4]='production-order'
   AND (storage.foldername(name))[6]='images'
   AND (storage.foldername(name))[7] IN (
     'film-pattern','product','customer-approved-sample','signed-sample',
     'packaging-label','defect-risk','other')
   AND (storage.foldername(name))[8]='versions'
   AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
   AND (storage.foldername(name))[10] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(jpg|jpeg|png|webp)$'
   AND position('..' in storage.filename(name))=0
   AND EXISTS (
     SELECT 1 FROM public.profiles p JOIN public.wos_production_orders po
       ON po.organization_id=p.org_id
     WHERE p.user_id=auth.uid() AND p.is_active
       AND p.role IN ('admin','manager','sales')
       AND p.org_id::text=(storage.foldername(name))[2]
       AND po.id::text=(storage.foldername(name))[5]
       AND po.workflow_status='DRAFT'
       AND po.version_label=(storage.foldername(name))[9]
       AND (p.role<>'sales' OR p.id IN
         (po.created_by_profile_id,po.sales_owner_profile_id))
   )
 );

CREATE POLICY wos_p8_stage_private_read ON storage.objects
 FOR SELECT TO authenticated
 USING (
  bucket_id='wos-private'
  AND (storage.foldername(name))[1]='organizations'
  AND (storage.foldername(name))[3]='wos'
  AND (storage.foldername(name))[4]='production-order'
  AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.wos_production_orders po
     ON po.organization_id=p.org_id
    WHERE p.user_id=auth.uid() AND p.is_active
     AND p.org_id::text=(storage.foldername(name))[2]
     AND po.id::text=(storage.foldername(name))[5]
     AND (
       p.role IN ('admin','manager')
       OR (p.role='sales' AND p.id IN
          (po.created_by_profile_id,po.sales_owner_profile_id))
       OR (p.role='operator' AND po.workflow_status='SUBMITTED')
     )
  )
 );

-- Restrictive policy prevents any OTHER permissive policy (including legacy
-- shared Storage module rules) from widening access to WOS private objects.
CREATE POLICY wos_p8_stage_private_read_guard ON storage.objects
 AS RESTRICTIVE FOR SELECT TO PUBLIC USING (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR (
   auth.uid() IS NOT NULL
   AND (storage.foldername(name))[1]='organizations'
   AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.wos_production_orders po
      ON po.organization_id=p.org_id
    WHERE p.user_id=auth.uid() AND p.is_active
      AND p.org_id::text=(storage.foldername(name))[2]
      AND po.id::text=(storage.foldername(name))[5]
      AND (
        p.role IN ('admin','manager')
        OR (p.role='sales' AND p.id IN
           (po.created_by_profile_id,po.sales_owner_profile_id))
        OR (p.role='operator' AND po.workflow_status='SUBMITTED')
      )
   )
  )
 );
CREATE POLICY wos_p8_stage_private_insert_guard ON storage.objects
 AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (
  bucket_id IS DISTINCT FROM 'wos-private'
  OR (
   auth.uid() IS NOT NULL
   AND (storage.foldername(name))[1]='organizations'
   AND (storage.foldername(name))[3]='wos'
   AND (storage.foldername(name))[4]='production-order'
   AND (storage.foldername(name))[6]='images'
   AND (storage.foldername(name))[8]='versions'
   AND EXISTS (
     SELECT 1 FROM public.profiles p JOIN public.wos_production_orders po
     ON po.organization_id=p.org_id
     WHERE p.user_id=auth.uid() AND p.is_active
       AND p.role IN ('admin','manager','sales')
       AND p.org_id::text=(storage.foldername(name))[2]
       AND po.id::text=(storage.foldername(name))[5]
       AND po.workflow_status='DRAFT'
       AND po.version_label=(storage.foldername(name))[9]
       AND (p.role<>'sales' OR p.id IN
          (po.created_by_profile_id,po.sales_owner_profile_id))
   )
  )
 );
COMMIT;
