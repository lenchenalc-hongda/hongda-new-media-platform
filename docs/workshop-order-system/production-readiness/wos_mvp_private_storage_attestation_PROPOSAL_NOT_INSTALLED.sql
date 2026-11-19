-- WOS P0-02-02: private Storage + Edge byte-proof candidate, proposal ONLY.
-- This file may ONLY run against disposable, synthetic PostgreSQL 17 rehearsal.
-- A real QA deployment requires a SEPARATELY REVIEWED installation package and
-- precise Owner approval. DO NOT run against persistent QA or Production.
-- The existing synthetic proof table NEVER satisfies the verified submit RPC.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $gate$
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'WOS_REAL_STORAGE_PROOF_PROPOSAL_NOT_AUTHORIZED';
 END IF;
 IF to_regclass('storage.objects') IS NULL
 OR to_regclass('public.wos_production_orders') IS NULL
 OR to_regclass('public.wos_reference_images') IS NULL THEN
  RAISE EXCEPTION 'WOS_STORAGE_DEPENDENCY_MISSING';
 END IF;
END $gate$;
CREATE SCHEMA wos_mvp_attestation;
REVOKE ALL ON SCHEMA wos_mvp_attestation FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA wos_mvp_attestation TO authenticated;
CREATE TABLE wos_mvp_attestation.private_image_proofs(
 image_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 order_version integer NOT NULL CHECK(order_version>=1),
 version_label text NOT NULL CHECK(version_label ~ '^V[1-9][0-9]{0,20}$'),
 actor_user_id uuid NOT NULL,
 storage_bucket text NOT NULL DEFAULT 'wos-private' CHECK(storage_bucket='wos-private'),
 storage_path text NOT NULL UNIQUE,
 storage_object_id uuid NOT NULL,
 storage_object_version text,
 storage_object_updated_at timestamptz NOT NULL,
 mime_type text NOT NULL CHECK(mime_type='image/png'),
 byte_size bigint NOT NULL CHECK(byte_size BETWEEN 60 AND 20971520),
 verified_sha256 text NOT NULL CHECK(verified_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(order_id,organization_id)
  REFERENCES public.wos_production_orders(id,organization_id),
 CHECK(expires_at>verified_at AND expires_at<=verified_at+interval '10 minutes')
);
CREATE INDEX wos_mvp_private_proofs_order_version
 ON wos_mvp_attestation.private_image_proofs(order_id,order_version,expires_at);
ALTER TABLE wos_mvp_attestation.private_image_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wos_mvp_attestation.private_image_proofs
 FROM PUBLIC,anon,authenticated,service_role;
-- No direct table grants even to service_role. Only dedicated audited RPCs.

-- For Edge's service-scoped metadata checks. NEVER returns image bytes.
CREATE FUNCTION public.wos_mvp_storage_snapshot_candidate(p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $snapshot$
DECLARE v_obj storage.objects%ROWTYPE; v_size text;
BEGIN
 IF p_storage_path IS NULL OR length(p_storage_path)>700
 OR p_storage_path NOT LIKE 'organizations/%/wos/production-order/%/images/product/versions/%'
 THEN RAISE EXCEPTION 'STORAGE_PATH_DENIED' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_obj FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_storage_path
 AND is_delete_marker=false AND archived_at IS NULL;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_size:=v_obj.metadata->>'size';
 IF v_obj.metadata->>'mimetype'<>'image/png' OR
  v_size IS NULL OR v_size !~ '^[0-9]{1,8}$'
  OR v_size::bigint NOT BETWEEN 60 AND 20971520 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v_obj.id,'ownerId',v_obj.owner_id,
  'objectVersion',v_obj.version,'objectUpdatedAt',v_obj.updated_at,
  'mimeType','image/png','byteSize',v_size::bigint);
END $snapshot$;
REVOKE ALL ON FUNCTION public.wos_mvp_storage_snapshot_candidate(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_mvp_storage_snapshot_candidate(text)
 TO service_role;

CREATE FUNCTION public.wos_mvp_commit_image_proof_candidate(
 p_order_id uuid, p_image_id uuid, p_actor_user_id uuid,
 p_expected_version integer, p_storage_path text,
 p_verified_sha256 text, p_storage_object_id uuid,
 p_storage_object_version text, p_storage_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $commitproof$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_obj storage.objects%ROWTYPE;
 v_prefix text;
 v_filename text;
 v_mime text;
 v_size text;
 v_count integer;
BEGIN
 -- Defense in depth: even service_role cannot turn this synthetic candidate on
 -- in persistent QA or Production by merely installing the SQL file.
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'PROOF_WRITER_DISABLED' USING ERRCODE='42501'; END IF;
 IF p_image_id IS NULL OR p_order_id IS NULL OR p_actor_user_id IS NULL
 OR p_expected_version IS NULL OR p_expected_version<1
 OR p_storage_object_id IS NULL OR p_storage_updated_at IS NULL
 OR p_verified_sha256 !~ '^[a-f0-9]{64}$'
 OR p_storage_path IS NULL OR length(p_storage_path)>700
 THEN RAISE EXCEPTION 'PROOF_INPUT_DENIED' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=p_actor_user_id AND is_active=true
  AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id FOR SHARE;
 IF NOT FOUND OR v_order.workflow_status<>'DRAFT'
 OR v_order.version<>p_expected_version
 OR (v_actor.role='sales' AND v_order.sales_owner_profile_id<>v_actor.id
 AND v_order.created_by_profile_id<>v_actor.id)
 THEN RAISE EXCEPTION 'ORDER_SCOPE_OR_VERSION_DENIED' USING ERRCODE='42501'; END IF;
 v_prefix:='organizations/'||v_actor.org_id::text||
  '/wos/production-order/'||p_order_id::text||
  '/images/product/versions/'||v_order.version_label||
  '/'||p_image_id::text||'/';
 IF left(p_storage_path,length(v_prefix))<>v_prefix
 THEN RAISE EXCEPTION 'IMAGE_PATH_SCOPE_DENIED' USING ERRCODE='23514';END IF;
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.png$'
 OR position('..' in v_filename)>0
 THEN RAISE EXCEPTION 'IMAGE_FILENAME_DENIED' USING ERRCODE='23514';END IF;
 SELECT * INTO v_obj FROM storage.objects
 WHERE id=p_storage_object_id AND bucket_id='wos-private'
 AND name=p_storage_path AND owner_id=p_actor_user_id::text
 AND is_delete_marker=false AND archived_at IS NULL
 AND version IS NOT DISTINCT FROM p_storage_object_version
 AND updated_at=p_storage_updated_at FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_IDENTITY_CHANGED' USING ERRCODE='PT409';END IF;
 v_mime:=v_obj.metadata->>'mimetype';
 v_size:=v_obj.metadata->>'size';
 IF v_mime<>'image/png' OR v_size IS NULL OR v_size !~ '^[0-9]{1,8}$'
 OR v_size::bigint NOT BETWEEN 60 AND 20971520
 THEN RAISE EXCEPTION 'INVALID_STORAGE_BINARY_METADATA' USING ERRCODE='23514';END IF;
 INSERT INTO wos_mvp_attestation.private_image_proofs (
  image_id,organization_id,order_id,order_version,version_label,actor_user_id,
  storage_bucket,storage_path,storage_object_id,storage_object_version,
  storage_object_updated_at,mime_type,byte_size,verified_sha256,
  verified_at,expires_at)
 VALUES(p_image_id,v_actor.org_id,p_order_id,v_order.version,v_order.version_label,
  p_actor_user_id,'wos-private',p_storage_path,v_obj.id,v_obj.version,v_obj.updated_at,
  'image/png',v_size::bigint,p_verified_sha256,
  clock_timestamp(),clock_timestamp()+interval '9 minutes')
 ON CONFLICT(image_id) DO UPDATE SET
  verified_at=EXCLUDED.verified_at, expires_at=EXCLUDED.expires_at
 WHERE private_image_proofs.order_id=EXCLUDED.order_id
 AND private_image_proofs.organization_id=EXCLUDED.organization_id
 AND private_image_proofs.order_version=EXCLUDED.order_version
 AND private_image_proofs.version_label=EXCLUDED.version_label
 AND private_image_proofs.actor_user_id=EXCLUDED.actor_user_id
 AND private_image_proofs.storage_path=EXCLUDED.storage_path
 AND private_image_proofs.storage_object_id=EXCLUDED.storage_object_id
 AND private_image_proofs.storage_object_version IS NOT DISTINCT FROM EXCLUDED.storage_object_version
 AND private_image_proofs.storage_object_updated_at=EXCLUDED.storage_object_updated_at
 AND private_image_proofs.verified_sha256=EXCLUDED.verified_sha256
 RETURNING 1 INTO v_count;
 IF v_count IS NULL THEN RAISE EXCEPTION 'PROOF_ID_REBIND_DENIED' USING ERRCODE='23505';END IF;
 RETURN jsonb_build_object('result','PROOF_COMMITTED','orderId',p_order_id,
  'imageId',p_image_id,'expectedVersion',v_order.version);
END $commitproof$;
REVOKE ALL ON FUNCTION public.wos_mvp_commit_image_proof_candidate(
 uuid,uuid,uuid,integer,text,text,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_mvp_commit_image_proof_candidate(
 uuid,uuid,uuid,integer,text,text,uuid,text,timestamptz) TO service_role;

-- Browser can never register a READY row from its own SHA/path.
-- This checks a server-only proof and *current* Storage identity in the same transaction.
CREATE FUNCTION public.wos_mvp_register_image_candidate(
 p_order_id uuid,p_image_id uuid,p_expected_version integer,p_storage_path text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $register$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_proof wos_mvp_attestation.private_image_proofs%ROWTYPE;
 v_obj storage.objects%ROWTYPE;
 v_found public.wos_reference_images%ROWTYPE;
 v_filename text;
 v_prefix text;
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'REGISTER_DISABLED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true
 AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTOR_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
 IF NOT FOUND OR v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_version
 OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
   AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'ORDER_VERSION_OR_ROLE_DENIED' USING ERRCODE='PT409'; END IF;
 v_prefix:='organizations/'||v_actor.org_id::text||
 '/wos/production-order/'||p_order_id::text||
 '/images/product/versions/'||v_order.version_label||'/'||p_image_id::text||'/';
 IF p_storage_path IS NULL OR left(p_storage_path,length(v_prefix))<>v_prefix
 THEN RAISE EXCEPTION 'PATH_SCOPE_DENIED' USING ERRCODE='23514';END IF;
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.png$'
 OR position('..' in v_filename)>0
 THEN RAISE EXCEPTION 'IMAGE_NAME_DENIED' USING ERRCODE='23514';END IF;
 SELECT * INTO v_proof FROM wos_mvp_attestation.private_image_proofs
 WHERE image_id=p_image_id AND order_id=p_order_id
 AND organization_id=v_actor.org_id AND order_version=p_expected_version
 AND version_label=v_order.version_label AND actor_user_id=auth.uid()
 AND storage_bucket='wos-private' AND storage_path=p_storage_path
 AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BINARY_PROOF_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO v_obj FROM storage.objects
 WHERE id=v_proof.storage_object_id AND bucket_id='wos-private'
 AND name=v_proof.storage_path AND owner_id=auth.uid()::text
 AND version IS NOT DISTINCT FROM v_proof.storage_object_version
 AND updated_at=v_proof.storage_object_updated_at
 AND is_delete_marker=false AND archived_at IS NULL
 AND metadata->>'mimetype'='image/png'
 AND metadata->>'size'=v_proof.byte_size::text FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_OBJECT_CHANGED' USING ERRCODE='PT409';END IF;
 SELECT * INTO v_found FROM public.wos_reference_images WHERE id=p_image_id;
 IF FOUND THEN
  IF v_found.organization_id<>v_actor.org_id OR v_found.entity_id<>p_order_id
  OR v_found.storage_path<>p_storage_path OR v_found.version_label<>v_order.version_label
  OR v_found.image_status<>'READY' OR v_found.uploaded_by_profile_id<>v_actor.id
  THEN RAISE EXCEPTION 'REGISTER_IMAGE_REPLAY_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('result','REPLAYED','orderId',p_order_id,
    'imageId',p_image_id,'version',p_expected_version);
 END IF;
 INSERT INTO public.wos_reference_images(
 id,organization_id,entity_type,entity_id,category,
 storage_bucket,storage_path,file_name,mime_type,file_size,
 version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'PRODUCT',
 'wos-private',p_storage_path,v_filename,'image/png',v_proof.byte_size,
 v_order.version_label,'READY',v_actor.id);
 RETURN jsonb_build_object('result','REGISTERED','orderId',p_order_id,
  'imageId',p_image_id,'version',p_expected_version);
END $register$;
REVOKE ALL ON FUNCTION public.wos_mvp_register_image_candidate(uuid,uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_mvp_register_image_candidate(uuid,uuid,integer,text)
 TO authenticated;

-- A separate strict first-submit RPC is mandatory. It never reads the old
-- synthetic_private_image_proofs table. The public wrapper is invoker-scoped.
CREATE FUNCTION wos_mvp_attestation.submit_first_order_with_storage_proof(
 p_order_id uuid,p_expected_version integer,p_idempotency_key uuid,p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog'
AS $body$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_prior public.wos_submission_receipts%ROWTYPE;
 v_receipt_id uuid;
 v_inbox_id uuid;
 v_fingerprint text;
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'WOS_SUBMIT_RUNTIME_LOCKED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true AND role IN ('admin','manager','sales');
 IF NOT FOUND THEN RAISE EXCEPTION 'WOS_SUBMIT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_idempotency_key IS NULL OR p_expected_version<1
 OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000
 THEN RAISE EXCEPTION 'WOS_SUBMIT_INVALID' USING ERRCODE='22023'; END IF;
 v_fingerprint:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object('orderId',p_order_id,'version',p_expected_version,
     'note',p_note)::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-submit:'||p_idempotency_key::text,0));
 SELECT * INTO v_prior FROM public.wos_submission_receipts
 WHERE organization_id=v_actor.org_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF v_prior.actor_profile_id<>v_actor.id OR v_prior.order_id<>p_order_id
    OR v_prior.source_revision<>p_expected_version
    OR v_prior.request_fingerprint<>v_fingerprint
  THEN RAISE EXCEPTION 'WOS_SUBMIT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT id INTO v_inbox_id FROM public.wos_workshop_inbox
  WHERE submission_id=v_prior.id AND order_id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WOS_INCOMPLETE_SUBMISSION' USING ERRCODE='23514'; END IF;
  RETURN pg_catalog.jsonb_build_object('result','REPLAYED','orderId',p_order_id,
    'receiptId',v_prior.id,'inboxTaskId',v_inbox_id);
 END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
 OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
 AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'WOS_SUBMIT_ORDER_DENIED' USING ERRCODE='42501'; END IF;
 IF v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_version
 THEN RAISE EXCEPTION 'WOS_SUBMIT_STALE_VERSION' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.wos_reference_images im
  JOIN wos_mvp_attestation.private_image_proofs proof
    ON proof.image_id=im.id AND proof.order_id=im.entity_id
    AND proof.organization_id=im.organization_id
    AND proof.storage_path=im.storage_path
    AND proof.storage_bucket=im.storage_bucket
    AND proof.version_label=im.version_label
  JOIN storage.objects obj
    ON obj.id=proof.storage_object_id AND obj.bucket_id=proof.storage_bucket
    AND obj.name=proof.storage_path
    AND obj.owner_id=proof.actor_user_id::text
    AND obj.version IS NOT DISTINCT FROM proof.storage_object_version
    AND obj.updated_at=proof.storage_object_updated_at
    AND obj.is_delete_marker=false AND obj.archived_at IS NULL
    AND obj.metadata->>'mimetype'='image/png'
    AND obj.metadata->>'size'=proof.byte_size::text
  WHERE im.organization_id=v_actor.org_id
   AND im.entity_type='PRODUCTION_ORDER' AND im.entity_id=p_order_id
   AND im.storage_bucket='wos-private' AND im.image_status='READY'
   AND im.version_label=v_order.version_label
   AND proof.order_version=v_order.version
   AND proof.actor_user_id=v_actor.user_id
   AND im.uploaded_by_profile_id=v_actor.id
   AND im.mime_type='image/png'
   AND proof.verified_sha256 ~ '^[a-f0-9]{64}$'
   AND proof.expires_at>pg_catalog.clock_timestamp()
   AND im.mime_type IN ('image/jpeg','image/png','image/webp')
   AND im.file_size BETWEEN 1 AND 20971520
 ) THEN RAISE EXCEPTION 'WOS_PRIVATE_IMAGE_ATTESTATION_REQUIRED'
   USING ERRCODE='23514'; END IF;
 -- Atomic P1 receipt, immutable inbox projection, status and audit log.
 INSERT INTO public.wos_office_readiness_receipts
 (organization_id,order_id,source_revision,source_version_label,actor_profile_id,note)
 VALUES(v_actor.org_id,p_order_id,p_expected_version,v_order.version_label,v_actor.id,p_note);
 INSERT INTO public.wos_submission_receipts
 (organization_id,order_id,source_revision,source_version_label,idempotency_key,
  actor_profile_id,request_fingerprint)
 VALUES(v_actor.org_id,p_order_id,p_expected_version,v_order.version_label,
  p_idempotency_key,v_actor.id,v_fingerprint)
 RETURNING id INTO v_receipt_id;
 UPDATE public.wos_production_orders
 SET workflow_status='SUBMITTED',version=version+1,submitted_at=pg_catalog.now(),
 updated_at=pg_catalog.now() WHERE id=p_order_id AND version=p_expected_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'WOS_CONCURRENT_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.wos_workshop_inbox
 (organization_id,order_id,submission_id,source_revision,source_version_label)
 VALUES(v_actor.org_id,p_order_id,v_receipt_id,p_expected_version,v_order.version_label)
 RETURNING id INTO v_inbox_id;
 INSERT INTO public.wos_status_history
 (organization_id,entity_type,entity_id,previous_status,next_status,
  actor_profile_id,actor_role,reason_code,metadata)
 VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'DRAFT','SUBMITTED',
  v_actor.id,v_actor.role,'OFFICE_FIRST_SUBMIT',
  pg_catalog.jsonb_build_object('receiptId',v_receipt_id,'inboxTaskId',v_inbox_id));
 RETURN pg_catalog.jsonb_build_object('result','CREATED','orderId',p_order_id,
 'receiptId',v_receipt_id,'inboxTaskId',v_inbox_id,'version',p_expected_version+1);
END $body$;
REVOKE ALL ON FUNCTION
 wos_mvp_attestation.submit_first_order_with_storage_proof(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 wos_mvp_attestation.submit_first_order_with_storage_proof(uuid,integer,uuid,text)
 TO authenticated;
CREATE FUNCTION public.wos_mvp_submit_first_order_verified_candidate(
 p_order_id uuid,p_expected_version integer,p_idempotency_key uuid,p_note text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='pg_catalog'
AS $proxy$ SELECT wos_mvp_attestation.submit_first_order_with_storage_proof(
 p_order_id,p_expected_version,p_idempotency_key,p_note); $proxy$;
REVOKE ALL ON FUNCTION
 public.wos_mvp_submit_first_order_verified_candidate(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.wos_mvp_submit_first_order_verified_candidate(uuid,integer,uuid,text)
 TO authenticated;
-- NOTE: no public write permission to the proof table or storage.objects metadata.
COMMIT;
