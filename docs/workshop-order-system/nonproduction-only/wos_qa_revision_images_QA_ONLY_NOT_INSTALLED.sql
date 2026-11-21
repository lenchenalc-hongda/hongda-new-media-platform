-- QA-ONLY / NOT INSTALLED / NOT AUTHORIZED.
-- Enables Office revision images for the exact QA-R* version while preserving
-- private Storage RLS, trusted Edge proof, object identity/version and SHA.
BEGIN;

CREATE SCHEMA IF NOT EXISTS wos_qa_safety;
REVOKE ALL ON SCHEMA wos_qa_safety FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS wos_qa_safety.wos_proof_guard_backup (
 function_oid oid PRIMARY KEY,
 function_definition text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON TABLE wos_qa_safety.wos_proof_guard_backup
 FROM PUBLIC,anon,authenticated,service_role;
DO $backup$
DECLARE v_oid oid;
BEGIN
 SELECT p.oid INTO v_oid
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='wos_qa_proof_write_guard'
   AND p.pronargs=0
 LIMIT 1;
 IF v_oid IS NOT NULL THEN
  INSERT INTO wos_qa_safety.wos_proof_guard_backup(
    function_oid,function_definition)
  SELECT v_oid,pg_catalog.pg_get_functiondef(v_oid)
  ON CONFLICT(function_oid) DO NOTHING;
 END IF;
END $backup$;

CREATE TABLE IF NOT EXISTS public.wos_qa_trusted_proof_receipts (
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
 image_id uuid NOT NULL,
 actor_user_id uuid NOT NULL,
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 expected_version integer NOT NULL CHECK (expected_version>0),
 payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
 proof_status text NOT NULL CHECK (proof_status IN ('CREATED','UPDATED')),
 before_sha256 text,
 after_sha256 text NOT NULL CHECK (after_sha256 ~ '^[a-f0-9]{64}$'),
 storage_object_id uuid NOT NULL,
 storage_object_version text,
 storage_object_updated_at timestamptz NOT NULL,
 result_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.wos_qa_trusted_proof_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_trusted_proof_receipts
 FROM PUBLIC,anon,authenticated,service_role;

-- The real QA trigger name is retained. The previous round's second trigger
-- and the M2-side proof trigger are removed so exactly one proof guard remains.
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_write_guard
 ON public.wos_qa_verified_image_proofs;
DROP TRIGGER IF EXISTS wos_qa_p2_m2_verified_proof_guard
 ON public.wos_qa_verified_image_proofs;
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard
 ON public.wos_qa_verified_image_proofs;

CREATE OR REPLACE FUNCTION public.wos_qa_revision_gate_allows(
 p_order_id uuid,p_org_id uuid,p_actor_profile_id uuid
) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE
AS $gate$
 SELECT EXISTS (
  SELECT 1
  FROM public.profiles p
  JOIN public.wos_production_orders po
    ON po.id=p_order_id AND po.organization_id=p_org_id
  JOIN public.wos_qa_p2_m2_gate g
    ON g.gate_name='M2_OFFICE_WRITES'
  WHERE p.id=p_actor_profile_id AND p.user_id IS NOT NULL
    AND p.is_active=true AND p.org_id=p_org_id
    AND p.role IN ('admin','manager','sales')
    AND (auth.uid() IS NULL OR p.user_id=auth.uid())
    AND (p.role<>'sales' OR p.id IN
      (po.created_by_profile_id,po.sales_owner_profile_id))
    AND po.order_number LIKE 'QA-NONPROD-%'
    AND po.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')
    AND po.version_label ~ '^QA-R[1-9][0-9]*$'
    AND g.enabled=true
    AND g.enabled_until>clock_timestamp()
    AND g.enabled_until<=clock_timestamp()+interval '15 minutes'
    AND g.approval_reference<>'NOT_AUTHORIZED'
    AND g.allowed_order_id=po.id
    AND g.allowed_organization_id=po.organization_id
 )
$gate$;
REVOKE ALL ON FUNCTION public.wos_qa_revision_gate_allows(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_revision_gate_allows(uuid,uuid,uuid)
 TO authenticated,service_role;

DROP POLICY IF EXISTS wos_qa_revision_object_insert ON storage.objects;
CREATE POLICY wos_qa_revision_object_insert ON storage.objects
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
 AND storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.png$'
 AND position('..' in storage.filename(name))=0
 AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.wos_production_orders po
   ON po.organization_id=p.org_id
  WHERE p.user_id=auth.uid() AND p.is_active
    AND p.role IN ('admin','manager','sales')
    AND p.org_id::text=(storage.foldername(name))[2]
    AND po.id::text=(storage.foldername(name))[5]
    AND po.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')
    AND po.version_label=(storage.foldername(name))[9]
    AND (p.role<>'sales' OR p.id IN
      (po.created_by_profile_id,po.sales_owner_profile_id))
    AND public.wos_qa_revision_gate_allows(po.id,po.organization_id,p.id)
 )
);

CREATE OR REPLACE FUNCTION public.wos_qa_proof_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE
 v_obj storage.objects%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_profile public.profiles%ROWTYPE;
BEGIN
 IF pg_catalog.current_setting('wos.qa.trusted_proof_rpc',true)
      IS DISTINCT FROM '1'
    OR pg_catalog.current_setting('wos.qa.actor_user_id',true)
      IS DISTINCT FROM NEW.actor_user_id::text
 THEN RAISE EXCEPTION 'TRUSTED_PROOF_RPC_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id=NEW.order_id AND organization_id=NEW.organization_id;
 IF NOT FOUND OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
 THEN RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_AUTHORIZED' USING ERRCODE='23514'; END IF;
 IF v_order.workflow_status='DRAFT' THEN
   NULL;
 ELSIF v_order.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')
   AND v_order.version_label ~ '^QA-R[1-9][0-9]*$' THEN
   SELECT * INTO v_profile FROM public.profiles
    WHERE user_id=NEW.actor_user_id AND is_active=true
      AND role IN ('admin','manager','sales')
      AND (auth.uid() IS NULL OR user_id=auth.uid()) LIMIT 1;
   IF v_profile.id IS NULL OR v_profile.org_id<>v_order.organization_id
     OR (v_profile.role='sales' AND v_profile.id NOT IN
       (v_order.created_by_profile_id,v_order.sales_owner_profile_id))
     OR NOT public.wos_qa_revision_gate_allows(
       v_order.id,v_order.organization_id,v_profile.id)
   THEN RAISE EXCEPTION 'QA_REVISION_PROOF_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
   RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_EDITABLE' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_obj FROM storage.objects
  WHERE id=NEW.storage_object_id AND name=NEW.storage_path
    AND bucket_id='wos-private' AND is_delete_marker=false
    AND archived_at IS NULL;
 IF NOT FOUND OR v_obj.version IS DISTINCT FROM NEW.storage_object_version
   OR v_obj.updated_at IS DISTINCT FROM NEW.storage_object_updated_at
   OR v_obj.owner_id IS DISTINCT FROM NEW.actor_user_id::text
 THEN RAISE EXCEPTION 'QA_PROOF_OBJECT_CHANGED' USING ERRCODE='23514'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
   WHERE c.storage_object_id=v_obj.id AND c.state='CLAIMED'
     AND c.lease_expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.wos_qa_proof_write_guard()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_proof_write_guard()
 TO service_role;
CREATE TRIGGER wos_qa_trusted_proof_guard
BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION public.wos_qa_proof_write_guard();

CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_record_trusted_proof(
 p_request_id uuid,p_order_id uuid,p_image_id uuid,p_category text,
 p_actor_user_id uuid,p_expected_version integer,p_storage_path text,
 p_storage_object_id uuid,p_storage_object_version text,
 p_storage_object_updated_at timestamptz,p_verified_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $proof_fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_object storage.objects%ROWTYPE;
 v_existing public.wos_qa_verified_image_proofs%ROWTYPE;
 v_receipt public.wos_qa_trusted_proof_receipts%ROWTYPE;
 v_slug text;
 v_prefix text;
 v_filename text;
 v_expected_path text;
 v_fingerprint text;
 v_proof_status text;
 v_before_sha text;
 v_result jsonb;
 v_order_version integer;
 v_proof_expires_at timestamptz;
 v_rows integer;
BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN
   RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_order_id IS NULL OR p_image_id IS NULL
   OR p_actor_user_id IS NULL OR p_expected_version IS NULL
   OR p_expected_version<1 OR p_storage_object_id IS NULL
   OR p_storage_object_updated_at IS NULL
   OR p_category NOT IN ('PRODUCT','FILM_PATTERN','CUSTOMER_APPROVED_SAMPLE','SIGNED_SAMPLE')
   OR p_verified_sha256 IS NULL OR p_verified_sha256 !~ '^[a-f0-9]{64}$'
   OR p_storage_path IS NULL OR pg_catalog.length(p_storage_path)>1024
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_actor FROM public.profiles
  WHERE user_id=p_actor_user_id AND is_active=true
    AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'TRUSTED_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 v_fingerprint:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object(
     'requestId',p_request_id,'orderId',p_order_id,'imageId',p_image_id,
     'category',p_category,'actorUserId',p_actor_user_id,
     'expectedVersion',p_expected_version,'storagePath',p_storage_path,
     'objectId',p_storage_object_id,'objectVersion',p_storage_object_version,
     'objectUpdatedAt',p_storage_object_updated_at,'sha256',p_verified_sha256
   )::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('wos-qa-m2:'||p_order_id::text,0));
 SELECT * INTO v_receipt FROM public.wos_qa_trusted_proof_receipts
  WHERE request_id=p_request_id FOR UPDATE;
 IF FOUND THEN
   IF v_receipt.organization_id<>v_actor.org_id
     OR v_receipt.order_id<>p_order_id OR v_receipt.image_id<>p_image_id
     OR v_receipt.actor_user_id<>p_actor_user_id
     OR v_receipt.expected_version<>p_expected_version
     OR v_receipt.payload_fingerprint<>v_fingerprint
   THEN RAISE EXCEPTION 'PROOF_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN v_receipt.result_json
     ||pg_catalog.jsonb_build_object('status','REPLAYED');
 END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
 IF NOT FOUND OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
   OR v_order.version<>p_expected_version
 THEN RAISE EXCEPTION 'ORDER_VERSION_OR_SCOPE_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF v_order.workflow_status='DRAFT' THEN
   IF v_order.version_label !~ '^V[1-9][0-9]{0,20}$' THEN
     RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514'; END IF;
 ELSIF v_order.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')
   AND v_order.version_label ~ '^QA-R[1-9][0-9]*$' THEN
   IF NOT public.wos_qa_revision_gate_allows(
     v_order.id,v_order.organization_id,v_actor.id)
   THEN RAISE EXCEPTION 'QA_REVISION_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 ELSE
   RAISE EXCEPTION 'PROOF_ORDER_NOT_EDITABLE' USING ERRCODE='23514';
 END IF;
 IF v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
   AND v_actor.id<>v_order.sales_owner_profile_id
 THEN RAISE EXCEPTION 'TRUSTED_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 v_slug:=CASE p_category
   WHEN 'PRODUCT' THEN 'product'
   WHEN 'FILM_PATTERN' THEN 'film-pattern'
   WHEN 'CUSTOMER_APPROVED_SAMPLE' THEN 'customer-approved-sample'
   WHEN 'SIGNED_SAMPLE' THEN 'signed-sample'
 END;
 v_prefix:='organizations/'||v_order.organization_id::text
   ||'/wos/production-order/'||v_order.id::text||'/images/'||v_slug
   ||'/versions/'||v_order.version_label||'/'||p_image_id::text||'/';
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 v_expected_path:=v_prefix||'qa-preview-proof.png';
 IF p_storage_path<>v_expected_path
   OR v_filename<>'qa-preview-proof.png'
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_object FROM storage.objects
  WHERE id=p_storage_object_id AND name=p_storage_path
    AND bucket_id='wos-private' AND owner_id=p_actor_user_id::text
    AND is_delete_marker=false AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND OR v_object.version IS DISTINCT FROM p_storage_object_version
   OR v_object.updated_at IS DISTINCT FROM p_storage_object_updated_at
   OR v_object.metadata->>'mimetype'<>'image/png'
   OR COALESCE(v_object.metadata->>'size','') !~ '^[0-9]+$'
   OR (v_object.metadata->>'size')::bigint NOT BETWEEN 60 AND 20971520
 THEN RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED' USING ERRCODE='23514'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
   WHERE c.storage_object_id=v_object.id AND c.state='CLAIMED'
     AND c.lease_expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v_existing FROM public.wos_qa_verified_image_proofs
  WHERE image_id=p_image_id FOR UPDATE;
 v_proof_status:=CASE WHEN FOUND THEN 'UPDATED' ELSE 'CREATED' END;
 IF FOUND THEN
   IF v_existing.organization_id<>v_order.organization_id
     OR v_existing.order_id<>p_order_id
     OR v_existing.storage_path<>p_storage_path
   THEN RAISE EXCEPTION 'PROOF_IMAGE_CONFLICT' USING ERRCODE='23505'; END IF;
   v_before_sha:=v_existing.verified_sha256;
 END IF;
 PERFORM pg_catalog.set_config(
   'wos.qa.actor_user_id',p_actor_user_id::text,true);
 PERFORM pg_catalog.set_config('wos.qa.trusted_proof_rpc','1',true);
 INSERT INTO public.wos_qa_verified_image_proofs(
   image_id,organization_id,order_id,actor_user_id,storage_bucket,storage_path,
   storage_object_id,storage_object_version,storage_object_updated_at,
   verified_sha256,verified_at,expires_at)
 VALUES(
   p_image_id,v_order.organization_id,p_order_id,p_actor_user_id,'wos-private',
   p_storage_path,p_storage_object_id,p_storage_object_version,
   p_storage_object_updated_at,p_verified_sha256,clock_timestamp(),
   clock_timestamp()+interval '10 minutes')
 ON CONFLICT(image_id) DO UPDATE SET
   organization_id=EXCLUDED.organization_id,
   order_id=EXCLUDED.order_id,
   actor_user_id=EXCLUDED.actor_user_id,
   storage_bucket=EXCLUDED.storage_bucket,
   storage_path=EXCLUDED.storage_path,
   storage_object_id=EXCLUDED.storage_object_id,
   storage_object_version=EXCLUDED.storage_object_version,
   storage_object_updated_at=EXCLUDED.storage_object_updated_at,
   verified_sha256=EXCLUDED.verified_sha256,
   verified_at=EXCLUDED.verified_at,
   expires_at=EXCLUDED.expires_at
 WHERE wos_qa_verified_image_proofs.order_id=EXCLUDED.order_id
 RETURNING expires_at INTO v_proof_expires_at;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN
   RAISE EXCEPTION 'PROOF_ORDER_CONFLICT' USING ERRCODE='42501'; END IF;
 PERFORM public.wos_qa_p2_m2_invalidate_signoff(
   v_order.id,v_order.organization_id,p_image_id);
 SELECT version INTO v_order_version FROM public.wos_production_orders
  WHERE id=v_order.id AND organization_id=v_order.organization_id;
 v_result:=pg_catalog.jsonb_build_object(
   'status',v_proof_status,'requestId',p_request_id,
   'orderId',p_order_id,'imageId',p_image_id,
   'organizationId',v_order.organization_id,
   'actorUserId',p_actor_user_id,'actorProfileId',v_actor.id,
   'expectedVersion',p_expected_version,'orderVersionAfter',v_order_version,
   'sha256',p_verified_sha256,'proofExpiresAt',v_proof_expires_at,
   'canStart',false);
 INSERT INTO public.wos_qa_trusted_proof_receipts(
   request_id,organization_id,order_id,image_id,actor_user_id,actor_profile_id,
   expected_version,payload_fingerprint,proof_status,before_sha256,after_sha256,
   storage_object_id,storage_object_version,storage_object_updated_at,result_json)
 VALUES(
   p_request_id,v_order.organization_id,p_order_id,p_image_id,p_actor_user_id,
   v_actor.id,p_expected_version,v_fingerprint,v_proof_status,v_before_sha,
   p_verified_sha256,p_storage_object_id,p_storage_object_version,
   p_storage_object_updated_at,v_result);
 RETURN v_result;
