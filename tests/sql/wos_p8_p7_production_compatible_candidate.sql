-- WOS P8 PRODUCTION-STRUCTURE COMPATIBLE CANDIDATE; NONPRODUCTION ONLY.
-- Reworked from QA contract: real Production roles only; non-QA table/function names;
-- independent source migration, exact-branch gate and protected Storage proof design.
-- NOT AUTHORIZED FOR PRODUCTION. Keep OUTSIDE supabase/migrations.
BEGIN;
DO $wos_p8_gate$
BEGIN
 IF current_database()='wos_p8_replay_ci' THEN RETURN; END IF;
 IF current_database()<>'postgres'
    OR current_setting('wos_p8.approved_branch_ref',true) !~ '^[a-z0-9]{20}$'
    OR current_setting('wos_p8.approved_branch_ref',true)='amqpvxrurenevniilhtl'
    OR current_setting('wos_p8.rehearsal_only',true)<>'yes'
 THEN RAISE EXCEPTION 'WOS_P8_EXACT_APPROVED_TEST_BRANCH_REQUIRED'; END IF;
 IF (SELECT count(*) FROM public.organizations)<>0
    OR (SELECT count(*) FROM public.profiles)<>0
 THEN RAISE EXCEPTION 'WOS_P8_ZERO_BUSINESS_DATA_REQUIRED'; END IF;
END $wos_p8_gate$;
DO $preflight$
BEGIN
 IF to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('storage.objects') IS NULL
 THEN RAISE EXCEPTION 'WOS_P8_FOUNDATION_REQUIRED'; END IF;
END $preflight$;

-- 5 P7 incremental tables + RLS and permissions.
-- Three P7 transactional tables, aligned with the QA structural contract.
CREATE TABLE public.wos_office_readiness_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_version_label text NOT NULL CHECK (length(source_version_label) BETWEEN 1 AND 120),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  note text NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, source_revision)
);
CREATE TABLE public.wos_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_version_label text NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, source_revision)
);
CREATE TABLE public.wos_workshop_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.wos_submission_receipts(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_version_label text NOT NULL,
  workflow_status text NOT NULL DEFAULT 'SUBMITTED' CHECK (workflow_status='SUBMITTED'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wos_p7_inbox_org_created_idx
 ON public.wos_workshop_inbox (organization_id, created_at DESC);

-- Candidate production-neutral proof/lease table shape, not the QA-only
-- legacy-qa names; these lack the eventual approved RPC/Edge integration.
CREATE TABLE public.wos_verified_image_proofs (
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'wos-private' CHECK(storage_bucket='wos-private'),
  storage_path text NOT NULL UNIQUE,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL CHECK(verified_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at > verified_at AND expires_at <= verified_at + interval '30 minutes')
);
CREATE INDEX wos_p7_proof_order_idx
  ON public.wos_verified_image_proofs(order_id, expires_at);

CREATE TABLE public.wos_orphan_cleanup_claims (
  storage_object_id uuid PRIMARY KEY,
  storage_path text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  object_version text,
  object_updated_at timestamptz NOT NULL,
  claim_token uuid NOT NULL,
  state text NOT NULL CHECK(state IN ('CLAIMED','REMOVED','RELEASED')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  last_result text,
  CHECK(lease_expires_at > claimed_at AND lease_expires_at <= claimed_at + interval '10 minutes')
);
CREATE INDEX wos_p7_cleanup_lease_idx
  ON public.wos_orphan_cleanup_claims(state, lease_expires_at);

ALTER TABLE public.wos_office_readiness_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_submission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_workshop_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_verified_image_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_orphan_cleanup_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wos_office_readiness_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_submission_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_workshop_inbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_verified_image_proofs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_orphan_cleanup_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wos_office_readiness_receipts TO authenticated;
GRANT SELECT ON public.wos_submission_receipts TO authenticated;
GRANT SELECT ON public.wos_workshop_inbox TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wos_verified_image_proofs TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.wos_orphan_cleanup_claims TO service_role;

CREATE POLICY wos_p8_readiness_reader ON public.wos_office_readiness_receipts
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_office_readiness_receipts.organization_id
    AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_submission_reader ON public.wos_submission_receipts
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_submission_receipts.organization_id
    AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_inbox_reader ON public.wos_workshop_inbox
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_workshop_inbox.organization_id
    AND p.role IN ('admin','manager','sales','operator')));

-- Restrictive gates strengthen (rather than replace) Foundation same-org SELECT.
-- Corresponds to QA P7 viewer-role hardening, but not a full production policy set.
CREATE POLICY wos_p8_orders_reader_roles ON public.wos_production_orders
 AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
   AND p.org_id=wos_production_orders.organization_id
   AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_images_reader_roles ON public.wos_reference_images
 AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
   AND p.org_id=wos_reference_images.organization_id
   AND p.role IN ('admin','manager','sales','operator')));
