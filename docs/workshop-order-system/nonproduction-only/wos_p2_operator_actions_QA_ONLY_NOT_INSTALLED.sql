-- REVIEW PROPOSAL ONLY — NOT INSTALLED, NOT A MIGRATION.
-- NO PERMISSION TO EXECUTE THIS FILE IN QA OR PRODUCTION.
-- Intended nonproduction project: xulmpqaknlwqqculbsek (hongda-review-dev).
-- Prohibited production project: amqpvxrurenevniilhtl.
-- Requires separate owner QA DB authorization, independent technical/security
-- review, isolated PG17 test/replay and explicit owner approval before install.
-- No generic UPDATE/INSERT grant to browser roles on existing WOS tables.
-- Existing workshop Inbox is an IMMUTABLE SUBMITTED receipt projection.
-- This design deliberately never modifies wos_workshop_inbox.workflow_status.
-- Current QA CHECK constraint allows only SUBMITTED and remains unchanged.

BEGIN;

-- Independent database-side hard gate, OFF by default. Installing this file
-- does NOT activate any WOS P2 writes, even when a signed-in user calls RPC
-- directly (bypassing the Preview UI and route).
CREATE TABLE IF NOT EXISTS public.wos_qa_p2_execution_gate (
  gate_name text PRIMARY KEY CHECK (gate_name='OPERATOR_WRITES'),
  enabled boolean NOT NULL DEFAULT false,
  enabled_until timestamptz,
  approval_reference text NOT NULL DEFAULT 'NOT_AUTHORIZED',
  allowed_order_id uuid,
  allowed_organization_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (enabled_until IS NOT NULL
    AND length(btrim(approval_reference))>=12
    AND allowed_order_id IS NOT NULL
    AND allowed_organization_id IS NOT NULL))
);
ALTER TABLE public.wos_qa_p2_execution_gate
  ADD COLUMN IF NOT EXISTS allowed_order_id uuid,
  ADD COLUMN IF NOT EXISTS allowed_organization_id uuid;
DO $gate_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.wos_qa_p2_execution_gate'::regclass
      AND conname='wos_qa_p2_execution_gate_order_scope_check'
  ) THEN
    ALTER TABLE public.wos_qa_p2_execution_gate
      ADD CONSTRAINT wos_qa_p2_execution_gate_order_scope_check
      CHECK (NOT enabled OR (
        enabled_until IS NOT NULL
        AND length(btrim(approval_reference))>=12
        AND allowed_order_id IS NOT NULL
        AND allowed_organization_id IS NOT NULL))
      NOT VALID;
  END IF;
END $gate_check$;
INSERT INTO public.wos_qa_p2_execution_gate(gate_name,enabled,approval_reference)
VALUES('OPERATOR_WRITES',false,'NOT_AUTHORIZED')
ON CONFLICT (gate_name) DO NOTHING;
ALTER TABLE public.wos_qa_p2_execution_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_execution_gate FROM PUBLIC, anon, authenticated;

-- The only durable replay ledger. No client read or direct DML rights.
CREATE TABLE IF NOT EXISTS public.wos_qa_p2_action_receipts (
    request_id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id),
    order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
    actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
    action text NOT NULL CHECK (action IN ('ACCEPT','RETURN_FOR_INFORMATION','CONFIRM_MATERIAL')),
    expected_version integer NOT NULL CHECK (expected_version >= 1),
    payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
    response_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wos_qa_p2_action_receipts_order_idx
 ON public.wos_qa_p2_action_receipts (organization_id,order_id,created_at DESC);
