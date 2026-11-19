-- WOS MVP FOLLOW-ON: DRAFT -> SYNTHETIC PRIVATE IMAGE PROOF -> FIRST SUBMISSION.
-- ISOLATED PG17 REHEARSAL ONLY. Not a Supabase migration. Never install on hosted QA/Production.
-- All RPCs check the ephemeral runtime guard. Synthetic proof is NOT real Storage binary attestation.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $gate$
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'WOS_DRAFT_SUBMIT_PROPOSAL_ISOLATED_ONLY'; END IF;
END $gate$;
CREATE SCHEMA wos_mvp_isolated;
REVOKE ALL ON SCHEMA wos_mvp_isolated FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA wos_mvp_isolated TO authenticated;

-- Only the isolated PG test harness may insert synthetic attestor evidence.
-- Real deployment MUST replace this with immutable Storage-object identity,
-- content SHA-256 verified from bytes and a separately secured Edge attestor.
CREATE TABLE wos_mvp_isolated.synthetic_private_image_proofs(
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  storage_bucket text NOT NULL CHECK(storage_bucket='wos-private'),
  storage_path text NOT NULL,
  version_label text NOT NULL,
  digest_hex text NOT NULL CHECK(digest_hex ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY(order_id,organization_id)
    REFERENCES public.wos_production_orders(id,organization_id)
);
REVOKE ALL ON wos_mvp_isolated.synthetic_private_image_proofs
 FROM PUBLIC,anon,authenticated;

-- Public WOS Data API does not expose this private schema.
-- No service_role, open Auth/grant or client table DML permission is used.
CREATE FUNCTION wos_mvp_isolated.create_cpc_draft(
 p_request_id uuid,p_customer_id uuid,p_project_id uuid,p_product_name text,
 p_material text,p_quantity int,p_priority text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog'
AS $body$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_customer public.cpc_customer_references%ROWTYPE;
 v_project public.cpc_projects%ROWTYPE;
 v_owner public.profiles%ROWTYPE;
 v_existing public.wos_production_orders%ROWTYPE;
 v_number text;
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'WOS_DRAFT_RUNTIME_LOCKED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true AND role IN ('admin','manager','sales');
 IF NOT FOUND THEN RAISE EXCEPTION 'WOS_DRAFT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_customer_id IS NULL OR p_project_id IS NULL
  OR p_product_name IS NULL OR length(btrim(p_product_name)) NOT BETWEEN 1 AND 200
  OR p_material IS NULL OR length(btrim(p_material)) NOT BETWEEN 1 AND 200
  OR p_quantity IS NULL OR p_quantity<=0 OR p_quantity>2147483647
  OR p_priority NOT IN ('LOW','MEDIUM','HIGH','CRITICAL')
 THEN RAISE EXCEPTION 'WOS_DRAFT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 -- Same idempotency key always serializes before read or insert.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-draft:'||p_request_id::text,0));
 SELECT * INTO v_existing FROM public.wos_production_orders WHERE id=p_request_id;
 IF FOUND THEN
  IF v_existing.organization_id<>v_actor.org_id OR v_existing.created_by_profile_id<>v_actor.id
   OR v_existing.customer_id<>p_customer_id OR v_existing.project_id<>p_project_id
   OR v_existing.product_name<>p_product_name OR v_existing.product_material<>p_material
   OR v_existing.requested_quantity<>p_quantity OR v_existing.priority<>p_priority
  THEN RAISE EXCEPTION 'WOS_DRAFT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN pg_catalog.jsonb_build_object('result','REPLAYED','orderId',v_existing.id,
   'orderNumber',v_existing.order_number,'version',v_existing.version);
 END IF;
 SELECT * INTO v_project FROM public.cpc_projects
 WHERE id=p_project_id AND org_id=v_actor.org_id
   AND customer_reference_id=p_customer_id
 FOR KEY SHARE;
 IF NOT FOUND OR v_project.status<>'active' OR v_project.archived_at IS NOT NULL
 THEN RAISE EXCEPTION 'WOS_PROJECT_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_customer FROM public.cpc_customer_references
 WHERE id=p_customer_id AND org_id=v_actor.org_id AND status='active' FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WOS_CUSTOMER_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_owner FROM public.profiles
 WHERE id=v_project.owner_profile_id AND org_id=v_actor.org_id AND is_active=true FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WOS_PROJECT_OWNER_INACTIVE' USING ERRCODE='23514'; END IF;
 -- Explicit project-level CPC permissions, not merely same organization.
 IF NOT public.cpc_can_read_project(v_project.id,v_actor.org_id)
 OR NOT public.cpc_can_read_customer_reference(v_customer.id,v_actor.org_id)
 THEN RAISE EXCEPTION 'WOS_CPC_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_number:='WOS-CANDIDATE-'||pg_catalog.replace(p_request_id::text,'-','');
 INSERT INTO public.wos_production_orders
 (id,organization_id,customer_id,customer_name_snapshot,project_id,project_name_snapshot,
  order_number,product_name,product_material,sales_owner_profile_id,project_owner_profile_id,
  created_by_profile_id,priority,version_label,requested_quantity,current_batch_quantity,
  workflow_status,version)
 VALUES(p_request_id,v_actor.org_id,v_customer.id,v_customer.display_name_snapshot,
  v_project.id,v_project.title,v_number,p_product_name,p_material,v_actor.id,v_owner.id,
  v_actor.id,p_priority,'V1',p_quantity,p_quantity,'DRAFT',1);
 RETURN pg_catalog.jsonb_build_object('result','CREATED','orderId',p_request_id,
  'orderNumber',v_number,'version',1);
