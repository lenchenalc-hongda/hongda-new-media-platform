-- WOS P7 nonproduction-only resumable cleanup claims.
-- Never use in Production. No Storage files are changed by this migration.
BEGIN;
DO $qa$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.wos_production_orders
   WHERE order_number LIKE 'QA-NONPROD-%') THEN
   RAISE EXCEPTION 'WOS_QA_SYNTHETIC_DATABASE_REQUIRED'; END IF;
END $qa$;
CREATE TABLE public.wos_qa_orphan_cleanup_claims (
 storage_object_id uuid PRIMARY KEY,
 storage_path text NOT NULL UNIQUE,
 order_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 object_version text,
 object_updated_at timestamptz NOT NULL,
 claim_token uuid NOT NULL,
 state text NOT NULL CHECK (state IN ('CLAIMED','REMOVED','RELEASED')),
 claimed_at timestamptz NOT NULL DEFAULT now(),
 lease_expires_at timestamptz NOT NULL,
 finished_at timestamptz,
 last_result text,
 CHECK (lease_expires_at>claimed_at AND lease_expires_at<=claimed_at+interval '10 minutes')
);
CREATE INDEX wos_qa_cleanup_lease_idx
 ON public.wos_qa_orphan_cleanup_claims(state,lease_expires_at);
ALTER TABLE public.wos_qa_orphan_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wos_qa_orphan_cleanup_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wos_qa_orphan_cleanup_claims TO service_role;

-- Serialize the verified-object proof writer with a pending cleanup claim.
-- This guards the race between an already uploaded object being newly
-- attested and the cleanup worker claiming the same Storage object.
CREATE OR REPLACE FUNCTION public.wos_qa_proof_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE obj storage.objects%ROWTYPE; ord public.wos_production_orders%ROWTYPE;
BEGIN
 SELECT * INTO obj FROM storage.objects
 WHERE id=NEW.storage_object_id AND name=NEW.storage_path AND bucket_id='wos-private'
  AND is_delete_marker=false AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR obj.version IS DISTINCT FROM NEW.storage_object_version
  OR obj.updated_at IS DISTINCT FROM NEW.storage_object_updated_at
  OR obj.owner_id IS DISTINCT FROM NEW.actor_user_id::text
 THEN RAISE EXCEPTION 'QA_PROOF_OBJECT_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT * INTO ord FROM public.wos_production_orders
 WHERE id=NEW.order_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF NOT FOUND OR ord.workflow_status<>'DRAFT'
  OR ord.order_number NOT LIKE 'QA-NONPROD-%'
 THEN RAISE EXCEPTION 'QA_PROOF_ORDER_NOT_DRAFT' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM public.wos_qa_orphan_cleanup_claims c
     WHERE c.storage_object_id=obj.id AND c.state='CLAIMED'
       AND c.lease_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.wos_qa_proof_write_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wos_qa_trusted_proof_guard ON public.wos_qa_verified_image_proofs;
CREATE TRIGGER wos_qa_trusted_proof_guard
 BEFORE INSERT OR UPDATE ON public.wos_qa_verified_image_proofs
 FOR EACH ROW EXECUTE FUNCTION public.wos_qa_proof_write_guard();

-- Acquire at most one stale synthetic orphan per transaction. Locks on
-- the Storage object and order serialize against proof writes / submissions.
CREATE OR REPLACE FUNCTION public.wos_qa_claim_one_stale_orphan(
 p_min_age_hours integer DEFAULT 48)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $claim$
DECLARE
 v_obj record; v_claim public.wos_qa_orphan_cleanup_claims%ROWTYPE;
 v_claim_token uuid:=gen_random_uuid();
