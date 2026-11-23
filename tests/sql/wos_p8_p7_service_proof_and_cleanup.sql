-- WOS P8 nonproduction production-structure candidate: service-bound image proof,
-- scoped private Storage policies, and recoverable cleanup lease protocol.
-- Not in supabase/migrations. NOT PRODUCTION AUTHORIZED.
-- No SQL deletion of storage.objects, no physical file deletion.
BEGIN;

CREATE OR REPLACE FUNCTION public.wos_p7_record_trusted_image_proof(
 p_image_id uuid, p_order_id uuid, p_actor_user_id uuid, p_storage_path text,
 p_storage_object_id uuid, p_storage_object_version text,
 p_storage_object_updated_at timestamptz, p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_obj storage.objects%ROWTYPE;
 v_old public.wos_verified_image_proofs%ROWTYPE;
 v_prefix text;
 v_size bigint;
 v_proof uuid;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_image_id IS NULL OR p_order_id IS NULL OR p_actor_user_id IS NULL
 OR p_storage_object_id IS NULL OR p_storage_object_updated_at IS NULL
 OR p_storage_path IS NULL OR length(p_storage_path)>600
 OR p_sha256 !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'INVALID_PROOF_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_actor FROM public.profiles
  WHERE user_id=p_actor_user_id AND is_active=true
   AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id=p_order_id AND organization_id=v_actor.org_id FOR UPDATE;
 IF NOT FOUND OR v_order.workflow_status<>'DRAFT'
  OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
  OR (v_actor.role='sales' AND v_actor.id<>v_order.created_by_profile_id
      AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'PROOF_ORDER_NOT_EDITABLE' USING ERRCODE='42501'; END IF;
 v_prefix:='organizations/'||v_actor.org_id||'/wos/production-order/'||p_order_id||
  '/images/product/versions/'||v_order.version_label||'/'||p_image_id||'/';
 IF left(p_storage_path,length(v_prefix))<>v_prefix
 OR (storage.filename(p_storage_path) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$' OR position('..' in storage.filename(p_storage_path))>0)
 THEN RAISE EXCEPTION 'PROOF_IMAGE_PATH_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_obj FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_storage_path
   AND id=p_storage_object_id AND owner_id=p_actor_user_id::text
   AND is_delete_marker=false AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR v_obj.updated_at IS DISTINCT FROM p_storage_object_updated_at
  OR v_obj.version IS DISTINCT FROM p_storage_object_version
  OR v_obj.metadata->>'mimetype'<>'image/png'
  OR COALESCE(v_obj.metadata->>'size','') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'STORAGE_OBJECT_NOT_TRUSTED' USING ERRCODE='23514'; END IF;
 v_size:=(v_obj.metadata->>'size')::bigint;
 IF v_size<60 OR v_size>20971520 THEN
   RAISE EXCEPTION 'PRIVATE_BINARY_SIZE_OUT_OF_RANGE' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.wos_orphan_cleanup_claims c
   WHERE c.storage_object_id=p_storage_object_id AND c.state='CLAIMED'
     AND c.lease_expires_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'OBJECT_CLEANUP_LEASE_ACTIVE' USING ERRCODE='PT409';
 END IF;
 INSERT INTO public.wos_verified_image_proofs (
 image_id,organization_id,order_id,actor_user_id,storage_bucket,storage_path,
 storage_object_id,storage_object_version,storage_object_updated_at,
 verified_sha256,verified_at,expires_at)
 VALUES(p_image_id,v_actor.org_id,p_order_id,p_actor_user_id,'wos-private',p_storage_path,
 p_storage_object_id,p_storage_object_version,p_storage_object_updated_at,
 p_sha256,clock_timestamp(),clock_timestamp()+interval '10 minutes')
 ON CONFLICT (image_id) DO NOTHING RETURNING image_id INTO v_proof;
 IF v_proof IS NULL THEN
   SELECT * INTO v_old FROM public.wos_verified_image_proofs WHERE image_id=p_image_id;
   IF NOT FOUND OR v_old.organization_id<>v_actor.org_id
    OR v_old.order_id<>p_order_id OR v_old.actor_user_id<>p_actor_user_id
    OR v_old.storage_path<>p_storage_path OR v_old.storage_object_id<>p_storage_object_id
    OR v_old.storage_object_version IS DISTINCT FROM p_storage_object_version
    OR v_old.storage_object_updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_old.verified_sha256<>p_sha256 OR v_old.expires_at<=clock_timestamp()
   THEN RAISE EXCEPTION 'IMAGE_ID_ATTESTATION_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('status','REPLAYED','sha256',p_sha256);
 END IF;
 RETURN jsonb_build_object('status','VERIFIED','sha256',p_sha256);
END $fn$;
REVOKE ALL ON FUNCTION public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text) TO service_role;

-- This is a claim/lease only. Binary removal must be a separately approved Storage API action.
CREATE OR REPLACE FUNCTION public.wos_p7_claim_orphan_cleanup(
 p_object_id uuid, p_order_id uuid, p_org_id uuid, p_min_age_hours integer DEFAULT 48)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_obj storage.objects%ROWTYPE;
 v_claim public.wos_orphan_cleanup_claims%ROWTYPE;
 v_token uuid;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_object_id IS NULL OR p_order_id IS NULL OR p_org_id IS NULL
   OR p_min_age_hours<24 OR p_min_age_hours>720
 THEN RAISE EXCEPTION 'INVALID_CLEANUP_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wos_production_orders
   WHERE id=p_order_id AND organization_id=p_org_id) THEN
   RAISE EXCEPTION 'CLEANUP_ORDER_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_obj FROM storage.objects WHERE id=p_object_id
  AND bucket_id='wos-private' AND name LIKE
   'organizations/'||p_org_id||'/wos/production-order/'||p_order_id||'/images/%'
  AND is_delete_marker=false AND archived_at IS NULL
  AND updated_at < clock_timestamp()-make_interval(hours=>p_min_age_hours)
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NO_ELIGIBLE_ORPHAN'); END IF;
 IF EXISTS(SELECT 1 FROM public.wos_reference_images i
   WHERE i.organization_id=p_org_id AND i.entity_id=p_order_id
     AND i.storage_path=v_obj.name AND i.image_status='READY')
  OR EXISTS(SELECT 1 FROM public.wos_verified_image_proofs p
   WHERE p.order_id=p_order_id AND p.storage_object_id=p_object_id
     AND p.expires_at>clock_timestamp()) THEN
   RETURN jsonb_build_object('status','NOT_ORPHAN');
 END IF;
 SELECT * INTO v_claim FROM public.wos_orphan_cleanup_claims
 WHERE storage_object_id=p_object_id FOR UPDATE;
 IF FOUND AND v_claim.state='CLAIMED' AND v_claim.lease_expires_at>clock_timestamp()
 THEN RETURN jsonb_build_object('status','LEASE_ACTIVE'); END IF;
 v_token:=gen_random_uuid();
 INSERT INTO public.wos_orphan_cleanup_claims (
 storage_object_id,storage_path,order_id,organization_id,object_version,
 object_updated_at,claim_token,state,claimed_at,lease_expires_at)
 VALUES(v_obj.id,v_obj.name,p_order_id,p_org_id,v_obj.version,v_obj.updated_at,
 v_token,'CLAIMED',clock_timestamp(),clock_timestamp()+interval '5 minutes')
 ON CONFLICT(storage_object_id) DO UPDATE SET
  claim_token=excluded.claim_token,state='CLAIMED',claimed_at=excluded.claimed_at,
  lease_expires_at=excluded.lease_expires_at,finished_at=NULL,last_result=NULL,
  object_version=excluded.object_version,object_updated_at=excluded.object_updated_at;
 RETURN jsonb_build_object('status','CLAIMED','claimToken',v_token,'objectId',v_obj.id);
END $fn$;
REVOKE ALL ON FUNCTION public.wos_p7_claim_orphan_cleanup(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_claim_orphan_cleanup(uuid,uuid,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.wos_p7_predelete_orphan(
 p_object_id uuid,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_claim public.wos_orphan_cleanup_claims%ROWTYPE; v_obj storage.objects%ROWTYPE;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_claim FROM public.wos_orphan_cleanup_claims
  WHERE storage_object_id=p_object_id AND claim_token=p_claim_token
   AND state='CLAIMED' AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','LEASE_NOT_ACTIVE'); END IF;
 SELECT * INTO v_obj FROM storage.objects WHERE id=p_object_id
  AND bucket_id='wos-private' AND name=v_claim.storage_path
  AND version IS NOT DISTINCT FROM v_claim.object_version
  AND updated_at IS NOT DISTINCT FROM v_claim.object_updated_at
  AND is_delete_marker=false AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND
 OR EXISTS (SELECT 1 FROM public.wos_reference_images i
   WHERE i.storage_path=v_claim.storage_path AND i.image_status='READY')
 OR EXISTS (SELECT 1 FROM public.wos_verified_image_proofs p
   WHERE p.storage_object_id=p_object_id AND p.expires_at>clock_timestamp())
 THEN RETURN jsonb_build_object('ok',false,'reason','RECHECK_FAILED'); END IF;
 RETURN jsonb_build_object('ok',true,'path',v_obj.name,'objectId',v_obj.id);
END $fn$;
REVOKE ALL ON FUNCTION public.wos_p7_predelete_orphan(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_predelete_orphan(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.wos_p7_finish_orphan_cleanup(
 p_object_id uuid,p_claim_token uuid,p_removed boolean,p_result text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_claim public.wos_orphan_cleanup_claims%ROWTYPE;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_result IS NULL OR length(p_result) NOT BETWEEN 5 AND 200
 THEN RAISE EXCEPTION 'INVALID_CLEANUP_RESULT' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_claim FROM public.wos_orphan_cleanup_claims
 WHERE storage_object_id=p_object_id AND claim_token=p_claim_token
  AND state='CLAIMED' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 IF p_removed AND EXISTS(SELECT 1 FROM storage.objects
    WHERE id=p_object_id AND bucket_id='wos-private')
 THEN RAISE EXCEPTION 'OBJECT_STILL_EXISTS' USING ERRCODE='PT409'; END IF;
 UPDATE public.wos_orphan_cleanup_claims SET
 state=CASE WHEN p_removed THEN 'REMOVED' ELSE 'RELEASED' END,
 finished_at=clock_timestamp(),last_result=p_result
 WHERE storage_object_id=p_object_id AND claim_token=p_claim_token;
 RETURN jsonb_build_object('status',CASE WHEN p_removed THEN 'REMOVED' ELSE 'RELEASED' END);
END $fn$;
REVOKE ALL ON FUNCTION public.wos_p7_finish_orphan_cleanup(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_finish_orphan_cleanup(uuid,uuid,boolean,text) TO service_role;

-- Recover expired leases without making assumptions about a timed-out Storage API.
CREATE OR REPLACE FUNCTION public.wos_p7_release_expired_claims(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE n integer;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE='22023'; END IF;
 WITH candidates AS (
   SELECT storage_object_id FROM public.wos_orphan_cleanup_claims
    WHERE state='CLAIMED' AND lease_expires_at<clock_timestamp()
    ORDER BY lease_expires_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 )
 UPDATE public.wos_orphan_cleanup_claims x
 SET state='RELEASED',finished_at=clock_timestamp(),
   last_result='EXPIRED_LEASE_RELEASED_NO_BINARY_ACTION'
 FROM candidates c WHERE x.storage_object_id=c.storage_object_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.wos_p7_release_expired_claims(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_release_expired_claims(integer) TO service_role;

-- Private Storage policy is constrained by real WOS order, tenant, role, and version.
-- This pilot allows only PNG until Edge byte validator supports other types.
CREATE POLICY wos_p8_private_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='wos-private'
  AND (storage.foldername(name))[1]='organizations'
  AND (storage.foldername(name))[3]='wos'
  AND (storage.foldername(name))[4]='production-order'
  AND (storage.foldername(name))[6]='images'
  AND (storage.foldername(name))[7]='product'
  AND (storage.foldername(name))[8]='versions'
  AND (storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'
  AND (storage.foldername(name))[10] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}[.]png$'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.wos_production_orders o ON o.organization_id=p.org_id
    WHERE p.user_id=auth.uid() AND p.is_active
      AND p.role IN ('admin','manager','sales')
      AND p.org_id::text=(storage.foldername(storage.objects.name))[2]
      AND o.id::text=(storage.foldername(storage.objects.name))[5]
      AND o.workflow_status='DRAFT'
      AND o.version_label=(storage.foldername(storage.objects.name))[9]
      AND (p.role<>'sales' OR p.id=o.created_by_profile_id OR p.id=o.sales_owner_profile_id)
  )
);
CREATE POLICY wos_p8_private_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='wos-private'
  AND (storage.foldername(name))[1]='organizations'
  AND (storage.foldername(name))[3]='wos'
  AND (storage.foldername(name))[4]='production-order'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.wos_production_orders o ON o.organization_id=p.org_id
    WHERE p.user_id=auth.uid() AND p.is_active
      AND p.org_id::text=(storage.foldername(storage.objects.name))[2]
      AND o.id::text=(storage.foldername(storage.objects.name))[5]
      AND (p.role IN ('admin','manager')
        OR (p.role='sales' AND (p.id=o.created_by_profile_id OR p.id=o.sales_owner_profile_id))
        OR (p.role='operator' AND o.workflow_status='SUBMITTED'))
  )
);
COMMIT;