END $body$;

CREATE FUNCTION wos_mvp_isolated.submit_first_order(
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
  JOIN wos_mvp_isolated.synthetic_private_image_proofs proof
    ON proof.image_id=im.id AND proof.order_id=im.entity_id
    AND proof.organization_id=im.organization_id
    AND proof.storage_path=im.storage_path
    AND proof.storage_bucket=im.storage_bucket
    AND proof.version_label=im.version_label
  WHERE im.organization_id=v_actor.org_id
   AND im.entity_type='PRODUCTION_ORDER' AND im.entity_id=p_order_id
   AND im.storage_bucket='wos-private' AND im.image_status='READY'
   AND im.version_label=v_order.version_label
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
 wos_mvp_isolated.create_cpc_draft(uuid,uuid,uuid,text,text,integer,text),
 wos_mvp_isolated.submit_first_order(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 wos_mvp_isolated.create_cpc_draft(uuid,uuid,uuid,text,text,integer,text),
 wos_mvp_isolated.submit_first_order(uuid,integer,uuid,text)
 TO authenticated;
-- Public Data API adapters are SECURITY INVOKER and only proxy the locked
-- ephemeral private functions. These are NOT installed in hosted Supabase.
CREATE FUNCTION public.wos_mvp_create_cpc_draft_candidate(
 p_request_id uuid,p_customer_id uuid,p_project_id uuid,p_product_name text,
 p_material text,p_quantity integer,p_priority text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='pg_catalog'
AS $proxy$ SELECT wos_mvp_isolated.create_cpc_draft(
 p_request_id,p_customer_id,p_project_id,p_product_name,p_material,p_quantity,p_priority); $proxy$;
CREATE FUNCTION public.wos_mvp_submit_first_order_candidate(
 p_order_id uuid,p_expected_version integer,p_idempotency_key uuid,p_note text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='pg_catalog'
AS $proxy$ SELECT wos_mvp_isolated.submit_first_order(
 p_order_id,p_expected_version,p_idempotency_key,p_note); $proxy$;
REVOKE ALL ON FUNCTION
 public.wos_mvp_create_cpc_draft_candidate(uuid,uuid,uuid,text,text,integer,text),
 public.wos_mvp_submit_first_order_candidate(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.wos_mvp_create_cpc_draft_candidate(uuid,uuid,uuid,text,text,integer,text),
 public.wos_mvp_submit_first_order_candidate(uuid,integer,uuid,text)
 TO authenticated;
COMMIT;
