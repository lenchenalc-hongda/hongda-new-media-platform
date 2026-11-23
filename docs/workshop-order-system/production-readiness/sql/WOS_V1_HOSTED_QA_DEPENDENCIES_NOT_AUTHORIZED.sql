-- WOS V1 HOSTED QA EDGE DEPENDENCIES
-- INSTALL_NOT_AUTHORIZED
--
-- Adds only the three service-role functions required by the project-neutral
-- Edge verifier in the isolated QA project. Existing QA private-object lookup,
-- Proof write guard, M2 receipt and revision-revision signoff behavior remain
-- authoritative and are reused rather than broadened.

BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_hosted_install_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_HOSTED_QA_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF to_regprocedure(
      'public.wos_qa_get_storage_object_for_proof(text)'
    ) IS NULL
    OR to_regclass('public.wos_qa_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_qa_trusted_proof_receipts') IS NULL
    OR to_regclass('public.wos_qa_orphan_cleanup_claims') IS NULL
    OR to_regprocedure(
      'public.wos_qa_p2_m2_invalidate_signoff(uuid,uuid,uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_HOSTED_QA_PREREQUISITE_MISSING';
  END IF;
  IF to_regprocedure(
      'public.wos_p7_service_storage_snapshot(text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_HOSTED_QA_ALREADY_INSTALLED';
  END IF;
END;
$guard$;

CREATE FUNCTION public.wos_p7_service_storage_snapshot(p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $snapshot$
BEGIN
  IF current_setting('request.jwt.claim.role', true)
      IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN public.wos_qa_get_storage_object_for_proof(p_path);
END;
$snapshot$;

REVOKE ALL ON FUNCTION public.wos_p7_service_storage_snapshot(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_service_storage_snapshot(text)
  TO service_role;

CREATE FUNCTION public.wos_p7_record_trusted_image_proof(
  p_image_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_storage_object_updated_at timestamptz,
  p_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $proof$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_existing public.wos_qa_verified_image_proofs%ROWTYPE;
  v_receipt public.wos_qa_trusted_proof_receipts%ROWTYPE;
  v_slug text;
  v_category text;
  v_prefix text;
  v_request_id uuid;
  v_fingerprint text;
  v_proof_status text;
  v_before_sha text;
  v_expires_at timestamptz;
  v_rows integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true)
      IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_image_id IS NULL
    OR p_order_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_storage_object_id IS NULL
    OR p_storage_object_version IS NULL
    OR length(btrim(p_storage_object_version)) = 0
    OR p_storage_object_updated_at IS NULL
    OR p_storage_path IS NULL
    OR length(p_storage_path) > 600
    OR p_sha256 IS NULL
    OR p_sha256 !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'INVALID_PROOF_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id = p_actor_user_id
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROOF_ACTOR_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_actor.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
    OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
    OR (v_actor.role = 'sales' AND v_actor.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'PROOF_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;
  IF v_order.workflow_status <> 'DRAFT'
    AND NOT (
      v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
      AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
      AND public.wos_qa_revision_gate_allows(
        v_order.id, v_order.organization_id, v_actor.id
      )
    )
  THEN
    RAISE EXCEPTION 'PROOF_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  v_slug := substring(
    p_storage_path
    FROM '/images/([a-z-]+)/versions/'
  );
  v_category := CASE v_slug
    WHEN 'product' THEN 'PRODUCT'
    WHEN 'film-pattern' THEN 'FILM_PATTERN'
    WHEN 'customer-approved-sample' THEN 'CUSTOMER_APPROVED_SAMPLE'
    WHEN 'signed-sample' THEN 'SIGNED_SAMPLE'
  END;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'PROOF_CATEGORY_PATH_INVALID' USING ERRCODE = '23514';
  END IF;

  v_prefix := 'organizations/' || v_order.organization_id::text
    || '/wos/production-order/' || v_order.id::text
    || '/images/' || v_slug
    || '/versions/' || v_order.version_label || '/'
    || p_image_id::text || '/';
  IF p_storage_path <> v_prefix || 'source.png' THEN
    RAISE EXCEPTION 'PROOF_IMAGE_PATH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects object
  WHERE object.bucket_id = 'wos-private'
    AND object.name = p_storage_path
    AND object.id = p_storage_object_id
    AND object.owner_id = p_actor_user_id::text
    AND object.is_delete_marker = false
    AND object.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND
    OR v_object.version IS DISTINCT FROM p_storage_object_version
    OR v_object.updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_object.metadata->>'mimetype' <> 'image/png'
    OR COALESCE(v_object.metadata->>'size', '') !~ '^[0-9]+$'
    OR (v_object.metadata->>'size')::bigint NOT BETWEEN 60 AND 20971520
  THEN
    RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.wos_qa_orphan_cleanup_claims claim
    WHERE claim.storage_object_id = p_storage_object_id
      AND claim.state = 'CLAIMED'
      AND claim.lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'QA_CLEANUP_CLAIM_IN_PROGRESS' USING ERRCODE = 'PT409';
  END IF;

  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'orderId', p_order_id,
    'imageId', p_image_id,
    'category', v_category,
    'actorUserId', p_actor_user_id,
    'expectedVersion', v_order.version,
    'storagePath', p_storage_path,
    'objectId', p_storage_object_id,
    'objectVersion', p_storage_object_version,
    'objectUpdatedAt', p_storage_object_updated_at,
    'sha256', p_sha256
  )::text, 'UTF8')), 'hex');
  v_request_id := (
    substr(md5('wos-v1-qa-proof|' || v_fingerprint), 1, 8) || '-'
    || substr(md5('wos-v1-qa-proof|' || v_fingerprint), 9, 4) || '-'
    || substr(md5('wos-v1-qa-proof|' || v_fingerprint), 13, 4) || '-'
    || substr(md5('wos-v1-qa-proof|' || v_fingerprint), 17, 4) || '-'
    || substr(md5('wos-v1-qa-proof|' || v_fingerprint), 21, 12)
  )::uuid;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-qa-proof:' || p_order_id::text, 0)
  );
  SELECT * INTO v_receipt
  FROM public.wos_qa_trusted_proof_receipts receipt
  WHERE receipt.request_id = v_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.organization_id <> v_actor.org_id
      OR v_receipt.order_id <> p_order_id
      OR v_receipt.image_id <> p_image_id
      OR v_receipt.actor_user_id <> p_actor_user_id
      OR v_receipt.expected_version <> v_order.version
      OR v_receipt.payload_fingerprint <> v_fingerprint
    THEN
      RAISE EXCEPTION 'PROOF_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'status', 'REPLAYED',
      'imageId', p_image_id,
      'category', lower(v_category),
      'sha256', p_sha256
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.wos_qa_verified_image_proofs proof
  WHERE proof.image_id = p_image_id
  FOR UPDATE;
  v_proof_status := CASE WHEN FOUND THEN 'UPDATED' ELSE 'CREATED' END;
  IF FOUND THEN
    IF v_existing.organization_id <> v_actor.org_id
      OR v_existing.order_id <> p_order_id
      OR v_existing.storage_path <> p_storage_path
    THEN
      RAISE EXCEPTION 'PROOF_IMAGE_CONFLICT' USING ERRCODE = '23505';
    END IF;
    v_before_sha := v_existing.verified_sha256;
  END IF;

  PERFORM set_config('wos.qa.actor_user_id', p_actor_user_id::text, true);
  PERFORM set_config('wos.qa.trusted_proof_rpc', '1', true);
  INSERT INTO public.wos_qa_verified_image_proofs (
    image_id, organization_id, order_id, actor_user_id, storage_bucket,
    storage_path, storage_object_id, storage_object_version,
    storage_object_updated_at, verified_sha256, verified_at, expires_at
  ) VALUES (
    p_image_id, v_actor.org_id, p_order_id, p_actor_user_id, 'wos-private',
    p_storage_path, p_storage_object_id, p_storage_object_version,
    p_storage_object_updated_at, p_sha256, clock_timestamp(),
    clock_timestamp() + interval '10 minutes'
  )
  ON CONFLICT (image_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    order_id = EXCLUDED.order_id,
    actor_user_id = EXCLUDED.actor_user_id,
    storage_bucket = EXCLUDED.storage_bucket,
    storage_path = EXCLUDED.storage_path,
    storage_object_id = EXCLUDED.storage_object_id,
    storage_object_version = EXCLUDED.storage_object_version,
    storage_object_updated_at = EXCLUDED.storage_object_updated_at,
    verified_sha256 = EXCLUDED.verified_sha256,
    verified_at = EXCLUDED.verified_at,
    expires_at = EXCLUDED.expires_at
  WHERE public.wos_qa_verified_image_proofs.order_id = EXCLUDED.order_id
  RETURNING expires_at INTO v_expires_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'PROOF_ORDER_CONFLICT' USING ERRCODE = '42501';
  END IF;

  PERFORM public.wos_qa_p2_m2_invalidate_signoff(
    v_order.id, v_order.organization_id, p_image_id
  );
  INSERT INTO public.wos_qa_trusted_proof_receipts (
    request_id, organization_id, order_id, image_id, actor_user_id,
    actor_profile_id, expected_version, payload_fingerprint, proof_status,
    before_sha256, after_sha256, storage_object_id, storage_object_version,
    storage_object_updated_at, result_json
  ) VALUES (
    v_request_id, v_actor.org_id, p_order_id, p_image_id, p_actor_user_id,
    v_actor.id, v_order.version, v_fingerprint, v_proof_status, v_before_sha,
    p_sha256, p_storage_object_id, p_storage_object_version,
    p_storage_object_updated_at, jsonb_build_object(
      'status', v_proof_status,
      'imageId', p_image_id,
      'category', lower(v_category),
      'sha256', p_sha256,
      'canStart', false
    )
  );

  RETURN jsonb_build_object(
    'status', 'VERIFIED',
    'imageId', p_image_id,
    'category', lower(v_category),
    'sha256', p_sha256,
    'proofExpiresAt', v_expires_at,
    'canStart', false
  );
END;
$proof$;

REVOKE ALL ON FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid, uuid, uuid, text, uuid, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid, uuid, uuid, text, uuid, text, timestamptz, text
) TO service_role;

