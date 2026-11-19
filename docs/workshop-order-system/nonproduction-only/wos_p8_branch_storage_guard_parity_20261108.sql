-- WOS P8 | NONPRODUCTION BRANCH ONLY | Restrictive Storage RLS parity.
-- Hardens the branch-only restrictive policies against unrelated permissive
-- Storage policies in a shared multi-module Supabase project.
-- No Storage binaries are uploaded or deleted here.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.wos_verified_image_proofs') IS NULL
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='wos-private' AND public=false)
 OR (SELECT count(*) FROM public.profiles)<>0
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'WOS_P8_EMPTY_STAGING_BRANCH_REQUIRED'; END IF;
END $guard$;

-- The restrictive INSERT guard MUST be as narrow as the intended permissive
-- WOS upload rule. Otherwise any other permissive Storage policy may permit
-- a malformed WOS path while satisfying the weaker old restrictive guard.
ALTER POLICY wos_p8_stage_private_insert_guard ON storage.objects
WITH CHECK (
 bucket_id IS DISTINCT FROM 'wos-private'
 OR (
  auth.uid() IS NOT NULL
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
 )
);
ALTER POLICY wos_p8_stage_private_read_guard ON storage.objects
USING (
 bucket_id IS DISTINCT FROM 'wos-private'
 OR (
  auth.uid() IS NOT NULL
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
COMMIT;
