-- WOS QA OVERLAY: NEW OBJECTS ONLY. Installation is NOT YET AUTHORIZED.
-- Preflight MUST run first on exact target QA, matched to approved SQL blob.
-- Persistent QA project ONLY; never run on Production. Initial execution OFF.
BEGIN;
SET LOCAL statement_timeout='20s';
DO $qa_identity$
BEGIN
 IF to_regclass('public.wos_qa_p2_execution_gate') IS NULL
 OR to_regclass('public.wos_qa_p2_office_execution_gate') IS NULL
 OR to_regclass('public.wos_workshop_inbox') IS NULL
 OR to_regclass('public.wos_qa_verified_image_proofs') IS NULL
 THEN RAISE EXCEPTION 'QA_ONLY_P7_P2_BASELINE_REQUIRED'; END IF;
 IF to_regnamespace('wos_mvp_qa') IS NOT NULL
 OR to_regnamespace('wos_mvp_attestation') IS NOT NULL
 OR to_regnamespace('wos_mvp_isolated') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_OVERLAY_SCHEMA_COLLISION'; END IF;
 IF (SELECT workflow_status='WAITING_MATERIAL' AND version=7
   AND version_label='QA-R6' FROM public.wos_production_orders
   WHERE id='953d2204-3e65-4b75-b10e-c6e97f1bbb56') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'QA_ONLY_V7_SENTINEL_MISMATCH'; END IF;
 IF (SELECT enabled FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES') IS DISTINCT FROM false
 OR (SELECT enabled FROM public.wos_qa_p2_office_execution_gate WHERE gate_name='OFFICE_WRITES') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'QA_P2_GATES_MUST_BE_OFF'; END IF;
END $qa_identity$;
CREATE SCHEMA wos_mvp_qa;
CREATE SCHEMA wos_mvp_isolated;
CREATE SCHEMA wos_mvp_attestation;
REVOKE ALL ON SCHEMA wos_mvp_qa,wos_mvp_isolated,wos_mvp_attestation FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA wos_mvp_isolated,wos_mvp_attestation TO authenticated;
CREATE TABLE wos_mvp_qa.p1_execution_gate(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 enabled_until timestamptz,
 approved_run_id text,
 approved_sha text,
 approval_reference text NOT NULL DEFAULT 'NOT_AUTHORIZED',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((enabled=false AND enabled_until IS NULL AND approved_run_id IS NULL
  AND approved_sha IS NULL)
 OR (enabled=true AND enabled_until IS NOT NULL
  AND approved_run_id ~ '^[1-9][0-9]{7,14}$'
  AND approved_sha ~ '^[a-f0-9]{40}$'
  AND length(approval_reference) BETWEEN 15 AND 350))
);
INSERT INTO wos_mvp_qa.p1_execution_gate(singleton,enabled,approval_reference)
 VALUES(true,false,'NOT_AUTHORIZED');
REVOKE ALL ON wos_mvp_qa.p1_execution_gate FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE wos_mvp_qa.p1_execution_gate ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION wos_mvp_qa.require_live_gate()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM wos_mvp_qa.p1_execution_gate
   WHERE singleton AND enabled AND approved_run_id IS NOT NULL
   AND approved_sha IS NOT NULL AND approved_sha ~ '^[a-f0-9]{40}$'
   AND enabled_until > clock_timestamp()
   AND enabled_until <= updated_at + interval '15 minutes'
   AND approval_reference<>'NOT_AUTHORIZED')
 THEN RAISE EXCEPTION 'QA_OVERLAY_P1_OWNER_GATE_NOT_OPEN' USING ERRCODE='42501'; END IF;
 IF (SELECT enabled FROM public.wos_qa_p2_execution_gate
   WHERE gate_name='OPERATOR_WRITES') IS DISTINCT FROM false
 OR (SELECT enabled FROM public.wos_qa_p2_office_execution_gate
   WHERE gate_name='OFFICE_WRITES') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'QA_OVERLAY_P2_GATE_CONFLICT' USING ERRCODE='42501';END IF;
