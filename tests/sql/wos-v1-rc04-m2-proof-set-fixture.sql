-- Disposable PG17 fixture: install the reviewed QA M2 proof-set verifier.
BEGIN;

ALTER TABLE public.wos_visual_baselines
  ADD COLUMN IF NOT EXISTS office_proof_set_digest text
    CHECK (
      office_proof_set_digest IS NULL
      OR office_proof_set_digest ~ '^[a-f0-9]{64}$'
    ),
  ADD COLUMN IF NOT EXISTS office_post_order_version integer
    CHECK (
      office_post_order_version IS NULL
      OR office_post_order_version > 0
    ),
  ADD COLUMN IF NOT EXISTS workshop_proof_set_digest text
    CHECK (
      workshop_proof_set_digest IS NULL
      OR workshop_proof_set_digest ~ '^[a-f0-9]{64}$'
    ),
  ADD COLUMN IF NOT EXISTS workshop_post_order_version integer
    CHECK (
      workshop_post_order_version IS NULL
      OR workshop_post_order_version > 0
    );

CREATE OR REPLACE FUNCTION public.wos_qa_p2_m2_checked_proof_set(
  p_order_id uuid,
  p_org_id uuid,
  p_baseline_id uuid,
  p_version_label text
) RETURNS TABLE(
  proof_digest text,
  last_verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
VOLATILE
AS $proof$
DECLARE
  v_total integer;
  v_count integer;
  v_categories text[];
  v_images jsonb;
  v_verified timestamptz;
  v_spec jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_visual_baselines baseline
    WHERE baseline.id = p_baseline_id
      AND baseline.organization_id = p_org_id
      AND baseline.entity_type = 'PRODUCTION_ORDER'
      AND baseline.entity_id = p_order_id
      AND baseline.version_label = p_version_label
      AND baseline.status IN ('DRAFT', 'CURRENT')
      AND baseline.superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_BASELINE' USING ERRCODE = 'PT409';
  END IF;
  SELECT count(*) INTO v_total
  FROM public.wos_visual_baseline_items item
  WHERE item.baseline_id = p_baseline_id;
  IF v_total NOT BETWEEN 4 AND 12 THEN
    RAISE EXCEPTION 'BASELINE_IMAGE_COUNT_INVALID' USING ERRCODE = 'PT409';
  END IF;
  WITH locked_proofs AS MATERIALIZED (
    SELECT
      image.id AS image_id,
      image.category,
      image.version_label,
      image.storage_bucket,
      image.storage_path,
      proof.storage_object_id,
      proof.storage_object_version,
      proof.storage_object_updated_at,
      proof.verified_sha256,
      proof.verified_at,
      proof.expires_at
    FROM public.wos_visual_baseline_items item
    JOIN public.wos_reference_images image
      ON image.id = item.reference_image_id
    JOIN public.wos_qa_verified_image_proofs proof
      ON proof.image_id = image.id
      AND proof.order_id = p_order_id
      AND proof.organization_id = p_org_id
      AND proof.storage_bucket = image.storage_bucket
      AND proof.storage_path = image.storage_path
    JOIN storage.objects object
      ON object.id = proof.storage_object_id
      AND object.bucket_id = proof.storage_bucket
      AND object.name = proof.storage_path
      AND object.version = proof.storage_object_version
      AND object.updated_at = proof.storage_object_updated_at
      AND object.archived_at IS NULL
      AND object.is_delete_marker IS DISTINCT FROM true
    WHERE item.baseline_id = p_baseline_id
      AND image.organization_id = p_org_id
      AND image.entity_id = p_order_id
      AND image.entity_type = 'PRODUCTION_ORDER'
      AND image.version_label = p_version_label
      AND image.image_status = 'READY'
      AND image.superseded_at IS NULL
      AND image.storage_bucket = 'wos-private'
      AND proof.storage_object_id IS NOT NULL
      AND pg_catalog.btrim(COALESCE(proof.storage_object_version, '')) <> ''
      AND proof.verified_sha256 ~ '^[a-f0-9]{64}$'
      AND proof.verified_at <= pg_catalog.clock_timestamp()
      AND proof.expires_at > pg_catalog.clock_timestamp()
      AND NOT EXISTS (
        SELECT 1
        FROM public.wos_reference_images newer
        WHERE newer.supersedes_image_id = image.id
          AND newer.image_status = 'READY'
      )
    FOR SHARE OF item, image, proof, object
  )
  SELECT
    count(*)::integer,
    pg_catalog.array_agg(DISTINCT category),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'imageId', image_id,
        'category', category,
        'productionVersion', version_label,
        'bucket', storage_bucket,
        'path', storage_path,
        'objectId', storage_object_id,
        'objectVersion', storage_object_version,
        'objectUpdatedAt', storage_object_updated_at,
        'sha256', verified_sha256,
        'proofVerifiedAt', verified_at,
        'proofExpiresAt', expires_at
      )
      ORDER BY image_id
    ),
    max(verified_at)
  INTO v_count, v_categories, v_images, v_verified
  FROM locked_proofs;
  IF v_count <> v_total
    OR NOT COALESCE(
      ARRAY[
        'PRODUCT',
        'FILM_PATTERN',
        'SIGNED_SAMPLE',
        'CUSTOMER_APPROVED_SAMPLE'
      ]::text[] <@ v_categories,
      false
    )
  THEN
    RAISE EXCEPTION 'UNVERIFIED_OR_INCOMPLETE_PROOF_SET'
      USING ERRCODE = 'PT409';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'org', ord.organization_id,
    'order', ord.id,
    'productionVersion', ord.version_label,
    'customerId', ord.customer_id,
    'customer', ord.customer_name_snapshot,
    'product', ord.product_name,
    'material', ord.product_material,
    'surface', ord.surface_treatment,
    'pattern', ord.pattern_scope,
    'seam', ord.seam_tolerance,
    'position', ord.position_reference,
    'acceptance', ord.customer_acceptance_standard,
    'packaging', ord.packaging_method,
    'cartonQty', ord.carton_quantity,
    'labelRule', ord.label_marking_rule,
    'requestedQty', ord.requested_quantity,
    'batchQty', ord.current_batch_quantity
  )
  INTO v_spec
  FROM public.wos_production_orders ord
  WHERE ord.id = p_order_id
    AND ord.organization_id = p_org_id
    AND ord.version_label = p_version_label;
  IF v_spec IS NULL OR v_images IS NULL THEN
    RAISE EXCEPTION 'PRODUCTION_SPEC_UNAVAILABLE' USING ERRCODE = 'PT409';
  END IF;
  proof_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'baselineId', p_baseline_id,
          'productionSpec', v_spec,
          'imageProofSet', v_images
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );
  last_verified_at := v_verified;
  RETURN NEXT;
END;
$proof$;
REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_checked_proof_set(
  uuid,uuid,uuid,text
) FROM PUBLIC, anon, authenticated;

COMMIT;
