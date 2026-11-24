SET ROLE service_role;
SET request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  v_manifest public.wos_qa_canonical_fixture_manifests%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_manifest
  FROM public.wos_qa_canonical_fixture_manifests;
  IF NOT FOUND
    OR v_manifest.stage <> 'PREPARED'
    OR (
      SELECT count(*)
      FROM public.wos_qa_canonical_fixture_manifests
    ) <> 1 THEN
    RAISE EXCEPTION 'concurrent PREPARE did not leave exactly one fixture';
  END IF;
  IF (
    SELECT count(*)
    FROM public.wos_production_orders
    WHERE id IN (
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
    )
  ) <> 1 THEN
    RAISE EXCEPTION 'concurrent PREPARE left two orders';
  END IF;

  v_result := public.wos_qa_rollback_canonical_v1_fixture(
    v_manifest.request_id,
    v_manifest.order_id
  );
  IF v_result->>'stage' <> 'PREPARED' THEN
    RAISE EXCEPTION 'concurrent winner rollback mismatch: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_qa_canonical_fixture_manifests
  ) THEN
    RAISE EXCEPTION 'concurrent winner rollback left manifest';
  END IF;
END;
$$;

RESET request.jwt.claim.role;
RESET ROLE;

SELECT 'CONCURRENT_PREPARE_ASSERTIONS=PASS' AS result;