END $guard$;
REVOKE ALL ON FUNCTION wos_mvp_qa.require_live_gate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE wos_mvp_qa.cpc_order_bindings(
 order_id uuid PRIMARY KEY REFERENCES public.wos_production_orders(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 customer_id uuid NOT NULL REFERENCES public.cpc_customer_references(id),
 project_id uuid NOT NULL REFERENCES public.cpc_projects(id),
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wos_mvp_qa.cpc_order_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wos_mvp_qa.cpc_order_bindings FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX wos_qa_overlay_cpc_binding_project_org ON wos_mvp_qa.cpc_order_bindings(
 organization_id,project_id,customer_id
);
-- This operation is strictly additive and leaves all 83 historical NULL CPC orders untouched.
ALTER TABLE public.wos_production_orders ADD COLUMN follow_up_batch_plan text;
CREATE FUNCTION wos_mvp_qa.assert_cpc_link(p_order_id uuid,p_actor_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $link$
DECLARE b wos_mvp_qa.cpc_order_bindings%ROWTYPE;
BEGIN
 SELECT * INTO b FROM wos_mvp_qa.cpc_order_bindings
 WHERE order_id=p_order_id AND organization_id=p_actor_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_OVERLAY_CPC_BINDING_REQUIRED' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM public.wos_production_orders o
 JOIN public.cpc_projects p ON p.id=b.project_id AND p.org_id=b.organization_id
   AND p.customer_reference_id=b.customer_id
 JOIN public.cpc_customer_references c ON c.id=b.customer_id AND c.org_id=b.organization_id
 JOIN public.profiles owner ON owner.id=p.owner_profile_id AND owner.org_id=p.org_id
 WHERE o.id=b.order_id AND o.organization_id=b.organization_id
  AND o.customer_id=b.customer_id AND o.project_id=b.project_id
  AND c.status='active' AND p.status='active' AND p.archived_at IS NULL
  AND owner.is_active=true
 FOR KEY SHARE OF p,c,owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_OVERLAY_CPC_LINK_INVALID_OR_CHANGED' USING ERRCODE='23514';END IF;
 IF NOT public.cpc_can_read_project(b.project_id,b.organization_id)
 OR NOT public.cpc_can_read_customer_reference(b.customer_id,b.organization_id)
 THEN RAISE EXCEPTION 'QA_OVERLAY_CPC_PERMISSION_DENIED' USING ERRCODE='42501';END IF;
END $link$;
REVOKE ALL ON FUNCTION wos_mvp_qa.assert_cpc_link(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
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
 PERFORM wos_mvp_qa.require_live_gate();
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
  IF NOT EXISTS (SELECT 1 FROM wos_mvp_qa.cpc_order_bindings b
    WHERE b.order_id=v_existing.id AND b.organization_id=v_actor.org_id
      AND b.customer_id=p_customer_id AND b.project_id=p_project_id)
  THEN RAISE EXCEPTION 'QA_OVERLAY_EXISTING_ORDER_NOT_CANDIDATE' USING ERRCODE='23505';END IF;
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
 INSERT INTO wos_mvp_qa.cpc_order_bindings(
   order_id,organization_id,customer_id,project_id,actor_profile_id)
 VALUES(p_request_id,v_actor.org_id,p_customer_id,p_project_id,v_actor.id);
 PERFORM wos_mvp_qa.assert_cpc_link(p_request_id,v_actor.org_id);
 RETURN pg_catalog.jsonb_build_object('result','CREATED','orderId',p_request_id,
  'orderNumber',v_number,'version',1);
END $body$;


CREATE FUNCTION public.wos_mvp_create_cpc_draft_candidate(
 p_request_id uuid,p_customer_id uuid,p_project_id uuid,p_product_name text,
 p_material text,p_quantity integer,p_priority text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='pg_catalog'
AS $proxy$ SELECT wos_mvp_isolated.create_cpc_draft(
 p_request_id,p_customer_id,p_project_id,p_product_name,p_material,p_quantity,p_priority); $proxy$;

REVOKE ALL ON FUNCTION wos_mvp_isolated.create_cpc_draft(
 uuid,uuid,uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION wos_mvp_isolated.create_cpc_draft(
 uuid,uuid,uuid,text,text,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.wos_mvp_create_cpc_draft_candidate(
 uuid,uuid,uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wos_mvp_create_cpc_draft_candidate(
 uuid,uuid,uuid,text,text,integer,text) TO authenticated;

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
 PERFORM wos_mvp_qa.require_live_gate();
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
 PERFORM wos_mvp_qa.require_live_gate();
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
 PERFORM wos_mvp_qa.require_live_gate();
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
 PERFORM wos_mvp_qa.require_live_gate();
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
 PERFORM wos_mvp_qa.assert_cpc_link(p_order_id,v_actor.org_id);
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
 PERFORM wos_mvp_qa.require_live_gate();
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
 PERFORM wos_mvp_qa.assert_cpc_link(p_order_id,v_actor.org_id);
 -- Never treat client-written CPC names, order number, organization or version
 -- as authoritative; they must be identical to the actual order snapshot.
 IF p_document->>'customerName' IS DISTINCT FROM v_order.customer_name_snapshot
 OR p_document->>'projectName' IS DISTINCT FROM v_order.project_name_snapshot
 OR p_document->>'orderNumber' IS DISTINCT FROM v_order.order_number
 OR p_document->>'versionLabel' IS DISTINCT FROM v_order.version_label
 OR v_order.version_label<>'V1'
 THEN RAISE EXCEPTION 'OFFICE_FORM_SOURCE_SNAPSHOT_MISMATCH' USING ERRCODE='23514'; END IF;
 -- Reject unknown/omitted JSON properties even when a caller invokes this
 -- Supabase RPC directly without going through the Next.js form validator.
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_document))<>21
 OR EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_object_keys(p_document) AS attr(name)
  WHERE attr.name NOT IN (
   'customerName','projectName','orderNumber','productName','priority',
   'isUrgent','versionLabel','requestedQuantity','currentBatchQuantity',
   'plannedShipDate','splitDelivery','followUpBatchPlan','productMaterial',
   'surfaceTreatment','patternScope','seamTolerance','positionReference',
   'customerAcceptanceStandard','packagingMethod','cartonQuantity','labelMarkingRule'
  )
 ) THEN RAISE EXCEPTION 'OFFICE_FORM_FIELD_SET_MISMATCH' USING ERRCODE='23514';END IF;
 -- Check every required shop-floor field; no UI-only validation.
 IF coalesce(length(btrim(p_document->>'productName')),0) NOT BETWEEN 1 AND 200
 OR coalesce(length(btrim(p_document->>'productMaterial')),0) NOT BETWEEN 1 AND 200
 OR coalesce(p_document->>'priority','') NOT IN ('LOW','MEDIUM','HIGH','CRITICAL')
 OR coalesce(p_document->>'patternScope','') NOT IN ('FULL','PARTIAL','MIXED')
 OR coalesce(length(btrim(p_document->>'surfaceTreatment')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'seamTolerance')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'positionReference')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'customerAcceptanceStandard')),0) NOT BETWEEN 1 AND 2000
 OR coalesce(length(btrim(p_document->>'packagingMethod')),0) NOT BETWEEN 1 AND 1000
 OR coalesce(length(btrim(p_document->>'labelMarkingRule')),0) NOT BETWEEN 1 AND 2000
 OR coalesce(p_document->>'plannedShipDate','') !~ '^\d{4}-\d{2}-\d{2}$'
 OR coalesce(pg_catalog.jsonb_typeof(p_document->'isUrgent'),'')<>'boolean'
 OR coalesce(pg_catalog.jsonb_typeof(p_document->'splitDelivery'),'')<>'boolean'
 OR coalesce(p_document->>'requestedQuantity','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p_document->>'currentBatchQuantity','') !~ '^[1-9][0-9]{0,9}$'
 OR coalesce(p_document->>'cartonQuantity','') !~ '^[1-9][0-9]{0,9}$'
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
 PERFORM wos_mvp_qa.require_live_gate();
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true AND role IN('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'OFFICE_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
 WHERE id=p_order_id AND organization_id=v_actor.org_id FOR SHARE;
 IF NOT FOUND OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
  AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'FULL_SUBMIT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM wos_mvp_qa.assert_cpc_link(p_order_id,v_actor.org_id);
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
