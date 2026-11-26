-- WOS V1 production material readiness and independent dual-signoff.
-- Production-neutral migration. Requires the reviewed production runtime,
-- application write flag, authenticated Supabase session and explicit release.
BEGIN;

-- Every action is scoped by authenticated Profile, organization, current order
-- version and immutable CREATE/submission/revision receipts. There is no
-- browser-selectable organization or actor.

CREATE TABLE IF NOT EXISTS public.wos_v1_m2_receipts (
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK (action IN ('MATERIAL_RECORD','BASELINE_SELECT',
                 'BASELINE_OFFICE_CONFIRM','BASELINE_WORKSHOP_CONFIRM',
                 'FINAL_READINESS_CONFIRM')),
 expected_version integer NOT NULL CHECK (expected_version>=1),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[0-9a-f]{64}$'),
 before_spec_digest text NOT NULL CHECK(before_spec_digest ~ '^[0-9a-f]{64}$'),
 after_spec_digest text NOT NULL CHECK(after_spec_digest ~ '^[0-9a-f]{64}$'),
 receipt_digest text NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
 production_version_label text NOT NULL,
 result_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wos_v1_m2_receipts_order_version_idx
 ON public.wos_v1_m2_receipts(order_id,expected_version);
ALTER TABLE public.wos_v1_m2_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_v1_m2_receipts FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wos_v1_start_releases (
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
 baseline_id uuid NOT NULL REFERENCES public.wos_visual_baselines(id),
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 expected_version integer NOT NULL CHECK (expected_version >= 1),
 payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
 proof_set_digest text NOT NULL CHECK (proof_set_digest ~ '^[a-f0-9]{64}$'),
 office_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 workshop_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 result_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (office_profile_id <> workshop_profile_id)
);
ALTER TABLE public.wos_v1_start_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_v1_start_releases FROM PUBLIC,anon,authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS wos_v1_m2_one_current_baseline_per_entity
 ON public.wos_visual_baselines(organization_id,entity_type,entity_id)
 WHERE status='CURRENT';

-- Immutable Office/Workshop proof commitments.
ALTER TABLE public.wos_visual_baselines
 ADD COLUMN IF NOT EXISTS office_proof_set_digest text
   CHECK (office_proof_set_digest IS NULL OR office_proof_set_digest ~ '^[a-f0-9]{64}$'),
 ADD COLUMN IF NOT EXISTS office_post_order_version integer
   CHECK (office_post_order_version IS NULL OR office_post_order_version>0),
 ADD COLUMN IF NOT EXISTS workshop_proof_set_digest text
   CHECK (workshop_proof_set_digest IS NULL OR workshop_proof_set_digest ~ '^[a-f0-9]{64}$'),
 ADD COLUMN IF NOT EXISTS workshop_post_order_version integer
   CHECK (workshop_post_order_version IS NULL OR workshop_post_order_version>0);

-- One server-generated canonical proof set used at selection and both signatures.
CREATE OR REPLACE FUNCTION public.wos_v1_m2_checked_proof_set(
 p_order_id uuid,p_org_id uuid,p_baseline_id uuid,p_version_label text
) RETURNS TABLE(proof_digest text,last_verified_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' VOLATILE AS $proof$
DECLARE
 v_total integer;
 v_count integer;
 v_categories text[];
 v_images jsonb;
 v_verified timestamptz;
 v_spec jsonb;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_visual_baselines vb
   WHERE vb.id=p_baseline_id AND vb.organization_id=p_org_id
     AND vb.entity_type='PRODUCTION_ORDER' AND vb.entity_id=p_order_id
     AND vb.version_label=p_version_label AND vb.status IN('DRAFT','CURRENT')
     AND vb.superseded_at IS NULL
 ) THEN RAISE EXCEPTION 'INVALID_BASELINE' USING ERRCODE='PT409'; END IF;
 SELECT count(*) INTO v_total FROM public.wos_visual_baseline_items bi
  WHERE bi.baseline_id=p_baseline_id;
 IF v_total<>4 THEN
  RAISE EXCEPTION 'BASELINE_IMAGE_COUNT_INVALID' USING ERRCODE='PT409'; END IF;
 WITH locked_proofs AS MATERIALIZED (
  SELECT im.id AS image_id,im.category,im.version_label,
    im.storage_bucket,im.storage_path,pf.storage_object_id,
    pf.storage_object_version,pf.storage_object_updated_at,
    pf.verified_sha256,pf.verified_at,pf.expires_at
  FROM public.wos_visual_baseline_items bi
  JOIN public.wos_reference_images im ON im.id=bi.reference_image_id
  JOIN public.wos_verified_image_proofs pf
    ON pf.image_id=im.id AND pf.order_id=p_order_id
    AND pf.organization_id=p_org_id
    AND pf.storage_bucket=im.storage_bucket AND pf.storage_path=im.storage_path
  JOIN storage.objects ob ON ob.id=pf.storage_object_id
    AND ob.bucket_id=pf.storage_bucket AND ob.name=pf.storage_path
    AND ob.version=pf.storage_object_version
    AND ob.updated_at=pf.storage_object_updated_at
    AND ob.archived_at IS NULL AND ob.is_delete_marker IS DISTINCT FROM true
  WHERE bi.baseline_id=p_baseline_id
    AND im.organization_id=p_org_id AND im.entity_id=p_order_id
    AND im.entity_type='PRODUCTION_ORDER'
    AND im.version_label=p_version_label
    AND im.image_status='READY' AND im.superseded_at IS NULL
    AND im.storage_bucket='wos-private'
    AND pf.storage_object_id IS NOT NULL
    AND pg_catalog.btrim(COALESCE(pf.storage_object_version,''))<>''
    AND pf.verified_sha256 ~ '^[a-f0-9]{64}$'
    AND pf.verified_at<=pg_catalog.clock_timestamp()
    AND pf.expires_at>pg_catalog.clock_timestamp()
    AND NOT EXISTS (
      SELECT 1 FROM public.wos_reference_images newer
      WHERE newer.supersedes_image_id=im.id AND newer.image_status='READY'
    )
  FOR SHARE OF bi,im,pf,ob
 )
 SELECT count(*)::integer,pg_catalog.array_agg(DISTINCT category),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'imageId',image_id,'category',category,'productionVersion',version_label,
      'bucket',storage_bucket,'path',storage_path,
      'objectId',storage_object_id,'objectVersion',storage_object_version,
      'objectUpdatedAt',storage_object_updated_at,'sha256',verified_sha256,
      'proofVerifiedAt',verified_at,'proofExpiresAt',expires_at
    ) ORDER BY image_id),max(verified_at)
 INTO v_count,v_categories,v_images,v_verified FROM locked_proofs;
 IF v_count<>v_total OR NOT COALESCE(
   ARRAY['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE','CUSTOMER_APPROVED_SAMPLE']::text[]<@v_categories,false)
 THEN RAISE EXCEPTION 'UNVERIFIED_OR_INCOMPLETE_PROOF_SET'
   USING ERRCODE='PT409'; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'org',o.organization_id,'order',o.id,'productionVersion',o.version_label,
  'customerId',o.customer_id,'customer',o.customer_name_snapshot,
  'product',o.product_name,'material',o.product_material,
  'surface',o.surface_treatment,'pattern',o.pattern_scope,
  'seam',o.seam_tolerance,'position',o.position_reference,
  'acceptance',o.customer_acceptance_standard,'packaging',o.packaging_method,
  'cartonQty',o.carton_quantity,'labelRule',o.label_marking_rule,
  'requestedQty',o.requested_quantity,'batchQty',o.current_batch_quantity
 ) INTO v_spec FROM public.wos_production_orders o
 WHERE o.id=p_order_id AND o.organization_id=p_org_id AND o.version_label=p_version_label;
 IF v_spec IS NULL OR v_images IS NULL
 THEN RAISE EXCEPTION 'PRODUCTION_SPEC_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
 proof_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object('baselineId',p_baseline_id,
     'productionSpec',v_spec,'imageProofSet',v_images)::text,'UTF8')),'hex');
 last_verified_at:=v_verified;
 RETURN NEXT;
