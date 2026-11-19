-- Reviewed-design PROPOSAL ONLY. Needs Supabase-managed Storage authorization
-- compatibility review before ANY persistent installation. No production/QA writes.
BEGIN;
DO $g$
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'WOS_STORAGE_RLS_PROPOSAL_NOT_AUTHORIZED'; END IF;
END $g$;
-- Private bucket, no object overwrite or delete. PNG v1 only at first MVP.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage.objects FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON storage.objects TO authenticated;
CREATE POLICY wos_mvp_candidate_private_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK(
  bucket_id='wos-private' AND owner_id=auth.uid()::text
  AND is_delete_marker=false AND archived_at IS NULL
  AND metadata->>'mimetype'='image/png'
  AND EXISTS(
   SELECT 1 FROM public.profiles p
   JOIN public.wos_production_orders o ON o.organization_id=p.org_id
   WHERE p.user_id=auth.uid() AND p.is_active=true
    AND p.role IN ('admin','manager','sales')
    AND o.workflow_status='DRAFT'
    AND (p.role<>'sales' OR o.sales_owner_profile_id=p.id OR o.created_by_profile_id=p.id)
    AND name LIKE ('organizations/'||o.organization_id::text||
     '/wos/production-order/'||o.id::text||
     '/images/product/versions/'||o.version_label||'/%')
  )
 );
CREATE POLICY wos_mvp_candidate_private_read ON storage.objects
 FOR SELECT TO authenticated
 USING(
  bucket_id='wos-private' AND is_delete_marker=false AND archived_at IS NULL
  AND EXISTS(
   SELECT 1 FROM public.profiles p
   JOIN public.wos_production_orders o ON o.organization_id=p.org_id
   WHERE p.user_id=auth.uid() AND p.is_active=true
    AND p.role IN ('admin','manager','sales','operator')
    AND o.workflow_status IN ('DRAFT','SUBMITTED','WORKSHOP_REVIEW',
     'NEEDS_INFORMATION','WAITING_MATERIAL')
    AND (p.role<>'sales' OR o.sales_owner_profile_id=p.id OR o.created_by_profile_id=p.id)
    AND name LIKE ('organizations/'||o.organization_id::text||
     '/wos/production-order/'||o.id::text||
     '/images/product/versions/'||o.version_label||'/%')
  )
 );
-- No public URL, no anon grants, no UPDATE/DELETE upsert permissions.
COMMIT;
