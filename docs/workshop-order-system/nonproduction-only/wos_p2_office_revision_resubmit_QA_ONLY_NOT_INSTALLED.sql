-- QA-ONLY DESIGN AND REVIEW ARTIFACT. **NOT INSTALLED**.
-- This file is NOT in supabase/migrations. Never apply to Production.
-- Requires a NEW independent exact-HEAD audit, a NEW explicit owner database
-- installation approval, and a SEPARATE activation approval.
-- Target QA project if later authorized: xulmpqaknlwqqculbsek
-- Forbidden Production project: amqpvxrurenevniilhtl
-- Existing P1 receipt and workshop Inbox are immutable; no extra Inbox row.
-- Resubmission returns to WORKSHOP_REVIEW with current version, not
-- SUBMITTED, so previously consumed P1 receipt remains valid and inspectable.
BEGIN;

CREATE TABLE public.wos_qa_p2_office_execution_gate (
  gate_name text PRIMARY KEY CHECK (gate_name='OFFICE_WRITES'),
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text NOT NULL DEFAULT 'NOT_AUTHORIZED',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (enabled_until IS NOT NULL AND length(btrim(approval_reference))>=12))
);
INSERT INTO public.wos_qa_p2_office_execution_gate(gate_name,enabled,approval_reference)
VALUES('OFFICE_WRITES',false,'NOT_AUTHORIZED');
ALTER TABLE public.wos_qa_p2_office_execution_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_office_execution_gate FROM PUBLIC,anon,authenticated;

CREATE TABLE public.wos_qa_p2_office_revisions (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action IN ('SAVE_CORRECTION','RESUBMIT_CORRECTION')),
  expected_version integer NOT NULL CHECK (expected_version>=2),
  new_version integer NOT NULL CHECK (new_version=expected_version+1),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id,new_version)
);
CREATE INDEX wos_qa_p2_office_revisions_history_idx
  ON public.wos_qa_p2_office_revisions(organization_id,order_id,created_at DESC);