BEGIN
 IF p_min_age_hours IS NULL OR p_min_age_hours<24 OR p_min_age_hours>720 THEN
  RAISE EXCEPTION 'INVALID_CLEANUP_AGE' USING ERRCODE='22023'; END IF;
 SELECT so.id AS obj_id,so.name,so.version,so.updated_at AS object_updated_at,
  po.id AS order_id,po.organization_id
 INTO v_obj
 FROM storage.objects so
 JOIN public.wos_production_orders po
   ON po.id::text=(storage.foldername(so.name))[5]
   AND po.organization_id::text=(storage.foldername(so.name))[2]
 LEFT JOIN public.wos_qa_orphan_cleanup_claims c ON c.storage_object_id=so.id
 WHERE so.bucket_id='wos-private'
  AND so.name LIKE 'organizations/%/wos/production-order/%/images/%'
  AND so.is_delete_marker=false AND so.archived_at IS NULL
  AND po.order_number LIKE 'QA-NONPROD-%'
  AND po.workflow_status IN ('DRAFT','SUBMITTED')
  AND so.created_at<now()-make_interval(hours=>p_min_age_hours)
  AND po.updated_at<now()-make_interval(hours=>p_min_age_hours)
  AND (po.workflow_status='SUBMITTED' OR NOT EXISTS (
    SELECT 1 FROM public.wos_office_readiness_receipts ready WHERE ready.order_id=po.id))
  AND NOT EXISTS (SELECT 1 FROM public.wos_reference_images im
    WHERE im.storage_bucket='wos-private' AND im.storage_path=so.name)
  AND NOT EXISTS (SELECT 1 FROM public.wos_qa_verified_image_proofs pf
    WHERE pf.storage_path=so.name AND pf.expires_at>clock_timestamp())
  AND (c.storage_object_id IS NULL OR c.state<>'CLAIMED'
       OR c.lease_expires_at<clock_timestamp())
 ORDER BY so.created_at ASC
 LIMIT 1 FOR UPDATE OF so,po SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_ELIGIBLE_ORPHAN');END IF;
 INSERT INTO public.wos_qa_orphan_cleanup_claims AS claim (
  storage_object_id,storage_path,order_id,organization_id,object_version,
  object_updated_at,claim_token,state,claimed_at,lease_expires_at)
 VALUES(v_obj.obj_id,v_obj.name,v_obj.order_id,v_obj.organization_id,
  v_obj.version,v_obj.object_updated_at,v_claim_token,'CLAIMED',
  now(),now()+interval '5 minutes')
 ON CONFLICT(storage_object_id) DO UPDATE SET
  claim_token=excluded.claim_token,storage_path=excluded.storage_path,
  order_id=excluded.order_id,organization_id=excluded.organization_id,
  object_version=excluded.object_version,
  object_updated_at=excluded.object_updated_at,state='CLAIMED',
  claimed_at=now(),lease_expires_at=now()+interval '5 minutes',
  finished_at=NULL,last_result=NULL
 WHERE claim.state<>'CLAIMED' OR claim.lease_expires_at<clock_timestamp()
 RETURNING * INTO v_claim;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','ALREADY_CLAIMED');END IF;
 RETURN jsonb_build_object('status','CLAIMED','claimToken',v_claim.claim_token,
  'objectId',v_claim.storage_object_id,'path',v_claim.storage_path,
  'orderId',v_claim.order_id,'organizationId',v_claim.organization_id,
  'leaseExpiresAt',v_claim.lease_expires_at);
