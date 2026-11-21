-- LOCAL EPHEMERAL TEST STACK ONLY. Never apply to cloud QA or Production.
CREATE POLICY wos_local_revision_object_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='wos-private'
 AND (storage.foldername(name))[1]='organizations'
 AND (storage.foldername(name))[3]='wos'
 AND (storage.foldername(name))[4]='production-order'
 AND (storage.foldername(name))[6]='images'
 AND (storage.foldername(name))[7] IN (
   'film-pattern','product','customer-approved-sample','signed-sample')
 AND (storage.foldername(name))[8]='versions'
 AND (storage.foldername(name))[9] ~ '^QA-R[1-9][0-9]*$'
 AND (storage.foldername(name))[10] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(png)$'
 AND position('..' in storage.filename(name))=0
 AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.wos_production_orders po
   ON po.organization_id=p.org_id
  WHERE p.user_id=auth.uid() AND p.is_active
    AND p.role IN ('admin','manager','sales')
    AND p.org_id::text=(storage.foldername(name))[2]
    AND po.id::text=(storage.foldername(name))[5]
    AND po.workflow_status='WAITING_MATERIAL'
    AND po.version_label=(storage.foldername(name))[9]
    AND (p.role<>'sales' OR p.id IN
         (po.created_by_profile_id,po.sales_owner_profile_id))
 )
);

CREATE OR REPLACE FUNCTION public.wos_register_qa_revision_image(
 p_order_id uuid,p_image_id uuid,p_category text,p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_object storage.objects%ROWTYPE;
 v_existing public.wos_reference_images%ROWTYPE;
 v_slug text;
 v_prefix text;
 v_filename text;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true
   AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_image_id IS NULL OR p_storage_path IS NULL
   OR p_category NOT IN ('PRODUCT','FILM_PATTERN','CUSTOMER_APPROVED_SAMPLE','SIGNED_SAMPLE')
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
   OR v_order.workflow_status<>'WAITING_MATERIAL'
   OR v_order.version_label !~ '^QA-R[1-9][0-9]*$'
   OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
       AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 v_slug:=replace(lower(p_category),'_','-');
 v_prefix:='organizations/'||v_order.organization_id::text
   ||'/wos/production-order/'||v_order.id::text||'/images/'||v_slug
   ||'/versions/'||v_order.version_label||'/'||p_image_id::text||'/';
 IF left(p_storage_path,length(v_prefix))<>v_prefix
   OR length(p_storage_path)<=length(v_prefix)
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='23514'; END IF;
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.png$'
   OR position('..' in v_filename)>0
 THEN RAISE EXCEPTION 'INVALID_STORAGE_FILE' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_object FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_storage_path
   AND owner_id=auth.uid()::text AND is_delete_marker=false
   AND archived_at IS NULL;
 IF NOT FOUND OR v_object.metadata->>'mimetype'<>'image/png'
   OR COALESCE(v_object.metadata->>'size','') !~ '^[0-9]+$'
   OR (v_object.metadata->>'size')::bigint NOT BETWEEN 60 AND 20971520
 THEN RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_qa_verified_image_proofs p
   WHERE p.image_id=p_image_id AND p.order_id=p_order_id
     AND p.organization_id=v_actor.org_id AND p.actor_user_id=auth.uid()
     AND p.storage_bucket='wos-private' AND p.storage_path=p_storage_path
     AND p.storage_object_id=v_object.id
     AND p.storage_object_version IS NOT DISTINCT FROM v_object.version
     AND p.storage_object_updated_at IS NOT DISTINCT FROM v_object.updated_at
     AND p.expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'QA_TRUSTED_BINARY_PROOF_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM public.wos_reference_images WHERE id=p_image_id;
 IF FOUND THEN
  IF v_existing.organization_id<>v_actor.org_id
    OR v_existing.entity_id<>p_order_id
    OR v_existing.category<>p_category
    OR v_existing.storage_path<>p_storage_path
    OR v_existing.version_label<>v_order.version_label
    OR v_existing.image_status<>'READY'
  THEN RAISE EXCEPTION 'IMAGE_ID_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('status','REPLAYED','imageId',v_existing.id);
 END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,
  'wos-private',p_storage_path,v_filename,'image/png',
  (v_object.metadata->>'size')::bigint,v_order.version_label,'READY',v_actor.id);
 RETURN jsonb_build_object('status','CREATED','imageId',p_image_id);
END $fn$;

REVOKE ALL ON FUNCTION public.wos_register_qa_revision_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_qa_revision_image(uuid,uuid,text,text)
 TO authenticated;