ALTER TABLE public.wos_qa_p2_office_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_office_revisions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wos_qa_p2_office_revision(
  p_order_id uuid, p_expected_version integer, p_request_id uuid,
  p_action text, p_patch jsonb, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $office$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_count integer;
  v_order public.wos_production_orders%ROWTYPE;
  v_after public.wos_production_orders%ROWTYPE;
  v_prior public.wos_qa_p2_office_revisions%ROWTYPE;
  v_key text;
  v_fingerprint text;
  v_qty integer;
  v_batch integer;
  v_state text;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wos_qa_p2_office_execution_gate g
    WHERE g.gate_name='OFFICE_WRITES'
      AND g.enabled=true
      AND g.enabled_until>pg_catalog.clock_timestamp()
      AND g.enabled_until<=pg_catalog.clock_timestamp()+INTERVAL '24 hours'
      AND g.approval_reference<>'NOT_AUTHORIZED'
  ) THEN RAISE EXCEPTION 'QA_P2_OFFICE_DB_EXECUTION_NOT_AUTHORIZED'
    USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL OR p_order_id IS NULL OR p_request_id IS NULL
      OR p_expected_version IS NULL OR p_expected_version<2
      OR p_action NOT IN ('SAVE_CORRECTION','RESUBMIT_CORRECTION')
      OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch)<>'object'
      OR (p_action='SAVE_CORRECTION' AND p_patch='{}'::jsonb)
      OR pg_catalog.octet_length(p_patch::text)>4096
      OR p_reason IS NULL OR length(pg_catalog.btrim(p_reason)) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;

  SELECT count(*) INTO v_count FROM public.profiles
    WHERE user_id=auth.uid() AND is_active=true
      AND role IN ('admin','manager','sales');
  IF v_count<>1 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles
    WHERE user_id=auth.uid() AND is_active=true
      AND role IN ('admin','manager','sales') LIMIT 1;

  -- These are ONLY the fields the returned Office order may correct.
  -- Identity, organization, customer/project references, owners, original
  -- submission receipt and Inbox remain immutable. The CURRENT version label
  -- MUST advance so prior signed image / visual baseline cannot authorize it.
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_patch) LOOP
    IF v_key NOT IN ('productName','productMaterial','requestedQuantity',
        'currentBatchQuantity','customerAcceptanceStandard','positionReference')
    THEN RAISE EXCEPTION 'FIELD_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    IF (p_patch->v_key)='null'::jsonb THEN
      RAISE EXCEPTION 'NULL_FIELD_DENIED' USING ERRCODE='22023'; END IF;
    IF v_key IN ('requestedQuantity','currentBatchQuantity') THEN
      IF pg_catalog.jsonb_typeof(p_patch->v_key)<>'number'
         OR (p_patch->>v_key) !~ '^[1-9][0-9]{0,9}$'
         OR (p_patch->>v_key)::numeric>2147483647
      THEN RAISE EXCEPTION 'POSITIVE_INTEGER_REQUIRED' USING ERRCODE='22023'; END IF;
    ELSE
      IF pg_catalog.jsonb_typeof(p_patch->v_key)<>'string'
        OR pg_catalog.length(pg_catalog.btrim(p_patch->>v_key))<1
        OR pg_catalog.length(p_patch->>v_key)>CASE
          WHEN v_key IN ('productName','productMaterial') THEN 200 ELSE 2000 END
      THEN RAISE EXCEPTION 'TEXT_REQUIRED' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  v_fingerprint:=pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'orderId',p_order_id,'expectedVersion',p_expected_version,
      'action',p_action,'patch',p_patch,'reason',pg_catalog.btrim(p_reason)
    )::text,'UTF8')),'hex');

  -- Same order advisory family as P2 Operator RPC; safe against cross-role
  -- races with Operator return/material CAS using this same lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wos-qa-p2:'||p_order_id::text,0));
  SELECT * INTO v_order FROM public.wos_production_orders
    WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
  IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
      OR v_order.order_number NOT LIKE 'QA-%'
      OR (v_actor.role='sales' AND v_order.created_by_profile_id<>v_actor.id)
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_prior FROM public.wos_qa_p2_office_revisions
    WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_prior.order_id<>p_order_id
       OR v_prior.organization_id<>v_actor.org_id
       OR v_prior.actor_profile_id<>v_actor.id
       OR v_prior.action<>p_action
       OR v_prior.expected_version<>p_expected_version
       OR v_prior.payload_fingerprint<>v_fingerprint
    THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_prior.response_json || pg_catalog.jsonb_build_object('status','REPLAYED');
  END IF;

  IF v_order.workflow_status<>'NEEDS_INFORMATION'
    OR v_order.version<>p_expected_version
    OR NOT EXISTS (
      SELECT 1 FROM public.wos_blockers b
      WHERE b.entity_type='PRODUCTION_ORDER' AND b.entity_id=p_order_id
        AND b.organization_id=v_actor.org_id AND b.status='OPEN'
    )
  THEN RAISE EXCEPTION 'RETURN_OR_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wos_workshop_inbox i
    JOIN public.wos_submission_receipts r ON r.id=i.submission_id
    WHERE i.order_id=p_order_id AND i.organization_id=v_actor.org_id
      AND i.workflow_status='SUBMITTED'
      AND r.order_id=p_order_id AND r.organization_id=v_actor.org_id
      AND i.source_revision=r.source_revision
      AND i.source_version_label=r.source_version_label
      AND i.source_revision+1<v_order.version
      AND (i.source_version_label=v_order.version_label OR EXISTS (
        SELECT 1 FROM public.wos_qa_p2_office_revisions rr
        WHERE rr.order_id=v_order.id AND rr.organization_id=v_actor.org_id
          AND rr.new_version=v_order.version
          AND rr.after_snapshot->>'versionLabel'=v_order.version_label
          AND v_order.version_label LIKE 'QA-R%'
      ))
  ) THEN RAISE EXCEPTION 'ORIGINAL_SUBMISSION_RECEIPT_MISSING'
     USING ERRCODE='PT409'; END IF;
  IF p_action='RESUBMIT_CORRECTION' AND p_patch='{}'::jsonb AND NOT EXISTS (
    SELECT 1 FROM public.wos_qa_p2_office_revisions saved
    WHERE saved.order_id=p_order_id AND saved.organization_id=v_actor.org_id
      AND saved.new_version=v_order.version AND saved.action='SAVE_CORRECTION'
      AND saved.after_snapshot->>'versionLabel'=v_order.version_label
  ) THEN RAISE EXCEPTION 'SAVED_CORRECTION_REQUIRED'
    USING ERRCODE='PT409'; END IF;
  v_qty:=CASE WHEN p_patch?'requestedQuantity' THEN
    (p_patch->>'requestedQuantity')::integer ELSE v_order.requested_quantity END;
  v_batch:=CASE WHEN p_patch?'currentBatchQuantity' THEN
    (p_patch->>'currentBatchQuantity')::integer ELSE v_order.current_batch_quantity END;
  IF v_qty<1 OR v_batch<1 OR v_batch>v_qty THEN
    RAISE EXCEPTION 'BATCH_EXCEEDS_ORDER' USING ERRCODE='22023'; END IF;

  v_state:=CASE WHEN p_action='SAVE_CORRECTION'
    THEN 'NEEDS_INFORMATION' ELSE 'WORKSHOP_REVIEW' END;
  UPDATE public.wos_production_orders SET
    product_name=CASE WHEN p_patch?'productName' THEN
      pg_catalog.btrim(p_patch->>'productName') ELSE product_name END,
    product_material=CASE WHEN p_patch?'productMaterial' THEN
      pg_catalog.btrim(p_patch->>'productMaterial') ELSE product_material END,
    requested_quantity=v_qty,current_batch_quantity=v_batch,
    customer_acceptance_standard=CASE WHEN p_patch?'customerAcceptanceStandard'
      THEN pg_catalog.btrim(p_patch->>'customerAcceptanceStandard')
      ELSE customer_acceptance_standard END,
    position_reference=CASE WHEN p_patch?'positionReference'
      THEN pg_catalog.btrim(p_patch->>'positionReference')
      ELSE position_reference END,
    version=version+1,
    version_label='QA-R'||(version+1)::text,
    workflow_status=v_state,updated_at=pg_catalog.now()
  WHERE id=p_order_id AND organization_id=v_actor.org_id
    AND version=p_expected_version AND workflow_status='NEEDS_INFORMATION'
  RETURNING * INTO v_after;
  IF NOT FOUND THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;

  v_result:=pg_catalog.jsonb_build_object(
    'status',CASE WHEN p_action='SAVE_CORRECTION' THEN 'UPDATED' ELSE 'RESUBMITTED' END,
    'orderId',p_order_id,'requestId',p_request_id,'version',v_after.version,
    'workflowStatus',v_after.workflow_status,
    'versionLabel',v_after.version_label);
  INSERT INTO public.wos_qa_p2_office_revisions(
    request_id,organization_id,order_id,actor_profile_id,action,
    expected_version,new_version,payload_fingerprint,reason,
    before_snapshot,after_snapshot,response_json)
  VALUES(p_request_id,v_actor.org_id,p_order_id,v_actor.id,p_action,
    p_expected_version,v_after.version,v_fingerprint,pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'version',v_order.version,'versionLabel',v_order.version_label,
      'productName',v_order.product_name,
      'productMaterial',v_order.product_material,
      'requestedQuantity',v_order.requested_quantity,
      'currentBatchQuantity',v_order.current_batch_quantity,
      'customerAcceptanceStandard',v_order.customer_acceptance_standard,
      'positionReference',v_order.position_reference),
    pg_catalog.jsonb_build_object(
      'version',v_after.version,'versionLabel',v_after.version_label,
      'productName',v_after.product_name,
      'productMaterial',v_after.product_material,
      'requestedQuantity',v_after.requested_quantity,
      'currentBatchQuantity',v_after.current_batch_quantity,
      'customerAcceptanceStandard',v_after.customer_acceptance_standard,
      'positionReference',v_after.position_reference),
    v_result);
  INSERT INTO public.wos_status_history(
    organization_id,entity_type,entity_id,previous_status,next_status,
    actor_profile_id,actor_role,reason_code,note,metadata)
  VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,
    v_order.workflow_status,v_state,v_actor.id,v_actor.role,
    'QA_P2_OFFICE_'||p_action,pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('requestId',p_request_id,
      'expectedVersion',p_expected_version,
      'newVersion',v_after.version,
      'fieldsChanged',p_patch));
  -- Deliberately DO NOT mark OPEN workshop blocker RESOLVED:
  -- Operator must still confirm the new documentation; start remains blocked.
  -- Deliberately DO NOT insert a second P1 Inbox or change its receipt pointer.
  RETURN v_result;