ALTER TABLE public.wos_qa_p2_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_p2_action_receipts FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER is intentional: authenticated users are NOT given direct
-- UPDATE on orders nor INSERT on material, history, blocker or confirmations.
-- The procedure derives actor/org via auth.uid + authoritative profiles,
-- enforces finite state transitions, original receipt integrity, exact
-- version, serializes retries, and commits all changes in one transaction.
-- No dynamic SQL, fixed search_path='', fixed schema-qualified table names.
CREATE FUNCTION public.wos_qa_p2_operator_action(
 p_order_id uuid,
 p_expected_version integer,
 p_request_id uuid,
 p_action text,
 p_resource_type text,
 p_resource_status text,
 p_quantity_expected integer,
 p_quantity_arrived integer,
 p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $p2$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_profile_count integer;
 v_order public.wos_production_orders%ROWTYPE;
 v_prior public.wos_qa_p2_action_receipts%ROWTYPE;
 v_result jsonb;
 v_fingerprint text;
 v_next text;
 v_ready_count integer;
 v_rows integer;
 v_status_allowed boolean;
 v_resource_final boolean;
 v_required_img text;
BEGIN
 -- A stored DBA gate is mandatory because authenticated users could invoke
 -- a publicly exposed SECURITY DEFINER RPC directly without the Next.js flag.
 -- The limited expiry must be independently authorized at activation time.
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_qa_p2_execution_gate gate
   WHERE gate.gate_name='OPERATOR_WRITES'
     AND gate.enabled=true
     AND gate.enabled_until>pg_catalog.clock_timestamp()
     AND gate.enabled_until<=pg_catalog.clock_timestamp()+INTERVAL '15 minutes'
     AND gate.approval_reference<>'NOT_AUTHORIZED'
     AND gate.allowed_order_id=p_order_id
     AND gate.allowed_organization_id=(SELECT p.org_id FROM public.profiles p
       WHERE p.user_id=auth.uid() AND p.is_active=true LIMIT 1)
 ) THEN RAISE EXCEPTION 'QA_P2_DB_EXECUTION_NOT_AUTHORIZED'
        USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR p_order_id IS NULL OR p_request_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_action IS NULL OR p_action NOT IN
        ('ACCEPT','RETURN_FOR_INFORMATION','CONFIRM_MATERIAL')
    OR p_note IS NULL OR length(pg_catalog.btrim(p_note)) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;

 SELECT count(*) INTO v_profile_count FROM public.profiles
  WHERE user_id=auth.uid() AND is_active=true
    AND role IN ('admin','manager','operator');
 IF v_profile_count<>1 THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.profiles
  WHERE user_id=auth.uid() AND is_active=true
    AND role IN ('admin','manager','operator') LIMIT 1;

 IF p_action IN ('ACCEPT','RETURN_FOR_INFORMATION')
   AND (p_resource_type IS NOT NULL OR p_resource_status IS NOT NULL
        OR p_quantity_expected IS NOT NULL OR p_quantity_arrived IS NOT NULL)
 THEN RAISE EXCEPTION 'INVALID_ACTION_FIELDS' USING ERRCODE='22023'; END IF;

 IF p_action='CONFIRM_MATERIAL' THEN
   IF p_resource_type NOT IN ('FILM','FIXTURE','INCOMING_MATERIAL','SIGNED_SAMPLE')
      OR p_resource_status IS NULL
   THEN RAISE EXCEPTION 'INVALID_RESOURCE' USING ERRCODE='22023'; END IF;
   v_status_allowed := CASE p_resource_type
     WHEN 'FILM' THEN p_resource_status IN
       ('NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','VERSION_VERIFIED')
     WHEN 'FIXTURE' THEN p_resource_status IN
       ('NOT_AVAILABLE','IN_PRODUCTION','ARRIVED','FIT_VERIFIED')
     WHEN 'INCOMING_MATERIAL' THEN p_resource_status IN
       ('NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','QUANTITY_VERIFIED')
     WHEN 'SIGNED_SAMPLE' THEN p_resource_status IN
       ('MISSING','UPLOADED','PHYSICAL_SAMPLE_RECEIVED','VERIFIED')
     ELSE false END;
   IF NOT v_status_allowed THEN
     RAISE EXCEPTION 'INVALID_RESOURCE_STATE' USING ERRCODE='22023'; END IF;
   IF p_resource_type='INCOMING_MATERIAL' THEN
     IF p_quantity_expected IS NULL OR p_quantity_arrived IS NULL
        OR p_quantity_expected < 0 OR p_quantity_arrived < 0
     THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
   ELSIF p_quantity_expected IS NOT NULL OR p_quantity_arrived IS NOT NULL THEN
     RAISE EXCEPTION 'QUANTITY_FIELDS_DENIED' USING ERRCODE='22023';
   END IF;
 END IF;

 -- Fingerprint includes all intent fields, including expected version.
 v_fingerprint:=pg_catalog.encode(pg_catalog.sha256(
   pg_catalog.convert_to(pg_catalog.jsonb_build_object(
     'order',p_order_id,'version',p_expected_version,'action',p_action,
     'resource',p_resource_type,'state',p_resource_status,
     'quantityExpected',p_quantity_expected,'quantityArrived',p_quantity_arrived,
     'note',pg_catalog.btrim(p_note)
   )::text,'UTF8')),'hex');

 -- Serializes concurrent distinct operations and lost-response replays.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('wos-qa-p2:'||p_order_id::text,0));
 SELECT * INTO v_order FROM public.wos_production_orders
   WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
   OR v_order.order_number NOT LIKE 'QA-%' THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_prior FROM public.wos_qa_p2_action_receipts
   WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_prior.organization_id<>v_actor.org_id
      OR v_prior.order_id<>p_order_id
      OR v_prior.actor_profile_id<>v_actor.id
      OR v_prior.action<>p_action
      OR v_prior.expected_version<>p_expected_version
      OR v_prior.payload_fingerprint<>v_fingerprint THEN
     RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_prior.response_json || pg_catalog.jsonb_build_object('status','REPLAYED');
 END IF;

 -- P1 submission receipt/inbox are immutable source proofs.
 -- Original submission revision stays unchanged across P2 actions.
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_workshop_inbox i
     JOIN public.wos_submission_receipts r ON r.id=i.submission_id
   WHERE i.order_id=v_order.id AND i.organization_id=v_actor.org_id
     AND r.order_id=v_order.id AND r.organization_id=v_actor.org_id
     AND i.workflow_status='SUBMITTED'
     AND r.source_revision=i.source_revision
     AND r.source_version_label=i.source_version_label
     AND i.source_version_label=v_order.version_label
     AND ((v_order.workflow_status='SUBMITTED'
           AND i.source_revision+1 = v_order.version)
       OR (v_order.workflow_status<>'SUBMITTED'
           AND i.source_revision+1 < v_order.version))
 ) THEN RAISE EXCEPTION 'SOURCE_RECEIPT_MISMATCH' USING ERRCODE='PT409'; END IF;
 IF v_order.version<>p_expected_version THEN
   RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;

 IF p_action='ACCEPT' THEN
   IF v_order.workflow_status<>'SUBMITTED' THEN
     RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='PT409'; END IF;
   v_next:='WORKSHOP_REVIEW';
   -- An authorized operator can receive a task, but must not be falsely
   -- recorded as a WORKSHOP_SUPERVISOR. Operator actions are always in
   -- wos_status_history, while this confirmation is manager/admin only.
   IF v_actor.role IN ('manager','admin') THEN
     INSERT INTO public.wos_confirmations(
       organization_id,entity_type,entity_id,confirmation_type,decision,
       profile_id,role_snapshot,note)
     VALUES (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'WORKSHOP_SUPERVISOR',
        'CONFIRMED',v_actor.id,v_actor.role,pg_catalog.btrim(p_note));
   END IF;

 ELSIF p_action='RETURN_FOR_INFORMATION' THEN
   IF v_order.workflow_status NOT IN ('SUBMITTED','WORKSHOP_REVIEW') THEN
     RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='PT409'; END IF;
   v_next:='NEEDS_INFORMATION';
   INSERT INTO public.wos_blockers(
     organization_id,entity_type,entity_id,blocker_code,blocker_category,
     description,status,opened_by_profile_id)
   VALUES (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,
     'P2_DOCUMENTS_INCOMPLETE','DOCUMENT',pg_catalog.btrim(p_note),'OPEN',v_actor.id);
   IF v_actor.role IN ('manager','admin') THEN
     INSERT INTO public.wos_confirmations(
       organization_id,entity_type,entity_id,confirmation_type,decision,
       profile_id,role_snapshot,note)
     VALUES (v_actor.org_id,'PRODUCTION_ORDER',p_order_id,'WORKSHOP_SUPERVISOR',
       'REJECTED',v_actor.id,v_actor.role,pg_catalog.btrim(p_note));
   END IF;

 ELSIF p_action='CONFIRM_MATERIAL' THEN
   IF v_order.workflow_status NOT IN
      ('WORKSHOP_REVIEW','WAITING_MATERIAL','READINESS_CHECK') THEN
     RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='PT409'; END IF;
   v_resource_final:=CASE p_resource_type
     WHEN 'FILM' THEN p_resource_status='VERSION_VERIFIED'
     WHEN 'FIXTURE' THEN p_resource_status='FIT_VERIFIED'
     WHEN 'INCOMING_MATERIAL' THEN p_resource_status='QUANTITY_VERIFIED'
     WHEN 'SIGNED_SAMPLE' THEN p_resource_status='VERIFIED'
     ELSE false END;
   IF v_resource_final AND pg_catalog.to_regprocedure(
     'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)') IS NOT NULL
   THEN RAISE EXCEPTION 'M2_FINAL_READINESS_REQUIRED' USING ERRCODE='PT409'; END IF;
   IF p_resource_type='INCOMING_MATERIAL' AND v_resource_final
      AND (p_quantity_expected<v_order.current_batch_quantity
        OR p_quantity_arrived<p_quantity_expected) THEN
     RAISE EXCEPTION 'INCOMING_QUANTITY_NOT_READY' USING ERRCODE='22023';
   END IF;

   -- A confirmed film or signed sample cannot be conjured by a status string.
   v_required_img:=CASE
     WHEN p_resource_type='FILM' AND v_resource_final THEN 'FILM_PATTERN'
     WHEN p_resource_type='SIGNED_SAMPLE' AND v_resource_final THEN 'SIGNED_SAMPLE'
     ELSE NULL END;
   IF v_required_img IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public.wos_reference_images img
     WHERE img.entity_type='PRODUCTION_ORDER' AND img.entity_id=p_order_id
       AND img.organization_id=v_actor.org_id
       AND img.version_label=v_order.version_label
       AND img.image_status='READY' AND img.storage_bucket='wos-private'
       AND img.category=v_required_img
   ) THEN RAISE EXCEPTION 'REQUIRED_VERIFIED_IMAGE_MISSING' USING ERRCODE='PT409'; END IF;

   INSERT INTO public.wos_resource_readiness(
     organization_id,entity_type,entity_id,resource_type,status,
     quantity_expected,quantity_arrived,version_label,
     confirmed_by_profile_id,confirmed_at,note)
   VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_resource_type,
     p_resource_status,p_quantity_expected,p_quantity_arrived,v_order.version_label,
     CASE WHEN v_resource_final THEN v_actor.id ELSE NULL END,
     CASE WHEN v_resource_final THEN pg_catalog.now() ELSE NULL END,
     pg_catalog.btrim(p_note))
   ON CONFLICT (entity_type,entity_id,resource_type)
   DO UPDATE SET
     status=EXCLUDED.status,
     quantity_expected=EXCLUDED.quantity_expected,
     quantity_arrived=EXCLUDED.quantity_arrived,
     version_label=EXCLUDED.version_label,
     confirmed_by_profile_id=EXCLUDED.confirmed_by_profile_id,
     confirmed_at=EXCLUDED.confirmed_at,
     note=EXCLUDED.note,updated_at=pg_catalog.now()
   WHERE wos_resource_readiness.organization_id=EXCLUDED.organization_id;
   GET DIAGNOSTICS v_rows=ROW_COUNT;
   IF v_rows<>1 THEN RAISE EXCEPTION 'RESOURCE_ORG_CONFLICT'
       USING ERRCODE='42501'; END IF;

   SELECT count(*) INTO v_ready_count FROM public.wos_resource_readiness res
    WHERE res.entity_type='PRODUCTION_ORDER' AND res.entity_id=p_order_id
      AND res.organization_id=v_actor.org_id
      AND res.version_label=v_order.version_label
      AND res.confirmed_by_profile_id IS NOT NULL AND res.confirmed_at IS NOT NULL
      AND (
        (res.resource_type='FILM' AND res.status='VERSION_VERIFIED')
        OR (res.resource_type='FIXTURE' AND res.status='FIT_VERIFIED')
        OR (res.resource_type='SIGNED_SAMPLE' AND res.status='VERIFIED')
        OR (res.resource_type='INCOMING_MATERIAL'
            AND res.status='QUANTITY_VERIFIED'
            AND res.quantity_expected>=v_order.current_batch_quantity
            AND res.quantity_arrived>=res.quantity_expected)
      );
   IF v_ready_count=4
      AND NOT EXISTS (
        SELECT 1 FROM public.wos_blockers b
        WHERE b.organization_id=v_actor.org_id
        AND b.entity_type='PRODUCTION_ORDER' AND b.entity_id=p_order_id
        AND b.status<>'RESOLVED'
      ) AND EXISTS (
        SELECT 1 FROM public.wos_visual_baselines vb
        JOIN public.wos_visual_baseline_items bi ON bi.baseline_id=vb.id
        JOIN public.wos_reference_images img ON img.id=bi.reference_image_id
        WHERE vb.organization_id=v_actor.org_id AND vb.entity_id=p_order_id
          AND vb.entity_type='PRODUCTION_ORDER'
          AND vb.status='CURRENT' AND vb.version_label=v_order.version_label
          AND vb.office_confirmed_at IS NOT NULL
          AND vb.workshop_confirmed_at IS NOT NULL
          AND img.entity_type='PRODUCTION_ORDER' AND img.entity_id=p_order_id
          AND img.organization_id=v_actor.org_id
          AND img.category='SIGNED_SAMPLE' AND img.image_status='READY'
          AND img.version_label=v_order.version_label
      ) THEN v_next:='READINESS_CHECK';
   ELSE v_next:='WAITING_MATERIAL';
   END IF;
 ELSE RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023'; END IF;

 UPDATE public.wos_production_orders
 SET workflow_status=v_next,version=version+1,updated_at=pg_catalog.now()
 WHERE id=p_order_id AND organization_id=v_actor.org_id
   AND version=p_expected_version AND workflow_status=v_order.workflow_status;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;

 INSERT INTO public.wos_status_history(
   organization_id,entity_type,entity_id,previous_status,next_status,
   actor_profile_id,actor_role,reason_code,note,metadata)
 VALUES(v_actor.org_id,'PRODUCTION_ORDER',p_order_id,
   v_order.workflow_status,v_next,v_actor.id,v_actor.role,
   'QA_P2_'||p_action,pg_catalog.btrim(p_note),
   pg_catalog.jsonb_build_object('requestId',p_request_id,
      'expectedVersion',p_expected_version,'newVersion',p_expected_version+1,
      'resourceType',p_resource_type,'resourceStatus',p_resource_status));

 v_result:=pg_catalog.jsonb_build_object(
   'status','APPLIED','orderId',p_order_id,'version',p_expected_version+1,
   'workflowStatus',v_next,'requestId',p_request_id);
 INSERT INTO public.wos_qa_p2_action_receipts(
   request_id,organization_id,order_id,actor_profile_id,action,
   expected_version,payload_fingerprint,response_json)
 VALUES (p_request_id,v_actor.org_id,p_order_id,v_actor.id,p_action,
   p_expected_version,v_fingerprint,v_result);
 RETURN v_result;