CREATE FUNCTION public.wos_v1_renew_expired_image_proof(
  p_image_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_storage_object_updated_at timestamptz,
  p_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $renew$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_proof public.wos_qa_verified_image_proofs%ROWTYPE;
  v_expires_at timestamptz;
  v_renewal_request_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true)
      IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_image_id IS NULL
    OR p_order_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_storage_object_id IS NULL
    OR p_storage_object_version IS NULL
    OR length(btrim(p_storage_object_version)) = 0
    OR p_storage_object_updated_at IS NULL
    OR p_storage_path IS NULL
    OR length(p_storage_path) > 600
    OR p_sha256 !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'INVALID_RENEWAL_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles profile
  WHERE profile.user_id = p_actor_user_id
    AND profile.is_active = true
    AND profile.role IN ('admin', 'manager', 'sales')
  LIMIT 1;
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_profile.org_id
  FOR UPDATE;
  IF v_profile.id IS NULL
    OR NOT FOUND
    OR v_order.order_number NOT LIKE 'QA-NONPROD-%'
    OR v_order.workflow_status <> 'DRAFT'
    OR (v_profile.role = 'sales' AND v_profile.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'RENEWAL_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proof
  FROM public.wos_qa_verified_image_proofs proof
  WHERE proof.image_id = p_image_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'ABSENT');
  END IF;
  IF v_proof.organization_id <> v_profile.org_id
    OR v_proof.order_id <> p_order_id
    OR v_proof.actor_user_id <> p_actor_user_id
    OR v_proof.storage_path <> p_storage_path
    OR v_proof.storage_object_id <> p_storage_object_id
    OR v_proof.storage_object_version IS DISTINCT FROM p_storage_object_version
    OR v_proof.storage_object_updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_proof.verified_sha256 <> p_sha256
  THEN
    RAISE EXCEPTION 'RENEWAL_ATTESTATION_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_proof.expires_at > clock_timestamp() THEN
    RETURN jsonb_build_object('status', 'UNCHANGED');
  END IF;

  PERFORM set_config('wos.qa.actor_user_id', p_actor_user_id::text, true);
  PERFORM set_config('wos.qa.trusted_proof_rpc', '1', true);
  UPDATE public.wos_qa_verified_image_proofs
  SET verified_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '10 minutes'
  WHERE image_id = p_image_id
  RETURNING expires_at INTO v_expires_at;

  v_renewal_request_id := (
    substr(md5(
      'wos-v1-qa-renew|' || p_image_id::text || '|'
      || v_proof.expires_at::text || '|' || p_sha256
    ), 1, 8) || '-'
    || substr(md5(
      'wos-v1-qa-renew|' || p_image_id::text || '|'
      || v_proof.expires_at::text || '|' || p_sha256
    ), 9, 4) || '-'
    || substr(md5(
      'wos-v1-qa-renew|' || p_image_id::text || '|'
      || v_proof.expires_at::text || '|' || p_sha256
    ), 13, 4) || '-'
    || substr(md5(
      'wos-v1-qa-renew|' || p_image_id::text || '|'
      || v_proof.expires_at::text || '|' || p_sha256
    ), 17, 4) || '-'
    || substr(md5(
      'wos-v1-qa-renew|' || p_image_id::text || '|'
      || v_proof.expires_at::text || '|' || p_sha256
    ), 21, 12)
  )::uuid;
  INSERT INTO public.wos_qa_trusted_proof_receipts (
    request_id, organization_id, order_id, image_id, actor_user_id,
    actor_profile_id, expected_version, payload_fingerprint, proof_status,
    before_sha256, after_sha256, storage_object_id, storage_object_version,
    storage_object_updated_at, result_json
  ) VALUES (
    v_renewal_request_id, v_profile.org_id, p_order_id, p_image_id,
    p_actor_user_id, v_profile.id, v_order.version,
    encode(sha256(convert_to(
      v_proof.image_id::text || '|' || v_proof.expires_at::text,
      'UTF8'
    )), 'hex'),
    'UPDATED', v_proof.verified_sha256, p_sha256, p_storage_object_id,
    p_storage_object_version, p_storage_object_updated_at,
    jsonb_build_object(
      'status', 'RENEWED',
      'imageId', p_image_id,
      'expiresAt', v_expires_at,
      'canStart', false
    )
  )
  ON CONFLICT (request_id) DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'RENEWED',
    'imageId', p_image_id,
    'orderId', p_order_id,
    'expiresAt', v_expires_at,
    'canStart', false
  );
END;
$renew$;

REVOKE ALL ON FUNCTION public.wos_v1_renew_expired_image_proof(
  uuid, uuid, uuid, text, uuid, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_renew_expired_image_proof(
  uuid, uuid, uuid, text, uuid, text, timestamptz, text
) TO service_role;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
