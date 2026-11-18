-- WOS P0-02-02 Full Office form save PROPOSAL. ISOLATED PG17 ONLY.
-- All 21 Office entry fields are persisted or checked against authoritative CPC
-- and database generated values before an image can be attached/submitted.
-- Never execute in persistent QA or Production without independent review/Owner approval.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $gate$
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'WOS_OFFICE_DOCUMENT_PROPOSAL_NOT_AUTHORIZED'; END IF;
END $gate$;
ALTER TABLE public.wos_production_orders
 ADD COLUMN follow_up_batch_plan text;
CREATE TABLE wos_mvp_attestation.office_document_receipts(
 request_id uuid PRIMARY KEY,
 order_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 actor_profile_id uuid NOT NULL,
 source_version integer NOT NULL CHECK(source_version>=1),
 new_version integer NOT NULL CHECK(new_version=source_version+1),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 office_document jsonb NOT NULL CHECK(jsonb_typeof(office_document)='object'),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(order_id,organization_id) REFERENCES public.wos_production_orders(id,organization_id),
 FOREIGN KEY(actor_profile_id,organization_id) REFERENCES public.profiles(id,org_id),
 UNIQUE(order_id,new_version)
);
ALTER TABLE wos_mvp_attestation.office_document_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wos_mvp_attestation.office_document_receipts
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION wos_mvp_attestation.save_complete_office_document(
 p_order_id uuid,p_expected_version integer,p_request_id uuid,p_document jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $save$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_prior wos_mvp_attestation.office_document_receipts%ROWTYPE;
 v_fingerprint text;
 v_new_version integer;
 v_qty integer;
 v_batch integer;
 v_carton integer;
 v_response jsonb;
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'WOS_OFFICE_FORM_RUNTIME_LOCKED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL
  OR p_expected_version<1 OR p_document IS NULL
  OR pg_catalog.jsonb_typeof(p_document)<>'object'
  OR length(p_document::text)>20000
 THEN RAISE EXCEPTION 'OFFICE_FORM_INPUT_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true AND role IN('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'OFFICE_ROLE_DENIED' USING ERRCODE='42501';END IF;
 v_fingerprint:=pg_catalog.encode(pg_catalog.sha256(
  pg_catalog.convert_to(p_document::text,'UTF8')),'hex');
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-office-form:'||p_request_id::text,0));
 SELECT * INTO v_prior FROM wos_mvp_attestation.office_document_receipts
 WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.order_id<>p_order_id OR v_prior.organization_id<>v_actor.org_id
   OR v_prior.actor_profile_id<>v_actor.id OR v_prior.source_version<>p_expected_version
   OR v_prior.fingerprint<>v_fingerprint
  THEN RAISE EXCEPTION 'OFFICE_FORM_REPLAY_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN v_prior.result || '{"result":"REPLAYED"}'::jsonb;
 END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
 IF NOT FOUND OR v_order.workflow_status<>'DRAFT'
 OR v_order.version<>p_expected_version
 OR (v_actor.role='sales' AND v_order.created_by_profile_id<>v_actor.id
  AND v_order.sales_owner_profile_id<>v_actor.id)
 THEN RAISE EXCEPTION 'OFFICE_FORM_STALE_OR_DENIED' USING ERRCODE='PT409';END IF;
 -- Never treat client-written CPC names, order number, organization or version
 -- as authoritative; they must be identical to the actual order snapshot.
 IF p_document->>'customerName' IS DISTINCT FROM v_order.customer_name_snapshot
 OR p_document->>'projectName' IS DISTINCT FROM v_order.project_name_snapshot
 OR p_document->>'orderNumber' IS DISTINCT FROM v_order.order_number
 OR p_document->>'versionLabel' IS DISTINCT FROM v_order.version_label
 OR v_order.version_label<>'V1'
 THEN RAISE EXCEPTION 'OFFICE_FORM_SOURCE_SNAPSHOT_MISMATCH' USING ERRCODE='23514'; END IF;
 -- Check every required shop-floor field; no UI-only validation.
 IF coalesce(length(btrim(p_document->>'productName')),0) NOT BETWEEN 1 AND 200
 OR coalesce(length(btrim(p_document->>'productMaterial')),0) NOT BETWEEN 1 AND 200
 OR p_document->>'priority' NOT IN ('LOW','MEDIUM','HIGH','CRITICAL')
 OR p_document->>'patternScope' NOT IN ('FULL','PARTIAL','MIXED')
 OR coalesce(length(btrim(p_document->>'surfaceTreatment')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'seamTolerance')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'positionReference')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'customerAcceptanceStandard')),0) NOT BETWEEN 1 AND 2000
 OR coalesce(length(btrim(p_document->>'packagingMethod')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'labelMarkingRule')),0) NOT BETWEEN 1 AND 2000
 OR p_document->>'plannedShipDate' !~ '^\d{4}-\d{2}-\d{2}$'
 OR pg_catalog.jsonb_typeof(p_document->'isUrgent')<>'boolean'
 OR pg_catalog.jsonb_typeof(p_document->'splitDelivery')<>'boolean'
 OR p_document->>'requestedQuantity' !~ '^[1-9][0-9]{0,9}$'
 OR p_document->>'currentBatchQuantity' !~ '^[1-9][0-9]{0,9}$'
 OR p_document->>'cartonQuantity' !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'OFFICE_REQUIRED_FIELDS_INCOMPLETE' USING ERRCODE='23514';END IF;
 IF (p_document->>'splitDelivery')::boolean=true AND
  coalesce(length(btrim(p_document->>'followUpBatchPlan')),0)=0
 THEN RAISE EXCEPTION 'SPLIT_DELIVERY_PLAN_REQUIRED' USING ERRCODE='23514';END IF;
 IF coalesce(length(p_document->>'followUpBatchPlan'),0)>1000
 THEN RAISE EXCEPTION 'BATCH_PLAN_TOO_LONG' USING ERRCODE='23514';END IF;
 -- Bounds are checked before integer conversion to prevent int overflow.
 IF length(p_document->>'requestedQuantity')>9
 OR length(p_document->>'currentBatchQuantity')>9
 OR length(p_document->>'cartonQuantity')>9
 THEN RAISE EXCEPTION 'QUANTITY_OUT_OF_BOUNDS' USING ERRCODE='23514';END IF;
 v_qty:=(p_document->>'requestedQuantity')::integer;
 v_batch:=(p_document->>'currentBatchQuantity')::integer;
 v_carton:=(p_document->>'cartonQuantity')::integer;
 IF v_batch>v_qty OR v_carton<1 THEN
  RAISE EXCEPTION 'QUANTITY_RELATIONSHIP_INVALID' USING ERRCODE='23514';END IF;
 -- Date cast can fail; an invalid date cannot pass through a successful save.
 UPDATE public.wos_production_orders SET
  product_name=btrim(p_document->>'productName'),
  product_material=btrim(p_document->>'productMaterial'),
  priority=p_document->>'priority',
  is_urgent=(p_document->>'isUrgent')::boolean,
  requested_quantity=v_qty,current_batch_quantity=v_batch,
  planned_ship_date=(p_document->>'plannedShipDate')::date,
  split_delivery=(p_document->>'splitDelivery')::boolean,
  follow_up_batch_plan=nullif(btrim(p_document->>'followUpBatchPlan'),''),
  surface_treatment=btrim(p_document->>'surfaceTreatment'),
  pattern_scope=p_document->>'patternScope',
  seam_tolerance=btrim(p_document->>'seamTolerance'),
  position_reference=btrim(p_document->>'positionReference'),
  customer_acceptance_standard=btrim(p_document->>'customerAcceptanceStandard'),
  packaging_method=btrim(p_document->>'packagingMethod'),
  carton_quantity=v_carton,
  label_marking_rule=btrim(p_document->>'labelMarkingRule'),
  version=version+1,updated_at=pg_catalog.now()
 WHERE id=p_order_id AND organization_id=v_actor.org_id
 AND version=p_expected_version AND workflow_status='DRAFT'
 RETURNING version INTO v_new_version;
 IF v_new_version IS NULL THEN RAISE EXCEPTION 'OFFICE_VERSION_CHANGED' USING ERRCODE='PT409';END IF;
 v_response:=pg_catalog.jsonb_build_object('result','SAVED','orderId',p_order_id,
  'version',v_new_version,'versionLabel',v_order.version_label,'allOfficeFieldsSaved',true);
 INSERT INTO wos_mvp_attestation.office_document_receipts (
  request_id,order_id,organization_id,actor_profile_id,source_version,new_version,
  fingerprint,office_document,result)
 VALUES(p_request_id,p_order_id,v_actor.org_id,v_actor.id,
  p_expected_version,v_new_version,v_fingerprint,p_document,v_response);
 RETURN v_response;
