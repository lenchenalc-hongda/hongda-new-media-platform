-- WOS P7 private images, isolated QA project xulmpqaknlwqqculbsek ONLY.
-- DO NOT use as a production migration or import real customer images.
-- Companion: wos_p7_atomic_submission.sql (install first).

DO $bucket$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='wos-private') THEN
  INSERT INTO storage.buckets
   (id,name,public,file_size_limit,allowed_mime_types)
  VALUES('wos-private','wos-private',false,20971520,
   ARRAY['image/jpeg','image/png','image/webp']::text[]);
 ELSIF EXISTS(SELECT 1 FROM storage.buckets
  WHERE id='wos-private' AND
  (public<>false OR file_size_limit<>20971520 OR
   allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg','image/png','image/webp']::text[]))
 THEN RAISE EXCEPTION 'EXISTING_WOS_BUCKET_NOT_REVIEWED' USING ERRCODE='23514';
 END IF;
END $bucket$;

-- Strict path: organizations/{org}/wos/production-order/{orderId}/
-- images/{category}/versions/{version}/{imageId}/{safeFilename}.
-- Storage API creates the file; direct storage.objects INSERT cannot create bytes.
CREATE POLICY wos_p7_private_object_insert ON storage.objects
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

CREATE POLICY wos_p7_private_object_select ON storage.objects
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
     AND (p.role IN ('admin','manager') OR
          (p.role='sales' AND p.id IN (po.created_by_profile_id,po.sales_owner_profile_id)) OR
          (p.role IN ('operator','workshop','technician') AND po.workflow_status='SUBMITTED'))
 )
);

