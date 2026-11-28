SET ROLE service_role;

DO $$
DECLARE
  v_result jsonb;
  v_prepare_replay jsonb;
BEGIN
  IF (
    SELECT count(*)
    FROM public.wos_production_orders
    WHERE id = '22222222-2222-4222-8222-222222222222'
      AND workflow_status = 'WAITING_MATERIAL'
      AND version = 1
      AND version_label = 'QA-R1'
  ) <> 1 THEN
    RAISE EXCEPTION 'fixture order missing';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_reference_images
    WHERE entity_id = '22222222-2222-4222-8222-222222222222'
      AND image_status = 'READY'
      AND superseded_at IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'fixture image count mismatch';
  END IF;
  IF (
    SELECT count(DISTINCT category)
    FROM public.wos_reference_images
    WHERE entity_id = '22222222-2222-4222-8222-222222222222'
  ) <> 4 THEN
    RAISE EXCEPTION 'fixture category mismatch';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_visual_baselines
    WHERE id = '33333333-3333-4333-8333-333333333333'
      AND status = 'CURRENT'
      AND confirmed_by_office_profile_id IS NULL
      AND confirmed_by_workshop_profile_id IS NULL
      AND office_proof_set_digest IS NULL
      AND workshop_proof_set_digest IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'fixture baseline mismatch';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_visual_baseline_items
    WHERE baseline_id = '33333333-3333-4333-8333-333333333333'
      AND is_required = true
  ) <> 4 THEN
    RAISE EXCEPTION 'fixture baseline item mismatch';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_qa_canonical_fixture_manifests
    WHERE request_id = '11111111-1111-4111-8111-111111111111'
      AND order_id = '22222222-2222-4222-8222-222222222222'
      AND baseline_id = '33333333-3333-4333-8333-333333333333'
      AND stage = 'FINALIZED'
      AND finalized_at IS NOT NULL
      AND manifest_sha256 = encode(
        sha256(convert_to(manifest::text, 'UTF8')),
        'hex'
      )
  ) <> 1 THEN
    RAISE EXCEPTION 'fixture manifest mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_verified_image_proofs
    WHERE order_id = '22222222-2222-4222-8222-222222222222'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_submission_receipts
    WHERE order_id = '22222222-2222-4222-8222-222222222222'
  ) OR EXISTS (
    SELECT 1 FROM public.wos_qa_p2_m2_receipts
    WHERE order_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'fixture unexpectedly has Proof or Receipt';
  END IF;

  v_result := public.wos_qa_create_canonical_v1_fixture(
    public.test_fixture_manifest()
  );
  IF v_result->>'status' <> 'REPLAYED'
    OR v_result->>'canStart' <> 'false'
    OR v_result->>'byteVerification'
      <> 'EXTERNAL_REQUIRED_NOT_PROVEN' THEN
    RAISE EXCEPTION 'FINALIZE idempotency mismatch: %', v_result;
  END IF;
  v_prepare_replay := public.wos_qa_create_canonical_v1_fixture(
    public.test_fixture_prepare_input()
  );
  IF v_prepare_replay->>'status' <> 'REPLAYED'
    OR v_prepare_replay->>'stage' <> 'FINALIZED' THEN
    RAISE EXCEPTION 'post-finalize PREPARE replay mismatch: %',
      v_prepare_replay;
  END IF;
END;
$$;

RESET ROLE;

SELECT 'FINALIZE_ASSERTIONS=PASS' AS result;
