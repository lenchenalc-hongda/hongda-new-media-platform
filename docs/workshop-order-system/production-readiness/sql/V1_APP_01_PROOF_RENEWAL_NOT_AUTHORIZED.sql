-- WOS V1-APP-01 EXPIRED PROOF RENEWAL SUPPORT
-- INSTALL_NOT_AUTHORIZED
--
-- Install after the Production-neutral runtime proof writer and before RPC
-- activation. This function only renews an expired Proof whose complete
-- immutable identity still matches. It cannot create a new Proof or relax
-- object/version/SHA checks.

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_prod_bootstrap_ci'
    AND current_setting('wos_v1.production_migration_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PROOF_RENEWAL_NOT_AUTHORIZED';
  END IF;
  IF to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    OR to_regclass('public.wos_verified_image_proofs') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_PROOF_PREREQUISITE_MISSING';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.wos_v1_renew_expired_image_proof(
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
  v_proof public.wos_verified_image_proofs%ROWTYPE;
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RENEWAL_ACTOR_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_profile.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')
    OR (v_profile.role = 'sales' AND v_profile.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'RENEWAL_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proof
  FROM public.wos_verified_image_proofs proof
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

  UPDATE public.wos_verified_image_proofs
  SET verified_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '10 minutes'
  WHERE image_id = p_image_id
  RETURNING * INTO v_proof;

  RETURN jsonb_build_object(
    'status', 'RENEWED',
    'imageId', v_proof.image_id,
    'orderId', v_proof.order_id,
    'expiresAt', v_proof.expires_at
  );
END;
$renew$;

REVOKE ALL ON FUNCTION public.wos_v1_renew_expired_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_renew_expired_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) TO service_role;

COMMIT;

-- INSTALL_NOT_AUTHORIZED