END;
$proof$;
REVOKE ALL ON FUNCTION public.wos_v1_m2_checked_proof_set(uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Private helper: only the reviewed SECURITY DEFINER M2 action can call.
-- Digest is computed *server-side* from order specifications and the
-- currently selected image IDs; never trust a browser-supplied digest.
CREATE OR REPLACE FUNCTION public.wos_v1_m2_spec_digest(p_order_id uuid)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' STABLE
AS $fn$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object(
    'orderId',o.id,'orgId',o.organization_id,'label',o.version_label,
    'numericOrderVersion',o.version,
    'customerId',o.customer_id,'customer',o.customer_name_snapshot,
    'product',o.product_name,'productMaterial',o.product_material,
    'surface',o.surface_treatment,'pattern',o.pattern_scope,
    'seam',o.seam_tolerance,'position',o.position_reference,
    'acceptance',o.customer_acceptance_standard,'packaging',o.packaging_method,
    'cartonQty',o.carton_quantity,'labelRule',o.label_marking_rule,
    'quantity',o.requested_quantity,'batchQty',o.current_batch_quantity,
    'currentImages',COALESCE(b.image_proof_set,'[]'::jsonb)
   )::text,'UTF8')),'hex')
 FROM public.wos_production_orders o
 LEFT JOIN LATERAL (
   SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id',im.id,'category',im.category,
      'version',im.version_label,'bucket',im.storage_bucket,
      'path',im.storage_path,'proofSha',pf.verified_sha256,
      'objectId',pf.storage_object_id,'objectVersion',pf.storage_object_version,
      'objectUpdatedAt',pf.storage_object_updated_at,
      'proofVerifiedAt',pf.verified_at,'proofExpiresAt',pf.expires_at)
    ORDER BY im.id
   ) AS image_proof_set
   FROM public.wos_visual_baselines vb
    JOIN public.wos_visual_baseline_items vi ON vi.baseline_id=vb.id
    JOIN public.wos_reference_images im ON im.id=vi.reference_image_id
    LEFT JOIN public.wos_verified_image_proofs pf
      ON pf.image_id=im.id AND pf.organization_id=o.organization_id
      AND pf.order_id=o.id AND pf.storage_bucket=im.storage_bucket
      AND pf.storage_path=im.storage_path
   WHERE vb.organization_id=o.organization_id AND vb.entity_type='PRODUCTION_ORDER'
     AND vb.entity_id=o.id AND vb.status='CURRENT'
 ) b ON true
 WHERE o.id=p_order_id;
$fn$;
REVOKE ALL ON FUNCTION public.wos_v1_m2_spec_digest(uuid)
 FROM PUBLIC,anon,authenticated;

-- Shared invalidation primitive used by image registration and trusted proof
-- refresh. The caller already holds, or this function obtains, the same
-- order-level advisory lock used by all M2 transactions.
CREATE OR REPLACE FUNCTION public.wos_v1_m2_invalidate_signoff(
 p_order_id uuid,p_org_id uuid,p_image_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $invalidate$
DECLARE
 v_order public.wos_production_orders%ROWTYPE;
 v_actor public.profiles%ROWTYPE;
 v_actor_user_id uuid;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('wos-v1-m2:'||p_order_id::text,0));
 SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id=p_order_id AND organization_id=p_org_id
  FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_visual_baselines b
   WHERE b.organization_id=p_org_id
     AND b.entity_type='PRODUCTION_ORDER' AND b.entity_id=p_order_id
     AND b.version_label=v_order.version_label AND b.status='CURRENT'
     AND b.superseded_at IS NULL
     AND (b.office_proof_set_digest IS NOT NULL OR b.workshop_proof_set_digest IS NOT NULL)
 ) THEN RETURN false; END IF;
 v_actor_user_id:=COALESCE(
   auth.uid(),
   NULLIF(pg_catalog.current_setting('wos.v1.actor_user_id',true),'')::uuid);
 SELECT * INTO v_actor FROM public.profiles
  WHERE user_id=v_actor_user_id AND is_active=true LIMIT 1;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'M2_EVIDENCE_CHANGE_ACTOR_REQUIRED' USING ERRCODE='42501';
 END IF;
 UPDATE public.wos_visual_baselines
 SET confirmed_by_office_profile_id=NULL,office_confirmed_at=NULL,
     office_proof_set_digest=NULL,office_post_order_version=NULL,
     confirmed_by_workshop_profile_id=NULL,workshop_confirmed_at=NULL,
     workshop_proof_set_digest=NULL,workshop_post_order_version=NULL
 WHERE organization_id=p_org_id AND entity_type='PRODUCTION_ORDER'
   AND entity_id=p_order_id AND version_label=v_order.version_label
   AND status='CURRENT' AND superseded_at IS NULL;
 UPDATE public.wos_resource_readiness
 SET status=CASE resource_type WHEN 'FILM' THEN 'ARRIVED'
              WHEN 'SIGNED_SAMPLE' THEN 'PHYSICAL_SAMPLE_RECEIVED'
              ELSE status END,
     confirmed_by_profile_id=NULL,confirmed_at=NULL,updated_at=pg_catalog.now()
 WHERE organization_id=p_org_id AND entity_type='PRODUCTION_ORDER'
   AND entity_id=p_order_id AND version_label=v_order.version_label
   AND resource_type IN ('FILM','SIGNED_SAMPLE');
 IF v_order.workflow_status IN ('READINESS_CHECK','READY_TO_START') THEN
   UPDATE public.wos_production_orders
   SET workflow_status='WAITING_MATERIAL',version=version+1,updated_at=pg_catalog.now()
   WHERE id=v_order.id AND organization_id=v_order.organization_id
     AND version=v_order.version
     AND workflow_status IN ('READINESS_CHECK','READY_TO_START');
   IF FOUND THEN
     INSERT INTO public.wos_status_history(
       organization_id,entity_type,entity_id,previous_status,next_status,
       actor_profile_id,actor_role,reason_code,note,metadata)
     VALUES(v_order.organization_id,'PRODUCTION_ORDER',v_order.id,
       v_order.workflow_status,'WAITING_MATERIAL',v_actor.id,v_actor.role,
       'WOS_V1_M2_EVIDENCE_INVALIDATED','Current-version image or Proof evidence changed after signoff.',
       pg_catalog.jsonb_build_object(
         'expectedVersion',v_order.version,'newVersion',v_order.version+1,
         'imageId',p_image_id,'action','EVIDENCE_INVALIDATED'));
   END IF;
 END IF;
 RETURN true;
