-- WOS P7: ISOLATED QA ONLY; NEVER run on Hongda Production.
-- Review and apply ONLY to Supabase project xulmpqaknlwqqculbsek.
-- Data writes / external sends / production feature activation are out of scope.
-- DB changes are intentionally tracked OUTSIDE supabase/migrations.

CREATE TABLE IF NOT EXISTS public.wos_office_readiness_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL CHECK(length(source_version_label) BETWEEN 1 AND 120),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  note text NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,source_revision)
);
CREATE TABLE IF NOT EXISTS public.wos_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,source_revision)
);
CREATE TABLE IF NOT EXISTS public.wos_workshop_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.wos_submission_receipts(id),
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_version_label text NOT NULL,
  workflow_status text NOT NULL DEFAULT 'SUBMITTED' CHECK(workflow_status='SUBMITTED'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wos_p7_inbox_org_created_idx
  ON public.wos_workshop_inbox(organization_id,created_at DESC);

ALTER TABLE public.wos_office_readiness_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_submission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wos_workshop_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_office_readiness_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_submission_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_workshop_inbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wos_office_readiness_receipts TO authenticated;
GRANT SELECT ON public.wos_submission_receipts TO authenticated;
GRANT SELECT ON public.wos_workshop_inbox TO authenticated;

CREATE POLICY wos_p7_readiness_same_org ON public.wos_office_readiness_receipts
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
 AND p.org_id=wos_office_readiness_receipts.organization_id));
CREATE POLICY wos_p7_receipt_same_org ON public.wos_submission_receipts
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
 AND p.org_id=wos_submission_receipts.organization_id));
CREATE POLICY wos_p7_inbox_same_org ON public.wos_workshop_inbox
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.is_active
 AND p.org_id=wos_workshop_inbox.organization_id));

-- Do not trust a ready-image row without a real Storage object; the secure
-- storage registration RPC (separate file) must be deployed before readiness.
REVOKE INSERT ON public.wos_reference_images FROM authenticated;

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
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_reference_images im
   WHERE im.organization_id=v_actor.org_id AND im.entity_type='PRODUCTION_ORDER'
    AND im.entity_id=p_order_id AND im.image_status='READY'
    AND im.version_label=p_expected_label AND im.storage_bucket='wos-private'
 ) THEN RAISE EXCEPTION 'VERIFIED_PRIVATE_IMAGE_REQUIRED' USING ERRCODE='23514'; END IF;
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
