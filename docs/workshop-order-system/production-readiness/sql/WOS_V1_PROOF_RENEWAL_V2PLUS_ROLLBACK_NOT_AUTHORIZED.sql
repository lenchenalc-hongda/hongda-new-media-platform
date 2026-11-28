-- WOS V1 expired Proof renewal v2plus rollback
-- ROLLBACK_NOT_AUTHORIZED
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
  v_image public.wos_reference_images%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_proof public.wos_verified_image_proofs%ROWTYPE;
  v_current_image_count integer;
  v_requires_current_images boolean;
  v_category_slug text;
BEGIN
  PERFORM public.wos_v1_assert_service_role_request();
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wos-v1-m2:' || p_order_id::text, 0)
  );
  SELECT * INTO v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id = p_order_id
    AND production_order.organization_id = v_profile.org_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_order.workflow_status NOT IN (
      'DRAFT', 'NEEDS_INFORMATION', 'WAITING_MATERIAL', 'READINESS_CHECK'
    )
    OR (
      v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
      AND v_order.version_label !~ '^V[2-9][0-9]{0,20}$'
    )
    OR (v_profile.role = 'sales' AND v_profile.id NOT IN (
      v_order.created_by_profile_id, v_order.sales_owner_profile_id
    ))
  THEN
    RAISE EXCEPTION 'RENEWAL_ORDER_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  v_requires_current_images := v_order.workflow_status IN (
    'WAITING_MATERIAL', 'READINESS_CHECK'
  );
  IF v_requires_current_images THEN
    SELECT * INTO v_image
    FROM public.wos_reference_images image
    WHERE image.id = p_image_id
      AND image.organization_id = v_profile.org_id
      AND image.entity_type = 'PRODUCTION_ORDER'
      AND image.entity_id = p_order_id
      AND image.version_label = v_order.version_label
      AND image.image_status = 'READY'
      AND image.superseded_at IS NULL
      AND image.storage_bucket = 'wos-private'
      AND image.storage_path = p_storage_path
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RENEWAL_IMAGE_NOT_CURRENT' USING ERRCODE = 'PT409';
    END IF;
    SELECT count(*) INTO v_current_image_count
    FROM public.wos_reference_images image
    WHERE image.organization_id = v_profile.org_id
      AND image.entity_type = 'PRODUCTION_ORDER'
      AND image.entity_id = p_order_id
      AND image.version_label = v_order.version_label
      AND image.image_status = 'READY'
      AND image.superseded_at IS NULL;
    IF v_current_image_count <> 4 THEN
      RAISE EXCEPTION 'RENEWAL_CURRENT_IMAGE_SET_INVALID' USING ERRCODE = 'PT409';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.wos_visual_baselines baseline
      WHERE baseline.organization_id = v_profile.org_id
        AND baseline.entity_type = 'PRODUCTION_ORDER'
        AND baseline.entity_id = p_order_id
        AND baseline.version_label = v_order.version_label
        AND baseline.status = 'CURRENT'
        AND baseline.superseded_at IS NULL
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.wos_visual_baselines baseline
      JOIN public.wos_visual_baseline_items item
        ON item.baseline_id = baseline.id
      WHERE baseline.organization_id = v_profile.org_id
        AND baseline.entity_type = 'PRODUCTION_ORDER'
        AND baseline.entity_id = p_order_id
        AND baseline.version_label = v_order.version_label
        AND baseline.status = 'CURRENT'
        AND baseline.superseded_at IS NULL
        AND item.reference_image_id = p_image_id
    ) THEN
      RAISE EXCEPTION 'RENEWAL_IMAGE_NOT_IN_CURRENT_BASELINE'
        USING ERRCODE = 'PT409';
    END IF;
  END IF;

  v_category_slug := substring(p_storage_path FROM '/images/([a-z-]+)/versions/');
  IF v_category_slug NOT IN (
    'product', 'film-pattern', 'customer-approved-sample', 'signed-sample'
  ) THEN
    RAISE EXCEPTION 'RENEWAL_CATEGORY_PATH_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects object
  WHERE object.id = p_storage_object_id
    AND object.bucket_id = 'wos-private'
    AND object.name = p_storage_path
    AND object.is_delete_marker = false
    AND object.archived_at IS NULL
  FOR SHARE;
  IF NOT FOUND
    OR v_object.version IS DISTINCT FROM p_storage_object_version
    OR v_object.updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_object.metadata->>'mimetype' <> 'image/png'
    OR COALESCE(v_object.metadata->>'size', '') !~ '^[0-9]+$'
    OR (v_object.metadata->>'size')::bigint NOT BETWEEN 60 AND 20971520
  THEN
    RAISE EXCEPTION 'RENEWAL_STORAGE_OBJECT_CHANGED'
      USING ERRCODE = '23514';
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
    OR v_proof.storage_path <> p_storage_path
    OR v_proof.storage_object_id <> p_storage_object_id
    OR v_proof.storage_object_version IS DISTINCT FROM p_storage_object_version
    OR v_proof.storage_object_updated_at IS DISTINCT FROM p_storage_object_updated_at
    OR v_proof.verified_sha256 <> p_sha256
  THEN
    RAISE EXCEPTION 'RENEWAL_ATTESTATION_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_proof.expires_at > clock_timestamp() THEN
    RETURN jsonb_build_object(
      'status', 'UNCHANGED',
      'imageId', p_image_id,
      'category', CASE
        WHEN v_requires_current_images THEN v_image.category
        ELSE replace(v_category_slug, '-', '_')
      END,
      'sha256', p_sha256,
      'canStart', false
    );
  END IF;

  UPDATE public.wos_verified_image_proofs
  SET actor_user_id = p_actor_user_id,
      verified_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '10 minutes'
  WHERE image_id = p_image_id
  RETURNING * INTO v_proof;

  RETURN jsonb_build_object(
    'status', 'RENEWED',
    'imageId', v_proof.image_id,
    'orderId', v_proof.order_id,
    'category', CASE
      WHEN v_requires_current_images THEN v_image.category
      ELSE replace(v_category_slug, '-', '_')
    END,
    'sha256', p_sha256,
    'expiresAt', v_proof.expires_at,
    'canStart', false
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

-- ROLLBACK_NOT_AUTHORIZED