END;
$office$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_office_revision(
  uuid,integer,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_office_revision(
  uuid,integer,uuid,text,jsonb,text) TO authenticated;


-- Operator-only re-review of the EXACT resubmitted Office revision. This
-- never authorizes scheduling, READY or START. It only resolves the specific
-- DOCUMENT blockers after a real authorized workshop acknowledgment.
CREATE TABLE public.wos_qa_p2_review_receipts (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  office_revision_request_id uuid NOT NULL REFERENCES public.wos_qa_p2_office_revisions(request_id),
  expected_version integer NOT NULL CHECK (expected_version>=3),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64} / NO ACTIVATION until separate SHA-bound independent review and
-- owner approval. The P2 operator gate remains independent and OFF.
),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wos_qa_p2_review_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_review_receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wos_qa_p2_review_correction(
  p_order_id uuid, p_expected_version integer, p_request_id uuid, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $review$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_count integer;
  v_order public.wos_production_orders%ROWTYPE;
  v_prev public.wos_qa_p2_review_receipts%ROWTYPE;
  v_revision public.wos_qa_p2_office_revisions%ROWTYPE;
  v_fingerprint text;
  v_resolved integer;
  v_rows integer;
  v_response jsonb;
BEGIN
  -- Independent QA operator gate. No browser role may UPDATE this table.
  IF NOT EXISTS (
    SELECT 1 FROM public.wos_qa_p2_execution_gate gate
    WHERE gate.gate_name='OPERATOR_WRITES' AND gate.enabled=true
      AND gate.enabled_until>pg_catalog.clock_timestamp()
      AND gate.enabled_until<=pg_catalog.clock_timestamp()+INTERVAL '24 hours'
      AND gate.approval_reference<>'NOT_AUTHORIZED'
  ) THEN RAISE EXCEPTION 'QA_P2_DB_EXECUTION_NOT_AUTHORIZED'
    USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL OR p_order_id IS NULL OR p_request_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version<3
    OR p_note IS NULL OR length(pg_catalog.btrim(p_note)) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.profiles
    WHERE user_id=auth.uid() AND is_active=true
      AND role IN ('admin','manager','operator');
  IF v_count<>1 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles
    WHERE user_id=auth.uid() AND is_active=true
      AND role IN ('admin','manager','operator') LIMIT 1;
  v_fingerprint:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('orderId',p_order_id,
      'version',p_expected_version,'action','REVIEW_CORRECTION',
      'note',pg_catalog.btrim(p_note))::text,'UTF8')),'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wos-qa-p2:'||p_order_id::text,0));
  SELECT * INTO v_order FROM public.wos_production_orders
    WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_number NOT LIKE 'QA-%'
    OR v_order.organization_id<>v_actor.org_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_prev FROM public.wos_qa_p2_review_receipts
    WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_prev.order_id<>p_order_id OR v_prev.organization_id<>v_actor.org_id
      OR v_prev.actor_profile_id<>v_actor.id
      OR v_prev.expected_version<>p_expected_version
      OR v_prev.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_prev.response_json ||
      pg_catalog.jsonb_build_object('status','REPLAYED');
  END IF;
  IF v_order.workflow_status<>'WORKSHOP_REVIEW'
    OR v_order.version<>p_expected_version
    OR v_order.version_label NOT LIKE 'QA-R%' THEN
    RAISE EXCEPTION 'REVISION_OR_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
  SELECT * INTO v_revision FROM public.wos_qa_p2_office_revisions r
    WHERE r.order_id=p_order_id AND r.organization_id=v_actor.org_id
      AND r.new_version=v_order.version
      AND r.action='RESUBMIT_CORRECTION'
      AND r.after_snapshot->>'versionLabel'=v_order.version_label;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESUBMISSION_NOT_VERIFIED'
    USING ERRCODE='PT409'; END IF;
  -- A legitimate original P1 receipt must remain intact and authoritative.
  IF NOT EXISTS (
    SELECT 1 FROM public.wos_workshop_inbox i
      JOIN public.wos_submission_receipts r ON r.id=i.submission_id
    WHERE i.order_id=p_order_id AND i.organization_id=v_actor.org_id
      AND r.order_id=p_order_id AND r.organization_id=v_actor.org_id
      AND r.source_revision=i.source_revision
      AND r.source_version_label=i.source_version_label
      AND i.workflow_status='SUBMITTED'
      AND i.source_revision+1<v_order.version
  ) THEN RAISE EXCEPTION 'ORIGINAL_RECEIPT_MISSING'
    USING ERRCODE='PT409'; END IF;
  UPDATE public.wos_blockers SET
      status='RESOLVED',resolved_by_profile_id=v_actor.id,
      resolved_at=pg_catalog.now(),resolution_note=pg_catalog.btrim(p_note)
    WHERE entity_type='PRODUCTION_ORDER' AND entity_id=p_order_id
      AND organization_id=v_actor.org_id
      AND blocker_code='P2_DOCUMENTS_INCOMPLETE' AND status='OPEN'
      AND opened_at<=v_revision.created_at;
  GET DIAGNOSTICS v_resolved=ROW_COUNT;
  IF v_resolved<1 THEN RAISE EXCEPTION 'DOCUMENT_BLOCKER_NOT_FOUND'
    USING ERRCODE='PT409'; END IF;
  UPDATE public.wos_production_orders SET workflow_status='WAITING_MATERIAL',
    version=version+1,updated_at=pg_catalog.now()
    WHERE id=p_order_id AND organization_id=v_actor.org_id
      AND workflow_status='WORKSHOP_REVIEW' AND version=p_expected_version;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'VERSION_CONFLICT'
    USING ERRCODE='PT409'; END IF;
  INSERT INTO public.wos_status_history(
    organization_id,entity_type,entity_id,previous_status,next_status,
    actor_profile_id,actor_role,reason_code,note,metadata)
  VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,
    'WORKSHOP_REVIEW','WAITING_MATERIAL',v_actor.id,v_actor.role,
    'QA_P2_REVIEW_CORRECTION',pg_catalog.btrim(p_note),
    pg_catalog.jsonb_build_object('requestId',p_request_id,
      'officeRevisionRequestId',v_revision.request_id,
      'versionLabel',v_order.version_label,'expectedVersion',p_expected_version,
      'newVersion',p_expected_version+1,'resolvedBlockers',v_resolved));
  v_response:=pg_catalog.jsonb_build_object(
    'status','REVIEWED','orderId',p_order_id,'version',p_expected_version+1,
    'workflowStatus','WAITING_MATERIAL','requestId',p_request_id,
    'resolvedBlockers',v_resolved,'versionLabel',v_order.version_label);
  INSERT INTO public.wos_qa_p2_review_receipts(
    request_id,organization_id,order_id,actor_profile_id,
    office_revision_request_id,expected_version,payload_fingerprint,response_json)
  VALUES(p_request_id,v_actor.org_id,p_order_id,v_actor.id,
    v_revision.request_id,p_expected_version,v_fingerprint,v_response);
  -- New label makes every old FILM / SIGNED_SAMPLE image and visual baseline
  -- unusable until independently re-uploaded and reconfirmed for this version.
  RETURN v_response;
END;
$review$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_review_correction(uuid,integer,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_review_correction(uuid,integer,uuid,text)
  TO authenticated;

COMMIT;
-- NO INSTALL / NO ACTIVATION until separate SHA-bound independent review and
-- owner approval. The P2 operator gate remains independent and OFF.