END $claim$;
REVOKE ALL ON FUNCTION public.wos_qa_claim_one_stale_orphan(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_claim_one_stale_orphan(integer) TO service_role;

-- Second check immediately before Storage API deletion. Recheck every
-- eligibility predicate, row identity and lease; never delete by SQL.
CREATE OR REPLACE FUNCTION public.wos_qa_predelete_orphan(
 p_claim_token uuid,p_object_id uuid,p_min_age_hours integer DEFAULT 48)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $pre$
DECLARE c public.wos_qa_orphan_cleanup_claims%ROWTYPE;
 obj storage.objects%ROWTYPE; ord public.wos_production_orders%ROWTYPE;
BEGIN
 IF p_min_age_hours IS NULL OR p_min_age_hours<24 OR p_min_age_hours>720
 OR p_claim_token IS NULL OR p_object_id IS NULL THEN
  RAISE EXCEPTION 'INVALID_CLEANUP_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.wos_qa_orphan_cleanup_claims
  WHERE storage_object_id=p_object_id AND claim_token=p_claim_token
  AND state='CLAIMED' FOR UPDATE;
 IF NOT FOUND OR c.lease_expires_at<=clock_timestamp()+interval '60 seconds'
 THEN RAISE EXCEPTION 'STALE_OR_MISSING_CLEANUP_CLAIM' USING ERRCODE='PT409'; END IF;
 SELECT * INTO obj FROM storage.objects
 WHERE id=c.storage_object_id AND name=c.storage_path AND bucket_id='wos-private'
  AND is_delete_marker=false AND archived_at IS NULL FOR UPDATE;
 SELECT * INTO ord FROM public.wos_production_orders
 WHERE id=c.order_id AND organization_id=c.organization_id FOR UPDATE;
 IF obj.id IS NULL OR ord.id IS NULL
  OR obj.version IS DISTINCT FROM c.object_version
  OR obj.updated_at IS DISTINCT FROM c.object_updated_at
  OR obj.created_at>=now()-make_interval(hours=>p_min_age_hours)
  OR ord.updated_at>=now()-make_interval(hours=>p_min_age_hours)
  OR ord.workflow_status NOT IN ('DRAFT','SUBMITTED')
  OR ord.order_number NOT LIKE 'QA-NONPROD-%'
  OR (ord.workflow_status='DRAFT' AND EXISTS (
    SELECT 1 FROM public.wos_office_readiness_receipts rd
    WHERE rd.order_id=ord.id))
  OR EXISTS (SELECT 1 FROM public.wos_reference_images im
    WHERE im.storage_bucket='wos-private' AND im.storage_path=c.storage_path)
  OR EXISTS (SELECT 1 FROM public.wos_qa_verified_image_proofs pf
    WHERE pf.storage_path=c.storage_path AND pf.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'CLEANUP_TARGET_NO_LONGER_ELIGIBLE' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('ok',true,'path',c.storage_path,
  'objectId',c.storage_object_id,'claimToken',c.claim_token);
END $pre$;
REVOKE ALL ON FUNCTION public.wos_qa_predelete_orphan(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_predelete_orphan(uuid,uuid,integer)
 TO service_role;

-- Verify that the Storage API removed both the binary and its metadata
-- before recording success. Releasing a claim does not delete the object.
CREATE OR REPLACE FUNCTION public.wos_qa_finish_orphan_claim(
 p_claim_token uuid,p_object_id uuid,p_removed boolean,p_result text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $finish$
DECLARE c public.wos_qa_orphan_cleanup_claims%ROWTYPE;
BEGIN
 IF p_claim_token IS NULL OR p_object_id IS NULL OR p_removed IS NULL
  OR p_result IS NULL OR length(p_result)>200 THEN
  RAISE EXCEPTION 'INVALID_CLEANUP_RESULT' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.wos_qa_orphan_cleanup_claims
 WHERE storage_object_id=p_object_id AND claim_token=p_claim_token
  AND state='CLAIMED' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLEANUP_CLAIM_LOST' USING ERRCODE='PT409'; END IF;
 IF p_removed AND EXISTS (SELECT 1 FROM storage.objects so
    WHERE so.id=c.storage_object_id AND so.name=c.storage_path
     AND so.bucket_id='wos-private') THEN
   RAISE EXCEPTION 'STORAGE_BINARY_METADATA_STILL_PRESENT' USING ERRCODE='PT409'; END IF;
 UPDATE public.wos_qa_orphan_cleanup_claims SET
 state=CASE WHEN p_removed THEN 'REMOVED' ELSE 'RELEASED' END,
 finished_at=clock_timestamp(),last_result=p_result
 WHERE storage_object_id=p_object_id AND claim_token=p_claim_token;
 RETURN jsonb_build_object('status',CASE WHEN p_removed THEN 'REMOVED' ELSE 'RELEASED' END);
END $finish$;
REVOKE ALL ON FUNCTION public.wos_qa_finish_orphan_claim(uuid,uuid,boolean,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_qa_finish_orphan_claim(uuid,uuid,boolean,text)
 TO service_role;
COMMIT;