CREATE POLICY wos_p8_history_reader_roles ON public.wos_status_history
 AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
   AND p.org_id=wos_status_history.organization_id
   AND p.role IN ('admin','manager','sales','operator')));

-- No Storage API, Edge Functions, SQL SECURITY DEFINER RPCs, cleanup workers,
-- or physical deletion is deployed/represented by this contract.

-- Atomic readiness and idempotent submission RPCs.
CREATE OR REPLACE FUNCTION public.wos_confirm_office_completeness(
 p_order_id uuid,p_expected_revision integer,p_expected_label text,p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_id uuid;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
  WHERE user_id=auth.uid() AND is_active=true AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_order_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_expected_label IS NULL OR length(p_expected_label)>120
  OR nullif(btrim(p_note),'') IS NULL OR length(p_note) NOT BETWEEN 10 AND 2000
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
   OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
       AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_revision
   OR v_order.version_label<>p_expected_label
 THEN RAISE EXCEPTION 'STALE_OR_UNEDITABLE_ORDER' USING ERRCODE='PT409'; END IF;
 -- A READY row alone cannot be trusted. Before readiness, ensure the
 -- underlying binary was attested by the isolated Edge verifier and that
 -- its Storage object identity has not changed.
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_reference_images im
   JOIN public.wos_verified_image_proofs proof
     ON proof.image_id=im.id AND proof.order_id=im.entity_id
     AND proof.organization_id=im.organization_id
     AND proof.storage_path=im.storage_path
   JOIN storage.objects obj ON obj.id=proof.storage_object_id
     AND obj.bucket_id='wos-private' AND obj.name=im.storage_path
     AND obj.version IS NOT DISTINCT FROM proof.storage_object_version
     AND obj.updated_at IS NOT DISTINCT FROM proof.storage_object_updated_at
     AND obj.is_delete_marker=false AND obj.archived_at IS NULL
   WHERE im.organization_id=v_actor.org_id AND im.entity_type='PRODUCTION_ORDER'
     AND im.entity_id=p_order_id AND im.image_status='READY'
     AND im.version_label=p_expected_label AND im.storage_bucket='wos-private'
 ) THEN RAISE EXCEPTION 'TRUSTED_PRIVATE_IMAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.wos_office_readiness_receipts(
  organization_id,order_id,source_revision,source_version_label,actor_profile_id,note)
 VALUES(v_actor.org_id,p_order_id,p_expected_revision,p_expected_label,v_actor.id,p_note)
 ON CONFLICT (order_id,source_revision) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM public.wos_office_readiness_receipts
   WHERE order_id=p_order_id AND source_revision=p_expected_revision
     AND organization_id=v_actor.org_id AND source_version_label=p_expected_label
     AND actor_profile_id=v_actor.id AND note=p_note;
  IF v_id IS NULL THEN
   RAISE EXCEPTION 'READINESS_ALREADY_CONFIRMED_DIFFERENTLY' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN v_id;
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
 IF EXISTS (SELECT 1 FROM public.wos_orphan_cleanup_claims c
    WHERE c.order_id=p_order_id AND c.state='CLAIMED'
      AND c.lease_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'ORPHAN_CLEANUP_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
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

REVOKE ALL ON FUNCTION public.wos_confirm_office_completeness(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wos_submit_production_order(uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_confirm_office_completeness(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wos_submit_production_order(uuid,integer,text,uuid) TO authenticated;

-- Edge-bound service-only storage snapshot and authenticated registration.
CREATE OR REPLACE FUNCTION public.wos_p7_service_storage_snapshot(p_path text)
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
REVOKE ALL ON FUNCTION public.wos_p7_service_storage_snapshot(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_service_storage_snapshot(text)
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
 THEN RAISE EXCEPTION 'TRUSTED_PNG_ONLY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_verified_image_proofs proof
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
 ) THEN RAISE EXCEPTION 'TRUSTED_BINARY_PROOF_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,'wos-private',
 p_storage_path,v_filename,v_mime,v_size,v_order.version_label,'READY',v_actor.id);
 RETURN jsonb_build_object('status','CREATED','imageId',p_image_id,'bucket','wos-private');
END $fn$;


REVOKE ALL ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
 TO authenticated;
COMMIT;