END;
$proof_fn$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_record_trusted_proof(
 uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_record_trusted_proof(
 uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.wos_register_qa_revision_image(
 p_order_id uuid,p_image_id uuid,p_category text,p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_object storage.objects%ROWTYPE;
 v_existing public.wos_reference_images%ROWTYPE;
 v_previous_image_id uuid;
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
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('wos-qa-m2:'||p_order_id::text,0));
 SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
   OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
   OR v_order.workflow_status NOT IN ('WAITING_MATERIAL','READINESS_CHECK')
   OR v_order.version_label !~ '^QA-R[1-9][0-9]*$'
   OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
       AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF NOT public.wos_qa_revision_gate_allows(
   v_order.id,v_order.organization_id,v_actor.id)
 THEN RAISE EXCEPTION 'QA_REVISION_GATE_CLOSED' USING ERRCODE='42501'; END IF;
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
    AND archived_at IS NULL FOR SHARE;
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
 SELECT id INTO v_previous_image_id
 FROM public.wos_reference_images
 WHERE organization_id=v_actor.org_id
   AND entity_type='PRODUCTION_ORDER' AND entity_id=p_order_id
   AND category=p_category AND version_label=v_order.version_label
   AND image_status='READY' AND superseded_at IS NULL
   AND id<>p_image_id
 ORDER BY uploaded_at DESC,id DESC
 LIMIT 1 FOR UPDATE;
 IF v_previous_image_id IS NOT NULL THEN
  UPDATE public.wos_reference_images
  SET image_status='SUPERSEDED',superseded_at=clock_timestamp()
  WHERE id=v_previous_image_id
    AND organization_id=v_actor.org_id
    AND entity_id=p_order_id
    AND category=p_category
    AND version_label=v_order.version_label
    AND image_status='READY' AND superseded_at IS NULL;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'IMAGE_SUPERSESSION_CONFLICT' USING ERRCODE='PT409';
  END IF;
 END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,supersedes_image_id,
  uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,
  'wos-private',p_storage_path,v_filename,'image/png',
  (v_object.metadata->>'size')::bigint,v_order.version_label,'READY',
  v_previous_image_id,v_actor.id);
 RETURN jsonb_build_object('status','CREATED','imageId',p_image_id,
  'supersededImageId',v_previous_image_id);
END $fn$;

REVOKE ALL ON FUNCTION public.wos_register_qa_revision_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_qa_revision_image(uuid,uuid,text,text)
 TO authenticated;

REVOKE INSERT ON public.wos_reference_images FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE
 ON public.wos_qa_verified_image_proofs FROM service_role;
COMMIT;
