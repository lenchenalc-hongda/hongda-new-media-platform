-- Isolated QA only. Pause / fail closed during an active Storage cleanup lease.
BEGIN;
DO $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.wos_production_orders
 WHERE order_number LIKE 'QA-NONPROD-%') THEN
 RAISE EXCEPTION 'WOS_QA_SYNTHETIC_DATABASE_REQUIRED';END IF;END $qa$;
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

CREATE OR REPLACE FUNCTION public.wos_submit_production_order(
 p_order_id uuid,p_expected_revision integer,p_expected_label text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_receipt public.wos_submission_receipts%ROWTYPE;
 v_inbox_id uuid;
 v_readiness uuid;
 v_fingerprint text;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_idempotency_key IS NULL
 OR p_expected_revision IS NULL OR p_expected_revision<1 OR
 p_expected_label !~ '^V[1-9][0-9]{0,20}$'
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 v_fingerprint:=encode(sha256(convert_to(
  jsonb_build_object('orderId',p_order_id,'version',p_expected_revision,
   'versionLabel',p_expected_label)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('wos-p7-receipt:'||p_idempotency_key::text,0));
 SELECT * INTO v_receipt FROM public.wos_submission_receipts WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN
   IF v_receipt.organization_id<>v_actor.org_id OR v_receipt.actor_profile_id<>v_actor.id
     OR v_receipt.order_id<>p_order_id OR v_receipt.source_revision<>p_expected_revision
     OR v_receipt.source_version_label<>p_expected_label
     OR v_receipt.request_fingerprint<>v_fingerprint
   THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
   SELECT id INTO v_inbox_id FROM public.wos_workshop_inbox WHERE submission_id=v_receipt.id;
   IF v_inbox_id IS NULL THEN RAISE EXCEPTION 'INCOMPLETE_RECEIPT' USING ERRCODE='23514'; END IF;
   RETURN jsonb_build_object('status','REPLAYED','orderId',p_order_id,
     'receiptId',v_receipt.id,'inboxTaskId',v_inbox_id,
     'sourceRevision',v_receipt.source_revision,'submittedAt',v_receipt.created_at);
 END IF;
 SELECT * INTO v_order FROM public.wos_production_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
  OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
       AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_revision
  OR v_order.version_label<>p_expected_label
 THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT id INTO v_readiness FROM public.wos_office_readiness_receipts
 WHERE organization_id=v_actor.org_id AND order_id=p_order_id
 AND source_revision=p_expected_revision AND source_version_label=p_expected_label;
 IF v_readiness IS NULL THEN RAISE EXCEPTION 'OFFICE_READINESS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
    WHERE c.order_id=p_order_id AND c.state='CLAIMED'
      AND c.lease_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'QA_ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.wos_submission_receipts(
 organization_id,order_id,source_revision,source_version_label,idempotency_key,
 actor_profile_id,request_fingerprint)
 VALUES(v_actor.org_id,p_order_id,p_expected_revision,p_expected_label,p_idempotency_key,
 v_actor.id,v_fingerprint) RETURNING * INTO v_receipt;
 UPDATE public.wos_production_orders SET workflow_status='SUBMITTED',
 submitted_at=v_receipt.created_at,version=version+1,updated_at=now()
 WHERE id=p_order_id AND organization_id=v_actor.org_id AND version=p_expected_revision
 AND workflow_status='DRAFT';
 IF NOT FOUND THEN RAISE EXCEPTION 'CONCURRENT_VERSION_CHANGE' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.wos_workshop_inbox(
 organization_id,order_id,submission_id,source_revision,source_version_label)
 VALUES(v_actor.org_id,p_order_id,v_receipt.id,p_expected_revision,p_expected_label)
 RETURNING id INTO v_inbox_id;
 INSERT INTO public.wos_status_history(
 organization_id,entity_type,entity_id,previous_status,next_status,
 actor_profile_id,actor_role,reason_code,metadata)
 VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'DRAFT','SUBMITTED',
 v_actor.id,v_actor.role,'OFFICE_SUBMISSION_COMMITTED',
 jsonb_build_object('readinessId',v_readiness,'receiptId',v_receipt.id,
 'inboxTaskId',v_inbox_id,'sourceRevision',p_expected_revision,'idempotencyKey',p_idempotency_key));
 RETURN jsonb_build_object('status','CREATED','orderId',p_order_id,
 'receiptId',v_receipt.id,'inboxTaskId',v_inbox_id,
 'sourceRevision',p_expected_revision,'submittedAt',v_receipt.created_at);
END $fn$;

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
 IF EXISTS (SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
   WHERE c.storage_object_id=obj.id AND c.state='CLAIMED'
     AND c.lease_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'QA_ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('id',obj.id,'ownerId',obj.owner_id,
  'version',obj.version,'updatedAt',obj.updated_at,
  'mimeType',obj.metadata->>'mimetype','byteSize',obj.metadata->>'size');
END $wos$;
REVOKE ALL ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 TO authenticated;
REVOKE ALL ON FUNCTION public.wos_submit_production_order(uuid,integer,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_submit_production_order(uuid,integer,text,uuid)
 TO authenticated;
REVOKE ALL ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_get_storage_object_for_proof(text)
 TO service_role;
COMMIT;
