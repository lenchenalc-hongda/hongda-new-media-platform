-- NONPRODUCTION DESIGN ONLY. DO NOT EXECUTE WITHOUT A SEPARATE OWNER QA
-- DATABASE/RLS/GRANT AUTHORIZATION AND AN INDEPENDENT REVIEW.
-- This SQL is NOT in supabase/migrations and must NEVER be applied to
-- amqpvxrurenevniilhtl (Hongda Production).
-- Intended QA project only: xulmpqaknlwqqculbsek.
--
-- Objective: allow the office to amend its own existing QA-CPC-NONPROD DRAFT
-- with optimistic version, idempotent retry and atomic history.
-- NO blanket UPDATE privilege, no access to submitted orders,
-- no changes to organization, CPC linkage, owner, order number or image baseline.
BEGIN;

CREATE TABLE IF NOT EXISTS public.wos_qa_draft_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  actor_role text NOT NULL CHECK (actor_role IN ('admin','manager','sales')),
  request_id uuid NOT NULL UNIQUE,
  expected_version integer NOT NULL CHECK (expected_version >= 1),
  new_version integer NOT NULL CHECK (new_version = expected_version + 1),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, new_version)
);
CREATE INDEX IF NOT EXISTS wos_qa_draft_revisions_order_history
ON public.wos_qa_draft_revisions (organization_id, order_id, created_at DESC);

ALTER TABLE public.wos_qa_draft_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_draft_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wos_qa_draft_revisions TO authenticated;
DROP POLICY IF EXISTS wos_qa_draft_revisions_select_authorized ON public.wos_qa_draft_revisions;
CREATE POLICY wos_qa_draft_revisions_select_authorized
ON public.wos_qa_draft_revisions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=auth.uid() AND p.is_active
    AND p.org_id=wos_qa_draft_revisions.organization_id
    AND p.role IN ('admin','manager','sales','operator')
));