END;
$p2$;

-- In public functions have PUBLIC EXECUTE by default: REVOKE explicitly.
REVOKE ALL ON FUNCTION public.wos_qa_p2_operator_action(
 uuid,integer,uuid,text,text,text,integer,integer,text)
 FROM PUBLIC,anon,authenticated;
-- This grants only a CALL; internal immutable identity/role/order/tenant,
-- version and action gates restrict which authenticated users can mutate.
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_operator_action(
 uuid,integer,uuid,text,text,text,integer,integer,text)
 TO authenticated;

COMMIT;

-- IMPORTANT: This file installs the database gate with enabled=false.
-- After separate approval, a project-specific DBA may activate it with
-- enabled_until <= now() + interval '15 minutes', one exact QA-NONPROD order,
-- the actor organization, and a concrete review reference.
-- NEVER grant UPDATE on the gate table to authenticated, anon or PUBLIC.
-- On failure: SET enabled=false using the privileged DBA connection, REVOKE
-- EXECUTE on the RPC, and keep history/receipts intact for investigation.
-- Do NOT enable WOS_P2_QA_MUTATIONS_ENABLED until:
-- (1) independent safety review of this exact file HEAD and PG17 offline test,
-- (2) separate owner QA-only DDL/function/grant approval, and
-- (3) explicit safe rollback and independent Operator/Office/Viewer/Foreign E2E.
-- Never apply to production or supabase/migrations.