END $save$;
REVOKE ALL ON FUNCTION
 wos_mvp_attestation.save_complete_office_document(uuid,integer,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 wos_mvp_attestation.save_complete_office_document(uuid,integer,uuid,jsonb)
 TO authenticated;
CREATE FUNCTION public.wos_mvp_save_complete_office_candidate(
 p_order_id uuid,p_expected_version integer,p_request_id uuid,p_document jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='pg_catalog'
AS $proxy$ SELECT wos_mvp_attestation.save_complete_office_document(
 p_order_id,p_expected_version,p_request_id,p_document); $proxy$;
REVOKE ALL ON FUNCTION public.wos_mvp_save_complete_office_candidate(uuid,integer,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_mvp_save_complete_office_candidate(uuid,integer,uuid,jsonb)
 TO authenticated;

-- Make the old verified image first-submit function uncallable by the user;
-- the new wrapper requires a persisted complete Office document version first.
REVOKE EXECUTE ON FUNCTION
 wos_mvp_attestation.submit_first_order_with_storage_proof(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION
 public.wos_mvp_submit_first_order_verified_candidate(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION wos_mvp_attestation.submit_first_order_with_full_document(
 p_order_id uuid,p_expected_version integer,p_idempotency_key uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $submit$
DECLARE v_actor public.profiles%ROWTYPE;v_order public.wos_production_orders%ROWTYPE;
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'FULL_SUBMIT_RUNTIME_LOCKED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true AND role IN('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'OFFICE_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id FOR SHARE;
 IF NOT FOUND OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
  AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'FULL_SUBMIT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(
 SELECT 1 FROM wos_mvp_attestation.office_document_receipts d
 WHERE d.order_id=p_order_id AND d.organization_id=v_actor.org_id
  AND d.new_version=p_expected_version
  AND d.result->>'allOfficeFieldsSaved'='true')
 THEN RAISE EXCEPTION 'OFFICE_FIELDS_NOT_SAVED_FOR_CURRENT_VERSION'
  USING ERRCODE='23514'; END IF;
 RETURN wos_mvp_attestation.submit_first_order_with_storage_proof(
  p_order_id,p_expected_version,p_idempotency_key,p_note);
END $submit$;
REVOKE ALL ON FUNCTION
 wos_mvp_attestation.submit_first_order_with_full_document(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 wos_mvp_attestation.submit_first_order_with_full_document(uuid,integer,uuid,text)
 TO authenticated;
CREATE FUNCTION public.wos_mvp_submit_first_order_full_candidate(
 p_order_id uuid,p_expected_version integer,p_idempotency_key uuid,p_note text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='pg_catalog'
AS $proxy$ SELECT wos_mvp_attestation.submit_first_order_with_full_document(
 p_order_id,p_expected_version,p_idempotency_key,p_note); $proxy$;
REVOKE ALL ON FUNCTION
 public.wos_mvp_submit_first_order_full_candidate(uuid,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.wos_mvp_submit_first_order_full_candidate(uuid,integer,uuid,text)
 TO authenticated;
COMMIT;