END;
$invalidate$;
REVOKE ALL ON FUNCTION public.wos_v1_m2_invalidate_signoff(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wos_v1_m2_image_change_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.entity_type='PRODUCTION_ORDER' THEN
     PERFORM public.wos_v1_m2_invalidate_signoff(
       OLD.entity_id,OLD.organization_id,OLD.id);
   END IF;
   RETURN OLD;
 END IF;
 IF NEW.entity_type='PRODUCTION_ORDER'
   AND (NEW.image_status='READY'
     OR (TG_OP='UPDATE' AND OLD.image_status='READY'))
 THEN
   PERFORM public.wos_v1_m2_invalidate_signoff(
     NEW.entity_id,NEW.organization_id,NEW.id);
 END IF;
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.wos_v1_m2_image_change_guard()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wos_v1_m2_reference_image_guard
 ON public.wos_reference_images;
CREATE TRIGGER wos_v1_m2_reference_image_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.wos_reference_images
FOR EACH ROW EXECUTE FUNCTION public.wos_v1_m2_image_change_guard();

CREATE OR REPLACE FUNCTION public.wos_v1_m2_proof_change_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $proof_guard$
BEGIN
 IF TG_OP='DELETE' THEN
   PERFORM pg_catalog.set_config(
     'wos.v1.actor_user_id',OLD.actor_user_id::text,true);
   PERFORM public.wos_v1_m2_invalidate_signoff(
     OLD.order_id,OLD.organization_id,OLD.image_id);
   RETURN OLD;
 END IF;
 PERFORM pg_catalog.set_config(
   'wos.v1.actor_user_id',NEW.actor_user_id::text,true);
 PERFORM public.wos_v1_m2_invalidate_signoff(
   NEW.order_id,NEW.organization_id,NEW.image_id);
 RETURN NEW;
END;
$proof_guard$;
REVOKE ALL ON FUNCTION public.wos_v1_m2_proof_change_guard()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wos_v1_m2_proof_change_guard
ON public.wos_verified_image_proofs;
CREATE TRIGGER wos_v1_m2_proof_change_guard
AFTER UPDATE OR DELETE
ON public.wos_verified_image_proofs
FOR EACH ROW EXECUTE FUNCTION public.wos_v1_m2_proof_change_guard();

CREATE OR REPLACE FUNCTION public.wos_v1_m2_action(
 p_order_id uuid,p_expected_version integer,p_request_id uuid,
 p_action text,p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_prior public.wos_v1_m2_receipts%ROWTYPE;
 v_hash text;
 v_before text;
 v_after text;
 v_receipt text;
 v_response jsonb;
 v_label text;
 v_resource text;
 v_status text;
 v_final boolean;
 v_qty_expected integer;
 v_qty_arrived integer;
 v_expected_at timestamptz;
 v_arrived_at timestamptz;
 v_baseline_id uuid;
 v_proof_digest text;
 v_proof_verified_at timestamptz;
 v_office_digest text;
 v_office_version integer;
 v_office_time timestamptz;
 v_office_actor uuid;
 v_workshop_digest text;
 v_workshop_version integer;
 v_workshop_time timestamptz;
 v_workshop_actor uuid;
 v_image_id uuid;
 v_ids uuid[];
 v_n integer;
 v_note text;
 v_count integer;
 v_allowed boolean;
 v_next_status text;
 v_next integer;
 v_key text;
 v_accepted_keys text[];
 v_film_at timestamptz;
 v_fixture_at timestamptz;
 v_incoming_at timestamptz;
 v_signed_sample_at timestamptz;
 v_incoming_expected integer;
 v_incoming_arrived integer;
BEGIN
 IF p_order_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL
    OR p_expected_version NOT BETWEEN 1 AND 2147483646
    OR p_action NOT IN ('MATERIAL_RECORD','BASELINE_SELECT','BASELINE_OFFICE_CONFIRM',
      'BASELINE_WORKSHOP_CONFIRM','FINAL_READINESS_CONFIRM')
    OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object'
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT v_actor FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
    AND ((p_action IN ('MATERIAL_RECORD','BASELINE_WORKSHOP_CONFIRM','FINAL_READINESS_CONFIRM')
          AND p.role IN ('operator','manager','admin'))
       OR (p_action IN ('BASELINE_SELECT','BASELINE_OFFICE_CONFIRM')
          AND p.role IN ('sales','manager','admin')));
 v_label:=p_payload->>'productionVersionLabel';
 v_note:=pg_catalog.btrim(p_payload->>'note');
 IF v_label IS NULL OR pg_catalog.length(v_label) NOT BETWEEN 1 AND 80
    OR v_note IS NULL OR pg_catalog.length(v_note) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;
 v_accepted_keys:=CASE WHEN p_action='MATERIAL_RECORD' THEN
  ARRAY['productionVersionLabel','note','resourceType','resourceStatus',
        'expectedAt','arrivedAt','quantityExpected','quantityArrived','physicalCheckAttested']
 ELSE CASE WHEN p_action='BASELINE_SELECT' THEN
  ARRAY['productionVersionLabel','note','imageIds']
 ELSE CASE WHEN p_action IN ('BASELINE_OFFICE_CONFIRM','BASELINE_WORKSHOP_CONFIRM') THEN
  ARRAY['productionVersionLabel','note','baselineId']
 ELSE
  ARRAY['productionVersionLabel','note','baselineId','physicalCheckAttested',
    'filmArrivedAt','fixtureArrivedAt','incomingArrivedAt','signedSampleArrivedAt',
    'quantityExpected','quantityArrived']
 END END END;
 SELECT count(*) INTO v_count FROM pg_catalog.jsonb_object_keys(p_payload) AS field
  WHERE field<>ALL(v_accepted_keys);
 IF v_count<>0 THEN RAISE EXCEPTION 'INVALID_PAYLOAD_KEYS' USING ERRCODE='22023'; END IF;
 -- Never allow a user-chosen order/organization/actor/digest in the payload.
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.jsonb_build_object('order',p_order_id,'expectedVersion',p_expected_version,
       'action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-v1-m2:'||p_order_id::text,0));
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id
 FOR UPDATE;
 IF NOT FOUND
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_action IN ('BASELINE_SELECT','BASELINE_OFFICE_CONFIRM')
    AND v_actor.role='sales'
    AND v_actor.id IS DISTINCT FROM v_order.created_by_profile_id
    AND v_actor.id IS DISTINCT FROM v_order.sales_owner_profile_id
 THEN RAISE EXCEPTION 'OFFICE_ORDER_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_prior FROM public.wos_v1_m2_receipts WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.organization_id<>v_actor.org_id OR v_prior.order_id<>p_order_id
     OR v_prior.actor_profile_id<>v_actor.id OR v_prior.action<>p_action
     OR v_prior.expected_version<>p_expected_version
     OR v_prior.payload_fingerprint<>v_hash
  THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result_json||pg_catalog.jsonb_build_object('status','REPLAYED');
 END IF;
 IF v_order.workflow_status<>'WAITING_MATERIAL' THEN
   RAISE EXCEPTION 'M2_ORDER_NOT_EDITABLE' USING ERRCODE='PT409';
 END IF;
 IF v_order.version<>p_expected_version
 THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF v_order.version_label<>v_label
 THEN RAISE EXCEPTION 'PRODUCTION_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 v_before:=public.wos_v1_m2_spec_digest(p_order_id);
 IF v_before IS NULL THEN RAISE EXCEPTION 'SPEC_UNAVAILABLE' USING ERRCODE='PT409'; END IF;

 IF p_action='MATERIAL_RECORD' THEN
  v_resource:=p_payload->>'resourceType';
  v_status:=p_payload->>'resourceStatus';
  v_allowed:=CASE v_resource
   WHEN 'FILM' THEN v_status IN('NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','VERSION_VERIFIED')
   WHEN 'FIXTURE' THEN v_status IN('NOT_AVAILABLE','IN_PRODUCTION','ARRIVED','FIT_VERIFIED')
   WHEN 'INCOMING_MATERIAL' THEN v_status IN('NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','QUANTITY_VERIFIED')
   WHEN 'SIGNED_SAMPLE' THEN v_status IN('MISSING','UPLOADED','PHYSICAL_SAMPLE_RECEIVED','VERIFIED')
   ELSE false END;
  IF v_allowed IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'INVALID_RESOURCE' USING ERRCODE='22023'; END IF;
  v_final:=CASE v_resource WHEN 'FILM' THEN v_status='VERSION_VERIFIED'
    WHEN 'FIXTURE' THEN v_status='FIT_VERIFIED'
    WHEN 'INCOMING_MATERIAL' THEN v_status='QUANTITY_VERIFIED'
    ELSE v_status='VERIFIED' END;
  -- Final material states are accepted only through the single
  -- FINAL_READINESS_CONFIRM transaction, which writes all four together and
  -- never invalidates the signatures that authorize that exact proof set.
  IF v_final THEN
    RAISE EXCEPTION 'FINAL_READINESS_CONFIRM_REQUIRED' USING ERRCODE='PT409';
  END IF;
  v_expected_at:=NULLIF(p_payload->>'expectedAt','')::timestamptz;
  v_arrived_at:=NULLIF(p_payload->>'arrivedAt','')::timestamptz;
  IF v_status IN('PARTIALLY_ARRIVED','ARRIVED','PHYSICAL_SAMPLE_RECEIVED')
     AND v_arrived_at IS NULL
  THEN RAISE EXCEPTION 'ARRIVAL_TIME_REQUIRED' USING ERRCODE='22023'; END IF;
  IF v_status IN('NOT_ARRIVED','NOT_AVAILABLE','MISSING','IN_PRODUCTION','UPLOADED')
     AND v_arrived_at IS NOT NULL
  THEN RAISE EXCEPTION 'NO_ARRIVAL_FOR_PENDING_STATUS' USING ERRCODE='22023'; END IF;
  v_qty_expected:=(p_payload->>'quantityExpected')::integer;
  v_qty_arrived:=(p_payload->>'quantityArrived')::integer;
  IF v_resource='INCOMING_MATERIAL' THEN
    IF v_qty_expected IS NULL OR v_qty_arrived IS NULL OR
       v_qty_expected<0 OR v_qty_arrived<0
    THEN RAISE EXCEPTION 'INCOMING_QUANTITY_NOT_READY' USING ERRCODE='22023'; END IF;
  ELSIF v_qty_expected IS NOT NULL OR v_qty_arrived IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_QUANTITIES' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.wos_resource_readiness(
    organization_id,entity_type,entity_id,resource_type,status,
    expected_at,arrived_at,quantity_expected,quantity_arrived,
    version_label,confirmed_by_profile_id,confirmed_at,note
  ) VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,v_resource,v_status,
    v_expected_at,v_arrived_at,v_qty_expected,v_qty_arrived,v_label,
    CASE WHEN v_final THEN v_actor.id ELSE NULL END,
    CASE WHEN v_final THEN pg_catalog.now() ELSE NULL END,v_note)
  ON CONFLICT(entity_type,entity_id,resource_type) DO UPDATE SET
    status=EXCLUDED.status,expected_at=EXCLUDED.expected_at,arrived_at=EXCLUDED.arrived_at,
    quantity_expected=EXCLUDED.quantity_expected,quantity_arrived=EXCLUDED.quantity_arrived,
    version_label=EXCLUDED.version_label,confirmed_by_profile_id=EXCLUDED.confirmed_by_profile_id,
    confirmed_at=EXCLUDED.confirmed_at,note=EXCLUDED.note,updated_at=pg_catalog.now()
  WHERE wos_resource_readiness.organization_id=EXCLUDED.organization_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'RESOURCE_ORG_CONFLICT' USING ERRCODE='42501'; END IF;

 ELSIF p_action='BASELINE_SELECT' THEN
  IF pg_catalog.jsonb_typeof(p_payload->'imageIds')<>'array'
   OR pg_catalog.jsonb_array_length(p_payload->'imageIds')<>4
  THEN RAISE EXCEPTION 'INVALID_IMAGES' USING ERRCODE='22023'; END IF;
  SELECT pg_catalog.array_agg(img_id.value::uuid) INTO v_ids
    FROM pg_catalog.jsonb_array_elements_text(p_payload->'imageIds') AS img_id(value);
  IF (SELECT count(DISTINCT image_id.value) FROM pg_catalog.unnest(v_ids) AS image_id(value))<>pg_catalog.array_length(v_ids,1)
  THEN RAISE EXCEPTION 'DUPLICATE_IMAGES' USING ERRCODE='22023'; END IF;
  -- each supplied image needs its own valid, current private storage proof.
  SELECT count(*) INTO v_count FROM public.wos_reference_images im
    JOIN public.wos_verified_image_proofs pf
     ON pf.image_id=im.id AND pf.order_id=p_order_id
     AND pf.organization_id=v_actor.org_id
     AND pf.storage_bucket=im.storage_bucket AND pf.storage_path=im.storage_path
   WHERE im.id=ANY(v_ids) AND im.entity_id=p_order_id
     AND im.entity_type='PRODUCTION_ORDER' AND im.organization_id=v_actor.org_id
     AND im.image_status='READY' AND im.superseded_at IS NULL
     AND im.version_label=v_label AND im.storage_bucket='wos-private'
     AND pf.expires_at>pg_catalog.clock_timestamp()
     AND pf.verified_sha256 ~ '^[a-f0-9]{64}$';
  IF v_count<>pg_catalog.array_length(v_ids,1)
  THEN RAISE EXCEPTION 'UNVERIFIED_IMAGES' USING ERRCODE='PT409'; END IF;
  IF EXISTS(
   SELECT 1 FROM pg_catalog.unnest(ARRAY['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE','CUSTOMER_APPROVED_SAMPLE']) AS needed(category)
   WHERE NOT EXISTS(SELECT 1 FROM public.wos_reference_images im
     WHERE im.id=ANY(v_ids) AND im.category=needed.category)
  ) THEN RAISE EXCEPTION 'REQUIRED_CATEGORIES_MISSING' USING ERRCODE='PT409'; END IF;
  v_baseline_id:=pg_catalog.gen_random_uuid();
  INSERT INTO public.wos_visual_baselines(
    id,organization_id,entity_type,entity_id,version_label,status
  ) VALUES(v_baseline_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,v_label,'DRAFT');
  INSERT INTO public.wos_visual_baseline_items(baseline_id,reference_image_id,display_order,is_required)
  SELECT v_baseline_id, z, ord::integer-1,true
    FROM pg_catalog.unnest(v_ids) WITH ORDINALITY AS selected(z,ord);
  PERFORM 1 FROM public.wos_v1_m2_checked_proof_set(
    p_order_id,v_actor.org_id,v_baseline_id,v_label);

 ELSIF p_action='BASELINE_OFFICE_CONFIRM' THEN
  v_baseline_id:=(p_payload->>'baselineId')::uuid;
  PERFORM 1 FROM public.wos_visual_baselines b
   WHERE b.id=v_baseline_id AND b.entity_id=p_order_id
     AND b.organization_id=v_actor.org_id AND b.entity_type='PRODUCTION_ORDER'
     AND b.version_label=v_label AND b.status='DRAFT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_BASELINE' USING ERRCODE='PT409'; END IF;
  -- Sign only the immutable, currently verified private image/object proof set.
  SELECT proof_digest,last_verified_at INTO v_proof_digest,v_proof_verified_at
    FROM public.wos_v1_m2_checked_proof_set(
      p_order_id,v_actor.org_id,v_baseline_id,v_label);
  IF v_proof_digest IS NULL OR v_proof_verified_at>=pg_catalog.clock_timestamp()
  THEN RAISE EXCEPTION 'OFFICE_PROOF_NOT_VERIFIED' USING ERRCODE='PT409'; END IF;
  UPDATE public.wos_visual_baselines SET
    status='SUPERSEDED',superseded_at=pg_catalog.now()
  WHERE organization_id=v_actor.org_id AND entity_id=p_order_id
   AND entity_type='PRODUCTION_ORDER' AND status='CURRENT';
  UPDATE public.wos_visual_baselines SET
    status='CURRENT',confirmed_by_office_profile_id=v_actor.id,
    office_confirmed_at=pg_catalog.clock_timestamp(),
    office_proof_set_digest=v_proof_digest,
    office_post_order_version=p_expected_version+1,
    confirmed_by_workshop_profile_id=NULL,workshop_confirmed_at=NULL,
    workshop_proof_set_digest=NULL,workshop_post_order_version=NULL
  WHERE id=v_baseline_id;
  -- Current image baseline changed. Prevent stale material green checks.
  UPDATE public.wos_resource_readiness SET
    status=CASE resource_type WHEN 'FILM' THEN 'ARRIVED'
          WHEN 'SIGNED_SAMPLE' THEN 'PHYSICAL_SAMPLE_RECEIVED' ELSE status END,
    confirmed_by_profile_id=NULL,confirmed_at=NULL,updated_at=pg_catalog.now()
  WHERE organization_id=v_actor.org_id AND entity_id=p_order_id
    AND entity_type='PRODUCTION_ORDER'
    AND resource_type IN('FILM','SIGNED_SAMPLE');

 ELSIF p_action='BASELINE_WORKSHOP_CONFIRM' THEN
  v_baseline_id:=(p_payload->>'baselineId')::uuid;
  SELECT b.office_proof_set_digest,b.office_post_order_version,
    b.office_confirmed_at,b.confirmed_by_office_profile_id
  INTO v_office_digest,v_office_version,v_office_time,v_office_actor
  FROM public.wos_visual_baselines b
  WHERE b.id=v_baseline_id AND b.entity_id=p_order_id
    AND b.organization_id=v_actor.org_id AND b.entity_type='PRODUCTION_ORDER'
    AND b.version_label=v_label AND b.status='CURRENT'
    AND b.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_office_digest IS NULL OR v_office_version<>p_expected_version
    OR v_office_actor IS NULL OR v_office_actor=v_actor.id OR v_office_time IS NULL
  THEN RAISE EXCEPTION 'OFFICE_SIGNOFF_STALE' USING ERRCODE='PT409'; END IF;
  -- Revalidate the LIVE proof set and compare it with Office's saved snapshot.
  SELECT proof_digest,last_verified_at INTO v_proof_digest,v_proof_verified_at
    FROM public.wos_v1_m2_checked_proof_set(
      p_order_id,v_actor.org_id,v_baseline_id,v_label);
  IF v_proof_digest IS DISTINCT FROM v_office_digest
     OR v_proof_verified_at>v_office_time
     OR v_proof_verified_at>=pg_catalog.clock_timestamp()
  THEN RAISE EXCEPTION 'WORKSHOP_PROOF_CHANGED' USING ERRCODE='PT409'; END IF;
  UPDATE public.wos_visual_baselines SET
    confirmed_by_workshop_profile_id=v_actor.id,
    workshop_confirmed_at=pg_catalog.clock_timestamp(),
    workshop_proof_set_digest=v_proof_digest,
    workshop_post_order_version=p_expected_version+1
  WHERE id=v_baseline_id AND organization_id=v_actor.org_id
    AND entity_type='PRODUCTION_ORDER' AND entity_id=p_order_id
    AND version_label=v_label AND status='CURRENT'
    AND confirmed_by_office_profile_id=v_office_actor
    AND office_proof_set_digest=v_office_digest
    AND office_post_order_version=p_expected_version
    AND confirmed_by_workshop_profile_id IS NULL
    AND superseded_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'WORKSHOP_CONFIRM_DENIED' USING ERRCODE='PT409'; END IF;

 ELSIF p_action='FINAL_READINESS_CONFIRM' THEN
  IF v_order.workflow_status<>'WAITING_MATERIAL'
    OR p_payload->'physicalCheckAttested' IS DISTINCT FROM 'true'::jsonb
  THEN RAISE EXCEPTION 'FINAL_READINESS_PRECONDITION_FAILED' USING ERRCODE='PT409'; END IF;
  v_baseline_id:=(p_payload->>'baselineId')::uuid;
  BEGIN
    v_film_at:=(p_payload->>'filmArrivedAt')::timestamptz;
    v_fixture_at:=(p_payload->>'fixtureArrivedAt')::timestamptz;
    v_incoming_at:=(p_payload->>'incomingArrivedAt')::timestamptz;
    v_signed_sample_at:=(p_payload->>'signedSampleArrivedAt')::timestamptz;
    v_incoming_expected:=(p_payload->>'quantityExpected')::integer;
    v_incoming_arrived:=(p_payload->>'quantityArrived')::integer;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_FINAL_MATERIAL_PAYLOAD' USING ERRCODE='22023';
  END;
  IF v_film_at IS NULL OR v_fixture_at IS NULL OR v_incoming_at IS NULL
    OR v_signed_sample_at IS NULL OR v_incoming_expected IS NULL
    OR v_incoming_arrived IS NULL
    OR v_film_at>pg_catalog.clock_timestamp()+interval '5 minutes'
    OR v_fixture_at>pg_catalog.clock_timestamp()+interval '5 minutes'
    OR v_incoming_at>pg_catalog.clock_timestamp()+interval '5 minutes'
    OR v_signed_sample_at>pg_catalog.clock_timestamp()+interval '5 minutes'
    OR v_incoming_expected<v_order.current_batch_quantity
    OR v_incoming_arrived<v_incoming_expected
  THEN RAISE EXCEPTION 'INVALID_FINAL_MATERIAL_PAYLOAD' USING ERRCODE='22023'; END IF;
  SELECT b.id,b.office_proof_set_digest,b.workshop_proof_set_digest,
    b.office_post_order_version,b.workshop_post_order_version,
    b.confirmed_by_office_profile_id,b.confirmed_by_workshop_profile_id,
    b.office_confirmed_at,b.workshop_confirmed_at
  INTO v_baseline_id,v_office_digest,v_workshop_digest,
    v_office_version,v_workshop_version,v_office_actor,v_workshop_actor,
    v_office_time,v_workshop_time
  FROM public.wos_visual_baselines b
  WHERE b.id=v_baseline_id AND b.organization_id=v_actor.org_id
    AND b.entity_type='PRODUCTION_ORDER' AND b.entity_id=p_order_id
    AND b.version_label=v_label AND b.status='CURRENT'
    AND b.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_office_digest IS NULL OR v_workshop_digest IS NULL
    OR v_office_digest IS DISTINCT FROM v_workshop_digest
    OR v_office_version IS NULL OR v_workshop_version IS NULL
    OR v_office_version+1<>v_workshop_version
    OR v_workshop_version<>p_expected_version
    OR v_office_actor IS NULL OR v_workshop_actor IS NULL
    OR v_office_actor=v_workshop_actor
    OR v_office_time IS NULL OR v_workshop_time IS NULL
    OR v_office_time>v_workshop_time
  THEN RAISE EXCEPTION 'VERIFIED_IMAGE_REQUIRED' USING ERRCODE='PT409'; END IF;
  IF v_actor.id=v_office_actor THEN
    RAISE EXCEPTION 'FINAL_READINESS_OFFICE_SIGNER_FORBIDDEN'
      USING ERRCODE='PT409';
  END IF;
  SELECT proof_digest,last_verified_at
  INTO v_proof_digest,v_proof_verified_at
  FROM public.wos_v1_m2_checked_proof_set(
    p_order_id,v_actor.org_id,v_baseline_id,v_label);
  IF v_proof_digest IS NULL
    OR v_proof_digest IS DISTINCT FROM v_office_digest
    OR v_proof_digest IS DISTINCT FROM v_workshop_digest
    OR v_proof_verified_at>v_office_time
  THEN RAISE EXCEPTION 'VERIFIED_IMAGE_PROOF_CHANGED' USING ERRCODE='PT409'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_blockers b
    WHERE b.organization_id=v_actor.org_id
      AND b.entity_type='PRODUCTION_ORDER' AND b.entity_id=p_order_id
      AND b.status<>'RESOLVED'
  ) THEN RAISE EXCEPTION 'OPEN_BLOCKERS_REMAIN' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.wos_resource_readiness(
    organization_id,entity_type,entity_id,resource_type,status,
    expected_at,arrived_at,quantity_expected,quantity_arrived,
    version_label,confirmed_by_profile_id,confirmed_at,note
  ) VALUES
   (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'FILM','VERSION_VERIFIED',
    NULL,v_film_at,NULL,NULL,v_label,v_actor.id,pg_catalog.clock_timestamp(),v_note),
   (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'FIXTURE','FIT_VERIFIED',
    NULL,v_fixture_at,NULL,NULL,v_label,v_actor.id,pg_catalog.clock_timestamp(),v_note),
   (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'INCOMING_MATERIAL','QUANTITY_VERIFIED',
    NULL,v_incoming_at,v_incoming_expected,v_incoming_arrived,v_label,
    v_actor.id,pg_catalog.clock_timestamp(),v_note),
   (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'SIGNED_SAMPLE','VERIFIED',
    NULL,v_signed_sample_at,NULL,NULL,v_label,v_actor.id,pg_catalog.clock_timestamp(),v_note)
  ON CONFLICT(entity_type,entity_id,resource_type) DO UPDATE SET
    status=EXCLUDED.status,arrived_at=EXCLUDED.arrived_at,
    quantity_expected=EXCLUDED.quantity_expected,
    quantity_arrived=EXCLUDED.quantity_arrived,
    version_label=EXCLUDED.version_label,
    confirmed_by_profile_id=EXCLUDED.confirmed_by_profile_id,
    confirmed_at=EXCLUDED.confirmed_at,note=EXCLUDED.note,
    updated_at=pg_catalog.now()
  WHERE wos_resource_readiness.organization_id=EXCLUDED.organization_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>4 THEN RAISE EXCEPTION 'FINAL_MATERIAL_SET_NOT_PERSISTED' USING ERRCODE='PT409'; END IF;
 END IF;

 -- Any material change or a new selected baseline revokes prior confirmation.
 IF p_action IN ('MATERIAL_RECORD','BASELINE_SELECT') THEN
  UPDATE public.wos_visual_baselines SET
    confirmed_by_office_profile_id=NULL,office_confirmed_at=NULL,
    office_proof_set_digest=NULL,office_post_order_version=NULL,
    confirmed_by_workshop_profile_id=NULL,workshop_confirmed_at=NULL,
    workshop_proof_set_digest=NULL,workshop_post_order_version=NULL
  WHERE organization_id=v_actor.org_id AND entity_type='PRODUCTION_ORDER'
    AND entity_id=p_order_id AND status='CURRENT';
 END IF;

 v_next_status:=CASE WHEN p_action='FINAL_READINESS_CONFIRM'
   THEN 'READINESS_CHECK' ELSE v_order.workflow_status END;
 UPDATE public.wos_production_orders SET version=version+1,
    workflow_status=v_next_status,
    updated_at=pg_catalog.now()
  WHERE id=p_order_id AND organization_id=v_actor.org_id AND version=p_expected_version
    AND workflow_status IN('WAITING_MATERIAL','READINESS_CHECK');
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN RAISE EXCEPTION 'CAS_CONFLICT' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.wos_status_history(
   organization_id,entity_type,entity_id,previous_status,next_status,
   actor_profile_id,actor_role,reason_code,note,metadata)
 VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,
   v_order.workflow_status,v_next_status,v_actor.id,v_actor.role,
   'WOS_V1_M2_'||p_action,v_note,
   pg_catalog.jsonb_build_object(
     'requestId',p_request_id,'action',p_action,
     'expectedVersion',p_expected_version,'newVersion',p_expected_version+1,
     'baselineId',v_baseline_id,'proofDigest',v_proof_digest));

 -- Include the canonical server-generated spec digest, but mark the whole
 -- v8+ lineage UNVERIFIED until a separate authenticated anchor has been
 -- installed after independent review. No auto start or readiness promotion.
 v_after:=public.wos_v1_m2_spec_digest(p_order_id);
 v_next:=p_expected_version+1;
 v_receipt:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object(
     'requestId',p_request_id,'actorProfile',v_actor.id,'orderId',p_order_id,
     'expectedVersion',p_expected_version,'version',v_next,'action',p_action,
     'payloadHash',v_hash,'beforeDigest',v_before,'afterDigest',v_after
   )::text,'UTF8')),'hex');
 v_response:=pg_catalog.jsonb_build_object(
   'status','APPLIED','orderId',p_order_id,'requestId',p_request_id,
   'version',v_next,'productionVersionLabel',v_label,'preSpecDigest',v_before,
   'postSpecDigest',v_after,'receiptDigest',v_receipt,
 'proofStatus','UNVERIFIED','canStart',false,'workflowStatus',v_next_status,
   'baselineId',v_baseline_id);
 INSERT INTO public.wos_v1_m2_receipts(
  request_id,organization_id,order_id,actor_profile_id,action,
  expected_version,payload_fingerprint,before_spec_digest,after_spec_digest,
  receipt_digest,production_version_label,result_json)
 VALUES(p_request_id,v_actor.org_id,p_order_id,v_actor.id,p_action,p_expected_version,
     v_hash,v_before,v_after,v_receipt,v_label,v_response);
 RETURN v_response;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