-- Server-trusted QA byte attestation. ONLY Edge Function (service_role)
-- can create/update proofs. Browser identities cannot fabricate them.
CREATE TABLE public.wos_qa_verified_image_proofs (
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'wos-private' CHECK (storage_bucket='wos-private'),
  storage_path text NOT NULL UNIQUE,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL CHECK (verified_sha256 ~ '^[a-f0-9]{64}
-- path, MIME and bytes; never trust a caller-supplied READY flag.
-- Privileged metadata lookup only for the audited isolated QA Edge Function.
-- No direct caller can supply owner/org proof; the Edge Function checks them.
CREATE OR REPLACE FUNCTION public.wos_qa_get_storage_object_for_proof(p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $wos$ DECLARE obj storage.objects%ROWTYPE;
BEGIN
 IF p_path IS NULL OR length(p_path)>600
    OR p_path NOT LIKE 'organizations/%/wos/production-order/%/images/%'
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='22023'; END IF;
 SELECT * INTO obj FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_path
  AND is_delete_marker=false AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_OBJECT_NOT_FOUND' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',obj.id,'ownerId',obj.owner_id,
  'version',obj.version,'updatedAt',obj.updated_at,
  'mimeType',obj.metadata->>'mimetype','byteSize',obj.metadata->>'size');
END $wos$;
REVOKE ALL ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.wos_register_uploaded_reference_image(
 p_order_id uuid,p_image_id uuid,p_category text,p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_object storage.objects%ROWTYPE;
 v_row public.wos_reference_images%ROWTYPE;
 v_category_slug text;
 v_prefix text;
 v_filename text;
 v_mime text;
 v_size bigint;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true
 AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 IF p_order_id IS NULL OR p_image_id IS NULL OR p_storage_path IS NULL
 OR length(p_storage_path)>1024
 OR p_category NOT IN ('FILM_PATTERN','PRODUCT','CUSTOMER_APPROVED_SAMPLE',
   'SIGNED_SAMPLE','PACKAGING_LABEL','DEFECT_RISK','OTHER')
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';END IF;
 v_category_slug:=replace(lower(p_category),'_','-');
 SELECT * INTO v_order FROM public.wos_production_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
 OR (v_actor.role='sales'
    AND v_actor.id<>v_order.created_by_profile_id
    AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 IF v_order.workflow_status <> 'DRAFT'
 OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;
 v_prefix:='organizations/'||v_order.organization_id::text||
  '/wos/production-order/'||v_order.id::text||'/images/'||v_category_slug||
  '/versions/'||v_order.version_label||'/'||p_image_id::text||'/';
 IF left(p_storage_path,length(v_prefix))<>v_prefix
 OR length(p_storage_path)<=length(v_prefix)
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='23514'; END IF;
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(jpg|jpeg|png|webp)$' OR position('..' in v_filename)>0
 THEN RAISE EXCEPTION 'INVALID_STORAGE_FILE' USING ERRCODE='23514';END IF;
 SELECT * INTO v_object FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_storage_path
   AND owner_id=auth.uid()::text
   AND is_delete_marker=false AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED' USING ERRCODE='23514';END IF;
 v_mime:=v_object.metadata->>'mimetype';
 IF v_mime NOT IN ('image/jpeg','image/png','image/webp')
 OR (v_mime='image/jpeg' AND lower(v_filename) !~ '\.(jpg|jpeg)$')
 OR (v_mime='image/png' AND lower(v_filename) !~ '\.png$')
 OR (v_mime='image/webp' AND lower(v_filename) !~ '\.webp$')
 OR COALESCE(v_object.metadata->>'size','') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_PRIVATE_IMAGE' USING ERRCODE='23514';END IF;
 v_size:=(v_object.metadata->>'size')::bigint;
 IF v_size<1 OR v_size>20971520
 THEN RAISE EXCEPTION 'UNSUPPORTED_IMAGE_SIZE' USING ERRCODE='23514';END IF;
 IF EXISTS (SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
     WHERE c.storage_object_id=v_object.id AND c.state='CLAIMED'
       AND c.lease_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'QA_ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v_row FROM public.wos_reference_images WHERE id=p_image_id;
 IF FOUND THEN
  IF v_row.organization_id<>v_actor.org_id OR v_row.entity_id<>p_order_id
   OR v_row.storage_bucket<>'wos-private' OR v_row.storage_path<>p_storage_path
   OR v_row.category<>p_category OR v_row.image_status<>'READY'
   OR v_row.version_label<>v_order.version_label
  THEN RAISE EXCEPTION 'IMAGE_ID_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('status','REPLAYED','imageId',v_row.id,'bucket','wos-private');
 END IF;
 -- Must be enforced inside the privileged RPC: a directly authenticated
 -- PostgREST caller cannot mint a byte-proof (proof table write privileges
 -- are withheld from anon/authenticated).
 IF v_mime<>'image/png'
 THEN RAISE EXCEPTION 'QA_TRUSTED_PNG_ONLY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_qa_verified_image_proofs proof
   WHERE proof.image_id=p_image_id
     AND proof.order_id=p_order_id
     AND proof.organization_id=v_actor.org_id
     AND proof.actor_user_id=auth.uid()
     AND proof.storage_bucket='wos-private'
     AND proof.storage_path=p_storage_path
     AND proof.storage_object_id=v_object.id
     AND proof.storage_object_version IS NOT DISTINCT FROM v_object.version
     AND proof.storage_object_updated_at IS NOT DISTINCT FROM v_object.updated_at
     AND proof.expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'QA_TRUSTED_BINARY_PROOF_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,'wos-private',
 p_storage_path,v_filename,v_mime,v_size,v_order.version_label,'READY',v_actor.id);
 RETURN jsonb_build_object('status','CREATED','imageId',p_image_id,'bucket','wos-private');
END $fn$;

-- Existing general-purpose direct image inserts could claim READY without
-- a real Storage object. For this isolated QA rollout, RPC is authoritative.
REVOKE INSERT ON public.wos_reference_images FROM authenticated;
REVOKE ALL ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 TO authenticated;
),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at>verified_at AND expires_at<=verified_at+interval '30 minutes')
);
CREATE INDEX wos_qa_proofs_order_idx ON public.wos_qa_verified_image_proofs(order_id,expires_at);
ALTER TABLE public.wos_qa_verified_image_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_verified_image_proofs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wos_qa_verified_image_proofs TO service_role;

-- Image registration is protected by verified Storage object ownership,
-- path, MIME and bytes; never trust a caller-supplied READY flag.
CREATE OR REPLACE FUNCTION public.wos_register_uploaded_reference_image(
 p_order_id uuid,p_image_id uuid,p_category text,p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_object storage.objects%ROWTYPE;
 v_row public.wos_reference_images%ROWTYPE;
 v_category_slug text;
 v_prefix text;
 v_filename text;
 v_mime text;
 v_size bigint;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true
 AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 IF p_order_id IS NULL OR p_image_id IS NULL OR p_storage_path IS NULL
 OR length(p_storage_path)>1024
 OR p_category NOT IN ('FILM_PATTERN','PRODUCT','CUSTOMER_APPROVED_SAMPLE',
   'SIGNED_SAMPLE','PACKAGING_LABEL','DEFECT_RISK','OTHER')
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';END IF;
 v_category_slug:=replace(lower(p_category),'_','-');
 SELECT * INTO v_order FROM public.wos_production_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
 OR (v_actor.role='sales'
    AND v_actor.id<>v_order.created_by_profile_id
    AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 IF v_order.workflow_status <> 'DRAFT'
 OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;
 v_prefix:='organizations/'||v_order.organization_id::text||
  '/wos/production-order/'||v_order.id::text||'/images/'||v_category_slug||
  '/versions/'||v_order.version_label||'/'||p_image_id::text||'/';
 IF left(p_storage_path,length(v_prefix))<>v_prefix
 OR length(p_storage_path)<=length(v_prefix)
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='23514'; END IF;
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(jpg|jpeg|png|webp)$' OR position('..' in v_filename)>0
 THEN RAISE EXCEPTION 'INVALID_STORAGE_FILE' USING ERRCODE='23514';END IF;
 SELECT * INTO v_object FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_storage_path
   AND owner_id=auth.uid()::text
   AND is_delete_marker=false AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED' USING ERRCODE='23514';END IF;
 v_mime:=v_object.metadata->>'mimetype';
 IF v_mime NOT IN ('image/jpeg','image/png','image/webp')
 OR (v_mime='image/jpeg' AND lower(v_filename) !~ '\.(jpg|jpeg)$')
 OR (v_mime='image/png' AND lower(v_filename) !~ '\.png$')
 OR (v_mime='image/webp' AND lower(v_filename) !~ '\.webp$')
 OR COALESCE(v_object.metadata->>'size','') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_PRIVATE_IMAGE' USING ERRCODE='23514';END IF;
 v_size:=(v_object.metadata->>'size')::bigint;
 IF v_size<1 OR v_size>20971520
 THEN RAISE EXCEPTION 'UNSUPPORTED_IMAGE_SIZE' USING ERRCODE='23514';END IF;
 SELECT * INTO v_row FROM public.wos_reference_images WHERE id=p_image_id;
 IF FOUND THEN
  IF v_row.organization_id<>v_actor.org_id OR v_row.entity_id<>p_order_id
   OR v_row.storage_bucket<>'wos-private' OR v_row.storage_path<>p_storage_path
   OR v_row.category<>p_category OR v_row.image_status<>'READY'
   OR v_row.version_label<>v_order.version_label
  THEN RAISE EXCEPTION 'IMAGE_ID_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('status','REPLAYED','imageId',v_row.id,'bucket','wos-private');
 END IF;
 -- Must be enforced inside the privileged RPC: a directly authenticated
 -- PostgREST caller cannot mint a byte-proof (proof table write privileges
 -- are withheld from anon/authenticated).
 IF v_mime<>'image/png'
 THEN RAISE EXCEPTION 'QA_TRUSTED_PNG_ONLY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_qa_verified_image_proofs proof
   WHERE proof.image_id=p_image_id
     AND proof.order_id=p_order_id
     AND proof.organization_id=v_actor.org_id
     AND proof.actor_user_id=auth.uid()
     AND proof.storage_bucket='wos-private'
     AND proof.storage_path=p_storage_path
     AND proof.storage_object_id=v_object.id
     AND proof.storage_object_version IS NOT DISTINCT FROM v_object.version
     AND proof.storage_object_updated_at IS NOT DISTINCT FROM v_object.updated_at
     AND proof.expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'QA_TRUSTED_BINARY_PROOF_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,'wos-private',
 p_storage_path,v_filename,v_mime,v_size,v_order.version_label,'READY',v_actor.id);
 RETURN jsonb_build_object('status','CREATED','imageId',p_image_id,'bucket','wos-private');
END $fn$;

-- Existing general-purpose direct image inserts could claim READY without
-- a real Storage object. For this isolated QA rollout, RPC is authoritative.
REVOKE INSERT ON public.wos_reference_images FROM authenticated;
REVOKE ALL ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 TO authenticated;