-- RLS on the order table remains unchanged. The narrow SECURITY DEFINER
-- routine below is an explicit privileged entrypoint, not general DML access.
-- Its default PUBLIC EXECUTE is revoked inside the same transaction.
CREATE OR REPLACE FUNCTION public.wos_qa_amend_cpc_draft(
  p_order_id uuid, p_expected_version integer, p_request_id uuid,
  p_patch jsonb, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_after public.wos_production_orders%ROWTYPE;
  v_prior public.wos_qa_draft_revisions%ROWTYPE;
  v_fingerprint text;
  v_allowed text[] := ARRAY[
    'productName','productMaterial','requestedQuantity','currentBatchQuantity',
    'plannedShipDate','priority','isUrgent','splitDelivery','surfaceTreatment',
    'patternScope','seamTolerance','positionReference',
    'customerAcceptanceStandard','packagingMethod','cartonQuantity',
    'labelMarkingRule'
  ];
  v_key text;
  v_value text;
  v_quantity integer;
  v_batch integer;
BEGIN
  IF auth.uid() IS NULL OR p_order_id IS NULL OR p_request_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
  THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_actor FROM public.profiles
    WHERE user_id=auth.uid() AND is_active=true
      AND role IN ('admin','manager','sales') LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
    OR p_patch = '{}'::jsonb OR pg_catalog.octet_length(p_patch::text)>8192
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;

  -- The complete patch must match a fixed allowlist. Reject all attempts
  -- to edit order identity, CPC customer/project, owner, status, or baseline.
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'FIELD_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    IF (p_patch->v_key)='null'::jsonb THEN
      RAISE EXCEPTION 'NULL_FIELD_DENIED' USING ERRCODE='22023';
    END IF;
    IF v_key IN ('isUrgent','splitDelivery') THEN
      IF jsonb_typeof(p_patch->v_key)<>'boolean' THEN
        RAISE EXCEPTION 'BOOLEAN_REQUIRED' USING ERRCODE='22023'; END IF;
    ELSIF v_key IN ('requestedQuantity','currentBatchQuantity','cartonQuantity') THEN
      IF jsonb_typeof(p_patch->v_key)<>'number'
        OR (p_patch->>v_key) !~ '^[1-9][0-9]{0,9}$'
        OR (p_patch->>v_key)::numeric > 2147483647 THEN
        RAISE EXCEPTION 'POSITIVE_INTEGER_REQUIRED' USING ERRCODE='22023';
      END IF;
    ELSE
      IF jsonb_typeof(p_patch->v_key)<>'string'
        OR length(p_patch->>v_key)>2000 THEN
        RAISE EXCEPTION 'TEXT_REQUIRED' USING ERRCODE='22023';
      END IF;
      IF v_key IN ('productName','productMaterial') AND btrim(p_patch->>v_key)='' THEN
        RAISE EXCEPTION 'REQUIRED_FIELD_EMPTY' USING ERRCODE='22023'; END IF;
      IF v_key IN ('productName','productMaterial') AND length(p_patch->>v_key)>200 THEN
        RAISE EXCEPTION 'REQUIRED_FIELD_TOO_LONG' USING ERRCODE='22023'; END IF;
      IF v_key='priority' AND (p_patch->>v_key) NOT IN ('LOW','MEDIUM','HIGH','CRITICAL')
      THEN RAISE EXCEPTION 'INVALID_PRIORITY' USING ERRCODE='22023'; END IF;
      IF v_key='patternScope' AND (p_patch->>v_key) NOT IN ('FULL','PARTIAL','MIXED')
      THEN RAISE EXCEPTION 'INVALID_PATTERN' USING ERRCODE='22023'; END IF;
      IF v_key='plannedShipDate' AND (p_patch->>v_key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN RAISE EXCEPTION 'INVALID_DATE' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;

  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'orderId',p_order_id,'version',p_expected_version,'patch',p_patch,
      'reason',btrim(p_reason)
    )::text,'UTF8')),'hex');

  -- Serializes distinct revisions and replays for the same immutable order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wos-qa-cpc-draft:'||p_order_id::text,0));

  SELECT * INTO v_prior FROM public.wos_qa_draft_revisions
    WHERE request_id=p_request_id LIMIT 1;
  IF FOUND THEN
    IF v_prior.order_id<>p_order_id OR v_prior.organization_id<>v_actor.org_id
      OR v_prior.actor_profile_id<>v_actor.id
      OR v_prior.expected_version<>p_expected_version
      OR v_prior.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'status','REPLAYED','orderId',v_prior.order_id,
      'version',v_prior.new_version,'revisionId',v_prior.id);
  END IF;

  SELECT * INTO v_order FROM public.wos_production_orders
    WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
    OR v_order.created_by_profile_id<>v_actor.id
    OR v_order.order_number NOT LIKE 'QA-CPC-NONPROD-%'
  THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  IF v_order.workflow_status<>'DRAFT' OR v_order.version<>p_expected_version
  THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;

  v_quantity := CASE WHEN p_patch?'requestedQuantity'
    THEN (p_patch->>'requestedQuantity')::integer ELSE v_order.requested_quantity END;
  v_batch := CASE WHEN p_patch?'currentBatchQuantity'
    THEN (p_patch->>'currentBatchQuantity')::integer ELSE v_order.current_batch_quantity END;
  IF v_batch>v_quantity THEN
    RAISE EXCEPTION 'BATCH_EXCEEDS_ORDER' USING ERRCODE='22023'; END IF;

  UPDATE public.wos_production_orders SET
    product_name = CASE WHEN p_patch?'productName' THEN btrim(p_patch->>'productName') ELSE product_name END,
    product_material = CASE WHEN p_patch?'productMaterial' THEN btrim(p_patch->>'productMaterial') ELSE product_material END,
    requested_quantity = v_quantity,
    current_batch_quantity = v_batch,
    planned_ship_date = CASE WHEN p_patch?'plannedShipDate' THEN (p_patch->>'plannedShipDate')::date ELSE planned_ship_date END,
    priority = CASE WHEN p_patch?'priority' THEN p_patch->>'priority' ELSE priority END,
    is_urgent = CASE WHEN p_patch?'isUrgent' THEN (p_patch->>'isUrgent')::boolean ELSE is_urgent END,
    split_delivery = CASE WHEN p_patch?'splitDelivery' THEN (p_patch->>'splitDelivery')::boolean ELSE split_delivery END,
    surface_treatment = CASE WHEN p_patch?'surfaceTreatment' THEN p_patch->>'surfaceTreatment' ELSE surface_treatment END,
    pattern_scope = CASE WHEN p_patch?'patternScope' THEN p_patch->>'patternScope' ELSE pattern_scope END,
    seam_tolerance = CASE WHEN p_patch?'seamTolerance' THEN p_patch->>'seamTolerance' ELSE seam_tolerance END,
    position_reference = CASE WHEN p_patch?'positionReference' THEN p_patch->>'positionReference' ELSE position_reference END,
    customer_acceptance_standard = CASE WHEN p_patch?'customerAcceptanceStandard' THEN p_patch->>'customerAcceptanceStandard' ELSE customer_acceptance_standard END,
    packaging_method = CASE WHEN p_patch?'packagingMethod' THEN p_patch->>'packagingMethod' ELSE packaging_method END,
    carton_quantity = CASE WHEN p_patch?'cartonQuantity' THEN (p_patch->>'cartonQuantity')::integer ELSE carton_quantity END,
    label_marking_rule = CASE WHEN p_patch?'labelMarkingRule' THEN p_patch->>'labelMarkingRule' ELSE label_marking_rule END,
    version = version+1, updated_at = now()
  WHERE id=p_order_id AND organization_id=v_actor.org_id
    AND workflow_status='DRAFT' AND version=p_expected_version
  RETURNING * INTO v_after;
  IF NOT FOUND THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;

  INSERT INTO public.wos_qa_draft_revisions(
    organization_id,order_id,actor_profile_id,actor_role,request_id,
    expected_version,new_version,payload_fingerprint,reason,
    before_snapshot,after_snapshot)
  VALUES(v_actor.org_id,p_order_id,v_actor.id,v_actor.role,p_request_id,
    p_expected_version,v_after.version,v_fingerprint,btrim(p_reason),
    to_jsonb(v_order),to_jsonb(v_after));

  INSERT INTO public.wos_status_history(
    organization_id,entity_type,entity_id,previous_status,next_status,
    actor_profile_id,actor_role,reason_code,note,metadata)
  VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'DRAFT','DRAFT',
    v_actor.id,v_actor.role,'QA_CPC_DRAFT_REVISED',btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'fromVersion',p_expected_version,'toVersion',v_after.version,
      'requestId',p_request_id));

  RETURN pg_catalog.jsonb_build_object(
    'status','UPDATED','orderId',p_order_id,'version',v_after.version,
    'submitted',false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.wos_qa_amend_cpc_draft(uuid,integer,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_amend_cpc_draft(uuid,integer,uuid,jsonb,text)
  TO authenticated;
COMMIT;

-- Mandatory before enabling QA UI: independently review the installed
-- function definition and privileges, perform forged-identity/viewer/foreign
-- org/replay/concurrent-CAS tests, verify history cardinality and rollback.
-- Never apply to Production.