END;
$fn$;
REVOKE ALL ON FUNCTION public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;

-- Third-person manual release after both signatures. This does not start a
-- machine or mutate the order to IN_PRODUCTION; it only authorizes scheduling
-- by moving READINESS_CHECK to READY_TO_START under a separate human decision.
CREATE OR REPLACE FUNCTION public.wos_v1_authorize_production_start(
 p_order_id uuid,
 p_expected_version integer,
 p_request_id uuid,
 p_baseline_id uuid,
 p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $release$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_baseline public.wos_visual_baselines%ROWTYPE;
 v_office public.profiles%ROWTYPE;
 v_workshop public.profiles%ROWTYPE;
 v_prior public.wos_v1_start_releases%ROWTYPE;
 v_hash text;
 v_proof_digest text;
 v_proof_verified_at timestamptz;
 v_current_spec text;
 v_resource_count integer;
 v_response jsonb;
BEGIN
 IF p_order_id IS NULL
   OR p_request_id IS NULL
   OR p_baseline_id IS NULL
   OR p_expected_version IS NULL
   OR p_expected_version < 1
   OR p_note IS NULL
   OR length(pg_catalog.btrim(p_note)) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT v_actor
 FROM public.profiles profile
 WHERE profile.user_id=auth.uid()
   AND profile.is_active=true
   AND profile.role IN ('manager','admin');

 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.jsonb_build_object(
     'orderId',p_order_id,
     'expectedVersion',p_expected_version,
     'requestId',p_request_id,
     'baselineId',p_baseline_id,
     'note',pg_catalog.btrim(p_note)
   )::text,'UTF8')),'hex');

 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(
     'wos-v1-start-release:'||p_request_id::text,0));
 SELECT * INTO v_prior
 FROM public.wos_v1_start_releases release
 WHERE release.request_id=p_request_id;
 IF FOUND THEN
   IF v_prior.organization_id<>v_actor.org_id
     OR v_prior.order_id<>p_order_id
     OR v_prior.actor_profile_id<>v_actor.id
     OR v_prior.expected_version<>p_expected_version
     OR v_prior.baseline_id<>p_baseline_id
     OR v_prior.payload_fingerprint<>v_hash
   THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN v_prior.result_json||pg_catalog.jsonb_build_object(
     'status','REPLAYED');
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('wos-v1-m2:'||p_order_id::text,0));
 SELECT * INTO v_order
 FROM public.wos_production_orders production_order
 WHERE production_order.id=p_order_id
   AND production_order.organization_id=v_actor.org_id
 FOR UPDATE;
 IF NOT FOUND
   OR v_order.workflow_status<>'READINESS_CHECK'
   OR v_order.version<>p_expected_version
 THEN RAISE EXCEPTION 'START_RELEASE_STATE_CONFLICT' USING ERRCODE='PT409'; END IF;

 SELECT * INTO v_baseline
 FROM public.wos_visual_baselines baseline
 WHERE baseline.id=p_baseline_id
   AND baseline.organization_id=v_actor.org_id
   AND baseline.entity_type='PRODUCTION_ORDER'
   AND baseline.entity_id=p_order_id
   AND baseline.version_label=v_order.version_label
   AND baseline.status='CURRENT'
   AND baseline.superseded_at IS NULL
 FOR UPDATE;
 IF NOT FOUND
   OR v_baseline.confirmed_by_office_profile_id IS NULL
   OR v_baseline.confirmed_by_workshop_profile_id IS NULL
   OR v_baseline.office_confirmed_at IS NULL
   OR v_baseline.workshop_confirmed_at IS NULL
   OR v_baseline.office_confirmed_at>v_baseline.workshop_confirmed_at
   OR v_baseline.office_proof_set_digest IS NULL
   OR v_baseline.workshop_proof_set_digest IS NULL
   OR v_baseline.office_proof_set_digest IS DISTINCT FROM
      v_baseline.workshop_proof_set_digest
   OR v_baseline.confirmed_by_office_profile_id=
      v_baseline.confirmed_by_workshop_profile_id
   OR v_baseline.office_post_order_version IS NULL
   OR v_baseline.workshop_post_order_version IS NULL
   OR v_baseline.office_post_order_version<>p_expected_version-2
   OR v_baseline.workshop_post_order_version<>p_expected_version-1
 THEN RAISE EXCEPTION 'DUAL_SIGNOFF_REQUIRED' USING ERRCODE='PT409'; END IF;

 SELECT * INTO v_office
 FROM public.profiles profile
 WHERE profile.id=v_baseline.confirmed_by_office_profile_id
   AND profile.org_id=v_actor.org_id
   AND profile.is_active=true
   AND profile.role IN ('sales','manager','admin');
 IF NOT FOUND
   OR v_office.id=v_actor.id
 THEN RAISE EXCEPTION 'OFFICE_SIGNOFF_ACTOR_INVALID' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v_workshop
 FROM public.profiles profile
 WHERE profile.id=v_baseline.confirmed_by_workshop_profile_id
   AND profile.org_id=v_actor.org_id
   AND profile.is_active=true
   AND profile.role IN ('operator','manager','admin');
 IF NOT FOUND
   OR v_workshop.id=v_actor.id
 THEN RAISE EXCEPTION 'WORKSHOP_SIGNOFF_ACTOR_INVALID' USING ERRCODE='PT409'; END IF;

 SELECT count(*) INTO v_resource_count
 FROM public.wos_resource_readiness resource
 WHERE resource.organization_id=v_actor.org_id
   AND resource.entity_type='PRODUCTION_ORDER'
   AND resource.entity_id=p_order_id
   AND resource.version_label=v_order.version_label
   AND resource.confirmed_by_profile_id IS NOT NULL
   AND resource.confirmed_at IS NOT NULL
   AND (
     (resource.resource_type='FILM'
       AND resource.status='VERSION_VERIFIED')
     OR (resource.resource_type='FIXTURE'
       AND resource.status='FIT_VERIFIED')
     OR (resource.resource_type='INCOMING_MATERIAL'
       AND resource.status='QUANTITY_VERIFIED'
       AND resource.quantity_expected IS NOT NULL
       AND resource.quantity_arrived IS NOT NULL
       AND resource.quantity_expected>=v_order.current_batch_quantity
       AND resource.quantity_arrived>=resource.quantity_expected)
     OR (resource.resource_type='SIGNED_SAMPLE'
       AND resource.status='VERIFIED')
   );
 IF v_resource_count<>4 THEN
   RAISE EXCEPTION 'FINAL_MATERIAL_SET_REQUIRED' USING ERRCODE='PT409'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.wos_blockers blocker
   WHERE blocker.organization_id=v_actor.org_id
     AND blocker.entity_type='PRODUCTION_ORDER'
     AND blocker.entity_id=p_order_id
     AND blocker.status<>'RESOLVED'
 ) THEN RAISE EXCEPTION 'OPEN_BLOCKERS_REMAIN' USING ERRCODE='PT409'; END IF;

 v_current_spec:=public.wos_v1_m2_spec_digest(p_order_id);
 IF v_current_spec IS NULL OR NOT EXISTS (
   SELECT 1
   FROM public.wos_v1_m2_receipts receipt
   JOIN public.profiles final_actor
     ON final_actor.id=receipt.actor_profile_id
     AND final_actor.org_id=v_actor.org_id
     AND final_actor.is_active=true
     AND final_actor.role IN ('operator','manager','admin')
   WHERE receipt.organization_id=v_actor.org_id
     AND receipt.order_id=p_order_id
     AND receipt.action='FINAL_READINESS_CONFIRM'
     AND receipt.actor_profile_id<>
       v_baseline.confirmed_by_office_profile_id
     AND receipt.expected_version=p_expected_version-1
     AND receipt.production_version_label=v_order.version_label
     AND receipt.after_spec_digest=v_current_spec
 ) THEN
   RAISE EXCEPTION 'FINAL_READINESS_RECEIPT_REQUIRED' USING ERRCODE='PT409';
 END IF;

 SELECT proof_digest,last_verified_at
 INTO v_proof_digest,v_proof_verified_at
 FROM public.wos_v1_m2_checked_proof_set(
   p_order_id,v_actor.org_id,p_baseline_id,v_order.version_label);
 IF v_proof_digest IS NULL
   OR v_proof_digest IS DISTINCT FROM
      v_baseline.office_proof_set_digest
   OR v_proof_digest IS DISTINCT FROM
      v_baseline.workshop_proof_set_digest
   OR v_proof_verified_at>v_baseline.office_confirmed_at
 THEN RAISE EXCEPTION 'CURRENT_PROOF_SET_REQUIRED' USING ERRCODE='PT409'; END IF;

 UPDATE public.wos_production_orders
 SET workflow_status='READY_TO_START',
     version=version+1,
     updated_at=pg_catalog.clock_timestamp()
 WHERE id=p_order_id
   AND organization_id=v_actor.org_id
   AND version=p_expected_version
   AND workflow_status='READINESS_CHECK';
 IF NOT FOUND THEN
   RAISE EXCEPTION 'START_RELEASE_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;

 INSERT INTO public.wos_confirmations(
   organization_id,entity_type,entity_id,confirmation_type,decision,
   profile_id,role_snapshot,note)
 VALUES(
   v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'START_RELEASE','CONFIRMED',
   v_actor.id,v_actor.role,pg_catalog.btrim(p_note));

 v_response:=pg_catalog.jsonb_build_object(
   'status','AUTHORIZED',
   'orderId',p_order_id,
   'requestId',p_request_id,
   'version',p_expected_version+1,
   'productionVersionLabel',v_order.version_label,
   'workflowStatus','READY_TO_START',
   'baselineId',p_baseline_id,
   'proofSetDigest',v_proof_digest,
   'manualStartAuthorized',true,
   'productionStarted',false,
   'canStart',false);
 INSERT INTO public.wos_v1_start_releases(
   request_id,organization_id,order_id,baseline_id,actor_profile_id,
   expected_version,payload_fingerprint,proof_set_digest,
   office_profile_id,workshop_profile_id,result_json)
 VALUES(
   p_request_id,v_actor.org_id,p_order_id,p_baseline_id,v_actor.id,
   p_expected_version,v_hash,v_proof_digest,
   v_office.id,v_workshop.id,v_response);
 INSERT INTO public.wos_status_history(
   organization_id,entity_type,entity_id,previous_status,next_status,
   actor_profile_id,actor_role,reason_code,note,metadata)
 VALUES(
   v_actor.org_id,'PRODUCTION_ORDER',p_order_id,
   'READINESS_CHECK','READY_TO_START',v_actor.id,v_actor.role,
   'WOS_V1_START_RELEASE',pg_catalog.btrim(p_note),
   pg_catalog.jsonb_build_object(
     'requestId',p_request_id,
     'expectedVersion',p_expected_version,
     'newVersion',p_expected_version+1,
     'baselineId',p_baseline_id,
     'proofSetDigest',v_proof_digest,
     'productionStarted',false));
 RETURN v_response;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
END;
$release$;
REVOKE ALL ON FUNCTION public.wos_v1_authorize_production_start(
  uuid,integer,uuid,uuid,text
) FROM PUBLIC,anon,authenticated;

COMMIT;
