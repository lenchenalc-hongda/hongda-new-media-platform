-- WOS P2 M2 / QA ONLY / NOT INSTALLED / NOT AUTHORIZED
-- Review-only source proposal. No caller may execute against QA or production.
-- Intended project: xulmpqaknlwqqculbsek. Requires separate Owner+independent
-- Reviewer approval, exact blob and SHA, quarantine of previous QA synthetic
-- order, 15-minute expiry and READ/WRITE switch verification.
BEGIN;

-- New isolated Gate. Do NOT relax legacy wos_qa_p2_execution_gate check
-- (it accepts ONLY OPERATOR_WRITES); legacy P2 stays disabled.
CREATE TABLE IF NOT EXISTS public.wos_qa_p2_m2_gate (
 gate_name text PRIMARY KEY CHECK (gate_name IN ('M2_OPERATOR_WRITES','M2_OFFICE_WRITES')),
 enabled boolean NOT NULL DEFAULT false,
 enabled_until timestamptz,
 approval_reference text NOT NULL DEFAULT 'NOT_AUTHORIZED',
 allowed_order_id uuid,
 allowed_organization_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT enabled OR
        enabled_until IS NOT NULL AND
        length(btrim(approval_reference))>=12 AND
        allowed_order_id IS NOT NULL AND allowed_organization_id IS NOT NULL)
);
ALTER TABLE public.wos_qa_p2_m2_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_m2_gate FROM PUBLIC,anon,authenticated;
INSERT INTO public.wos_qa_p2_m2_gate(gate_name,enabled,approval_reference)
 VALUES ('M2_OPERATOR_WRITES',false,'NOT_AUTHORIZED'),('M2_OFFICE_WRITES',false,'NOT_AUTHORIZED')
 ON CONFLICT(gate_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wos_qa_p2_m2_receipts (
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK (action IN ('MATERIAL_RECORD','BASELINE_SELECT',
                 'BASELINE_OFFICE_CONFIRM','BASELINE_WORKSHOP_CONFIRM')),
 expected_version integer NOT NULL CHECK (expected_version>=1),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[0-9a-f]{64}$'),
 before_spec_digest text NOT NULL CHECK(before_spec_digest ~ '^[0-9a-f]{64}$'),
 after_spec_digest text NOT NULL CHECK(after_spec_digest ~ '^[0-9a-f]{64}$'),
 receipt_digest text NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
 production_version_label text NOT NULL,
 result_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wos_qa_p2_m2_receipts_order_version_idx
 ON public.wos_qa_p2_m2_receipts(order_id,expected_version);
ALTER TABLE public.wos_qa_p2_m2_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_m2_receipts FROM PUBLIC,anon,authenticated;

-- UNIQUE CURRENT baseline at the database level. Do not install before
-- independent audit of all existing QA rows and full rollback/restore.
CREATE UNIQUE INDEX IF NOT EXISTS wos_p2_m2_one_current_baseline_per_entity
 ON public.wos_visual_baselines(organization_id,entity_type,entity_id)
 WHERE status='CURRENT';

-- Non-production, NOT INSTALLED: immutable Office/Workshop proof commitments.
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
-- NOTE: this remains an UNINSTALLED SQL review proposal; never grant EXECUTE
-- or activate a QA database gate based on this source alone.
CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_checked_proof_set(
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
 IF v_total NOT BETWEEN 3 AND 12 THEN
  RAISE EXCEPTION 'BASELINE_IMAGE_COUNT_INVALID' USING ERRCODE='PT409'; END IF;
 WITH locked_proofs AS MATERIALIZED (
  SELECT im.id AS image_id,im.category,im.version_label,
    im.storage_bucket,im.storage_path,pf.storage_object_id,
    pf.storage_object_version,pf.storage_object_updated_at,
    pf.verified_sha256,pf.verified_at,pf.expires_at
  FROM public.wos_visual_baseline_items bi
  JOIN public.wos_reference_images im ON im.id=bi.reference_image_id
  JOIN public.wos_qa_verified_image_proofs pf
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
   ARRAY['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE']::text[]<@v_categories,false)
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
REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Private helper: only the reviewed SECURITY DEFINER M2 action can call.
-- Digest is computed *server-side* from order specifications and the
-- currently selected image IDs; never trust a browser-supplied digest.
CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_spec_digest(p_order_id uuid)
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
    LEFT JOIN public.wos_qa_verified_image_proofs pf
      ON pf.image_id=im.id AND pf.organization_id=o.organization_id
      AND pf.order_id=o.id AND pf.storage_bucket=im.storage_bucket
      AND pf.storage_path=im.storage_path
   WHERE vb.organization_id=o.organization_id AND vb.entity_type='PRODUCTION_ORDER'
     AND vb.entity_id=o.id AND vb.status='CURRENT'
 ) b ON true
 WHERE o.id=p_order_id;
$fn$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_spec_digest(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_action(
 p_order_id uuid,p_expected_version integer,p_request_id uuid,
 p_action text,p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_prior public.wos_qa_p2_m2_receipts%ROWTYPE;
 v_gate text;
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
 v_image_id uuid;
 v_ids uuid[];
 v_n integer;
 v_note text;
 v_count integer;
 v_allowed boolean;
 v_next integer;
 v_key text;
 v_accepted_keys text[];
BEGIN
 IF p_order_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL
    OR p_expected_version NOT BETWEEN 1 AND 2147483646
    OR p_action NOT IN ('MATERIAL_RECORD','BASELINE_SELECT','BASELINE_OFFICE_CONFIRM','BASELINE_WORKSHOP_CONFIRM')
    OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object'
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT v_actor FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active=true
    AND ((p_action IN ('MATERIAL_RECORD','BASELINE_WORKSHOP_CONFIRM')
          AND p.role IN ('operator','manager','admin'))
       OR (p_action IN ('BASELINE_SELECT','BASELINE_OFFICE_CONFIRM')
          AND p.role IN ('sales','manager','admin')));
 v_gate:=CASE WHEN p_action IN ('MATERIAL_RECORD','BASELINE_WORKSHOP_CONFIRM')
       THEN 'M2_OPERATOR_WRITES' ELSE 'M2_OFFICE_WRITES' END;
 -- Fail closed unless an independently authorised, order-specific, short
 -- lived gate is ON (<= 15 min from current clock) for exactly this org/order.
 IF NOT EXISTS(
   SELECT 1 FROM public.wos_qa_p2_m2_gate g
   WHERE g.gate_name=v_gate AND g.enabled=true AND
     g.allowed_order_id=p_order_id AND g.allowed_organization_id=v_actor.org_id
     AND g.approval_reference<>'NOT_AUTHORIZED'
     AND g.enabled_until>pg_catalog.clock_timestamp()
     AND g.enabled_until<=pg_catalog.clock_timestamp()+interval '15 minutes'
 ) THEN RAISE EXCEPTION 'QA_M2_DB_GATE_CLOSED' USING ERRCODE='42501'; END IF;
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
 ELSE ARRAY['productionVersionLabel','note','baselineId'] END END;
 SELECT count(*) INTO v_count FROM pg_catalog.jsonb_object_keys(p_payload) AS field
  WHERE field<>ALL(v_accepted_keys);
 IF v_count<>0 THEN RAISE EXCEPTION 'INVALID_PAYLOAD_KEYS' USING ERRCODE='22023'; END IF;
 -- Never allow a user-chosen order/organization/actor/digest in the payload.
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.jsonb_build_object('order',p_order_id,'expectedVersion',p_expected_version,
       'action',p_action,'payload',p_payload)::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-qa-m2:'||p_order_id::text,0));
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id
   AND order_number LIKE 'QA-%' FOR UPDATE;
 IF NOT FOUND OR v_order.workflow_status NOT IN ('WAITING_MATERIAL','READINESS_CHECK')
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_prior FROM public.wos_qa_p2_m2_receipts WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.organization_id<>v_actor.org_id OR v_prior.order_id<>p_order_id
     OR v_prior.actor_profile_id<>v_actor.id OR v_prior.action<>p_action
     OR v_prior.expected_version<>p_expected_version
     OR v_prior.payload_fingerprint<>v_hash
  THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN v_prior.result_json||pg_catalog.jsonb_build_object('status','REPLAYED');
 END IF;
 IF v_order.version<>p_expected_version
 THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF v_order.version_label<>v_label
 THEN RAISE EXCEPTION 'PRODUCTION_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 v_before:=public.wos_qa_p2_m2_spec_digest(p_order_id);
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
  IF v_final AND (p_payload->>'physicalCheckAttested')::boolean IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'ATTESTATION_REQUIRED' USING ERRCODE='22023'; END IF;
  v_expected_at:=NULLIF(p_payload->>'expectedAt','')::timestamptz;
  v_arrived_at:=NULLIF(p_payload->>'arrivedAt','')::timestamptz;
  IF v_final AND v_arrived_at IS NULL
  THEN RAISE EXCEPTION 'ARRIVAL_REQUIRED' USING ERRCODE='22023'; END IF;
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
       v_qty_expected<0 OR v_qty_arrived<0 OR
       (v_final AND(v_qty_expected<v_order.current_batch_quantity OR
         v_qty_arrived<v_qty_expected OR v_qty_arrived<v_order.current_batch_quantity))
    THEN RAISE EXCEPTION 'INCOMING_QUANTITY_NOT_READY' USING ERRCODE='22023'; END IF;
  ELSIF v_qty_expected IS NOT NULL OR v_qty_arrived IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_QUANTITIES' USING ERRCODE='22023';
  END IF;
  -- Film and signed-sample "VERIFIED" requires real image and current valid
  -- private-object SHA proof; a browser checkbox alone cannot create proof.
  -- Final FILM and SIGNED_SAMPLE must be linked to an independently
  -- double-confirmed CURRENT baseline with an unexpired private SHA proof.
  IF v_final AND v_resource IN ('FILM','SIGNED_SAMPLE') AND NOT EXISTS(
    SELECT 1 FROM public.wos_visual_baselines b
      JOIN public.wos_visual_baseline_items bi ON bi.baseline_id=b.id
      JOIN public.wos_reference_images im ON im.id=bi.reference_image_id
      JOIN public.wos_qa_verified_image_proofs pf
       ON pf.image_id=im.id AND pf.order_id=v_order.id
       AND pf.organization_id=v_actor.org_id
       AND pf.storage_bucket=im.storage_bucket AND pf.storage_path=im.storage_path
    WHERE b.organization_id=v_actor.org_id AND b.entity_id=v_order.id
      AND b.entity_type='PRODUCTION_ORDER' AND b.version_label=v_label
      AND b.status='CURRENT' AND b.superseded_at IS NULL
      AND b.office_confirmed_at IS NOT NULL AND b.workshop_confirmed_at IS NOT NULL
      AND b.confirmed_by_office_profile_id IS NOT NULL
      AND b.confirmed_by_workshop_profile_id IS NOT NULL
      AND b.confirmed_by_office_profile_id<>b.confirmed_by_workshop_profile_id
      AND im.organization_id=v_actor.org_id AND im.entity_id=v_order.id
      AND im.entity_type='PRODUCTION_ORDER' AND im.version_label=v_label
      AND im.image_status='READY' AND im.superseded_at IS NULL
      AND im.storage_bucket='wos-private'
      AND im.category=CASE WHEN v_resource='FILM' THEN 'FILM_PATTERN' ELSE 'SIGNED_SAMPLE' END
      AND pf.expires_at>pg_catalog.clock_timestamp()
      AND pf.verified_sha256 ~ '^[a-f0-9]{64}$'
  ) THEN RAISE EXCEPTION 'VERIFIED_IMAGE_REQUIRED' USING ERRCODE='PT409'; END IF;
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
   OR pg_catalog.jsonb_array_length(p_payload->'imageIds') NOT BETWEEN 3 AND 12
  THEN RAISE EXCEPTION 'INVALID_IMAGES' USING ERRCODE='22023'; END IF;
  SELECT pg_catalog.array_agg(img_id.value::uuid) INTO v_ids
    FROM pg_catalog.jsonb_array_elements_text(p_payload->'imageIds') AS img_id(value);
  IF (SELECT count(DISTINCT image_id.value) FROM pg_catalog.unnest(v_ids) AS image_id(value))<>pg_catalog.array_length(v_ids,1)
  THEN RAISE EXCEPTION 'DUPLICATE_IMAGES' USING ERRCODE='22023'; END IF;
  -- each supplied image needs its own valid, current private storage proof.
  SELECT count(*) INTO v_count FROM public.wos_reference_images im
    JOIN public.wos_qa_verified_image_proofs pf
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
   SELECT 1 FROM pg_catalog.unnest(ARRAY['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE']) AS needed(category)
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
  PERFORM 1 FROM public.wos_qa_p2_m2_checked_proof_set(
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
    FROM public.wos_qa_p2_m2_checked_proof_set(
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
    FROM public.wos_qa_p2_m2_checked_proof_set(
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

 UPDATE public.wos_production_orders SET version=version+1,
    updated_at=pg_catalog.now()
  WHERE id=p_order_id AND organization_id=v_actor.org_id AND version=p_expected_version
    AND workflow_status IN('WAITING_MATERIAL','READINESS_CHECK');
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN RAISE EXCEPTION 'CAS_CONFLICT' USING ERRCODE='PT409'; END IF;

 -- Include the canonical server-generated spec digest, but mark the whole
 -- v8+ lineage UNVERIFIED until a separate authenticated anchor has been
 -- installed after independent review. No auto start or readiness promotion.
 v_after:=public.wos_qa_p2_m2_spec_digest(p_order_id);
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
   'proofStatus','UNVERIFIED','canStart',false,'workflowStatus',v_order.workflow_status,
   'baselineId',v_baseline_id);
 INSERT INTO public.wos_qa_p2_m2_receipts(
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
REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
-- Separate Owner-approved installation/review would have to explicitly:
-- GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
--   TO authenticated;
-- That GRANT is INTENTIONALLY OMITTED. Even an accidental SQL installation
-- remains inaccessible until separate privilege and QA Gate approvals.
COMMIT;
-- NOT_INSTALLED_AND_NOT_AUTHORIZED -- no execution permitted this turn.
