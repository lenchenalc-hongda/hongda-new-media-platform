DO $rc04_mirror_and_history$
DECLARE
  v_order_id uuid;
  v_historical_before text;
  v_historical_after text;
  v_digest text;
  v_last_verified_at timestamptz;
BEGIN
  SELECT id INTO v_order_id
  FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001';

  IF (
    SELECT count(*)
    FROM public.wos_verified_image_proofs
    WHERE order_id = v_order_id
  ) <> 8 OR (
    SELECT count(*)
    FROM public.wos_qa_verified_image_proofs
    WHERE order_id = v_order_id
  ) <> 8 OR (
    SELECT count(*)
    FROM public.wos_qa_verified_image_proofs
  ) <> 43
  THEN
    RAISE EXCEPTION 'RC04_PROOF_MIRROR_COUNT_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wos_verified_image_proofs proof
    LEFT JOIN public.wos_qa_verified_image_proofs mirror
      ON mirror.image_id = proof.image_id
      AND mirror.organization_id = proof.organization_id
      AND mirror.order_id = proof.order_id
      AND mirror.actor_user_id = proof.actor_user_id
      AND mirror.storage_bucket = proof.storage_bucket
      AND mirror.storage_path = proof.storage_path
      AND mirror.storage_object_id = proof.storage_object_id
      AND mirror.storage_object_version = proof.storage_object_version
      AND mirror.storage_object_updated_at = proof.storage_object_updated_at
      AND mirror.verified_sha256 = proof.verified_sha256
      AND mirror.verified_at <= proof.verified_at
      AND mirror.expires_at <= proof.expires_at
    WHERE proof.order_id = v_order_id
      AND mirror.image_id IS NULL
  ) THEN
    RAISE EXCEPTION 'RC04_EDGE_V8_PROOF_MIRROR_PROJECTION_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM wos_v1_rc03_compat.historical_rows backup
    WHERE backup.object_kind = 'proof'
      AND backup.row_hash IS DISTINCT FROM (
        SELECT md5(to_jsonb(proof)::text)
        FROM public.wos_qa_verified_image_proofs proof
        WHERE proof.image_id = backup.row_key::uuid
      )
  ) THEN
    RAISE EXCEPTION 'RC04_HISTORICAL_PROOF_FINGERPRINT_CHANGED';
  END IF;

  SELECT md5(to_jsonb(proof)::text) INTO v_historical_before
  FROM public.wos_qa_verified_image_proofs proof
  WHERE proof.image_id = '70000000-0000-4000-8000-000000000012';
  ALTER TABLE public.wos_qa_verified_image_proofs
    DISABLE TRIGGER rc02_verified_proof_guard;
  BEGIN
    PERFORM pg_catalog.set_config(
      'wos.v1.rc03_proof_mirror', '1', true
    );
    UPDATE public.wos_qa_verified_image_proofs
    SET verified_sha256 = repeat('a', 64)
    WHERE image_id = '70000000-0000-4000-8000-000000000012';
    RAISE EXCEPTION 'RC04_PROOF_MIRROR_UPDATE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT LIKE '%RC03_PROOF_MIRROR_UPDATE_FORBIDDEN%' THEN
      RAISE;
    END IF;
  END;
  ALTER TABLE public.wos_qa_verified_image_proofs
    ENABLE TRIGGER rc02_verified_proof_guard;
  PERFORM pg_catalog.set_config(
    'wos.v1.rc03_proof_mirror', '', true
  );
  SELECT md5(to_jsonb(proof)::text) INTO v_historical_after
  FROM public.wos_qa_verified_image_proofs proof
  WHERE proof.image_id = '70000000-0000-4000-8000-000000000012';
  IF v_historical_before IS DISTINCT FROM v_historical_after THEN
    RAISE EXCEPTION 'RC04_HISTORICAL_PROOF_MUTATED_BY_REJECTED_UPDATE';
  END IF;

  SELECT checked.proof_digest, checked.last_verified_at
  INTO v_digest, v_last_verified_at
  FROM public.wos_qa_p2_m2_checked_proof_set(
    v_order_id,
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    (
      SELECT baseline.id
      FROM public.wos_visual_baselines baseline
      WHERE baseline.entity_id = v_order_id
        AND baseline.version_label = 'V2'
        AND baseline.status = 'CURRENT'
        AND baseline.superseded_at IS NULL
    ),
    'V2'
  ) checked;
  IF v_digest IS NULL
    OR v_digest !~ '^[a-f0-9]{64}$'
    OR v_last_verified_at IS NULL
  THEN
    RAISE EXCEPTION 'RC04_M2_PROOF_SET_DIGEST_FAILED';
  END IF;
END;
$rc04_mirror_and_history$;

DO $rc04_no_gate_mirror$
DECLARE
  v_order_id uuid := '74500000-0000-4000-8000-000000000001';
  v_image_id uuid := '74500000-0000-4000-8000-000000000002';
  v_object_id uuid := '74500000-0000-4000-8000-000000000003';
BEGIN
  BEGIN
    PERFORM pg_catalog.set_config(
      'wos.v1.rc02_maintenance', 'yes', true
    );
    INSERT INTO public.wos_production_orders(
      id, organization_id, customer_id, customer_name_snapshot,
      project_id, project_name_snapshot, order_number, product_name,
      sales_owner_profile_id, project_owner_profile_id, priority,
      version_label, workflow_status, requested_quantity,
      current_batch_quantity, split_delivery, product_material,
      created_by_profile_id, version
    ) VALUES (
      v_order_id,
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      '81000000-0000-4000-8000-000000000001',
      'RC04 No Gate Customer',
      '82000000-0000-4000-8000-000000000001',
      'RC04 No Gate Project',
      'QA-NONPROD-RC04-NO-GATE-74500000',
      'RC04 No Gate Product',
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      'MEDIUM',
      'V1',
      'DRAFT',
      10,
      10,
      false,
      'RC04 Synthetic Material',
      '11111111-1111-4111-8111-111111111111',
      1
    );
    INSERT INTO storage.objects(
      id, bucket_id, name, owner_id, metadata, version, updated_at
    ) VALUES (
      v_object_id,
      'wos-private',
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
        || '/wos/production-order/' || v_order_id
        || '/images/product/versions/V1/' || v_image_id
        || '/source.png',
      '10101010-1010-4010-8010-101010101010',
      '{"mimetype":"image/png","size":"120"}'::jsonb,
      'rc04-no-gate-object',
      '2026-11-25T02:00:00.123456Z'
    );
    PERFORM pg_catalog.set_config(
      'wos.v1.rc03_proof_mirror', '1', true
    );
    PERFORM pg_catalog.set_config(
      'wos.qa.trusted_proof_rpc', '1', true
    );
    PERFORM pg_catalog.set_config(
      'wos.qa.actor_user_id',
      '10101010-1010-4010-8010-101010101010',
      true
    );
    ALTER TABLE public.wos_qa_verified_image_proofs
      DISABLE TRIGGER rc02_verified_proof_guard;
    BEGIN
      INSERT INTO public.wos_qa_verified_image_proofs(
        image_id, organization_id, order_id, actor_user_id,
        storage_bucket, storage_path, storage_object_id,
        storage_object_version, storage_object_updated_at,
        verified_sha256, verified_at, expires_at
      ) VALUES (
        v_image_id,
        '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
        v_order_id,
        '10101010-1010-4010-8010-101010101010',
        'wos-private',
        'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
          || '/wos/production-order/' || v_order_id
          || '/images/product/versions/V1/' || v_image_id
          || '/source.png',
        v_object_id,
        'rc04-no-gate-object',
        '2026-11-25T02:00:00.123456Z',
        repeat('b', 64),
        clock_timestamp(),
        clock_timestamp() + interval '10 minutes'
      );
      RAISE EXCEPTION 'RC04_NO_GATE_PROOF_MIRROR_ACCEPTED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM NOT LIKE '%RC03_PROOF_MIRROR_GATE_REQUIRED%' THEN
        RAISE;
      END IF;
    END;
    ALTER TABLE public.wos_qa_verified_image_proofs
      ENABLE TRIGGER rc02_verified_proof_guard;
    RAISE EXCEPTION 'RC04_NEGATIVE_FIXTURE_ROLLBACK'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'RC04_NEGATIVE_FIXTURE_ROLLBACK' THEN
      RAISE;
    END IF;
  END;
  PERFORM pg_catalog.set_config('wos.v1.rc02_maintenance', '', true);
  PERFORM pg_catalog.set_config('wos.v1.rc03_proof_mirror', '', true);
  PERFORM pg_catalog.set_config('wos.qa.trusted_proof_rpc', '', true);
  PERFORM pg_catalog.set_config('wos.qa.actor_user_id', '', true);
  IF EXISTS (
    SELECT 1 FROM public.wos_production_orders WHERE id = v_order_id
  ) OR EXISTS (
    SELECT 1 FROM storage.objects WHERE id = v_object_id
  ) OR EXISTS (
    SELECT 1
    FROM public.wos_qa_verified_image_proofs
    WHERE image_id = v_image_id
  ) THEN
    RAISE EXCEPTION 'RC04_NO_GATE_NEGATIVE_FIXTURE_LEAKED';
  END IF;
END;
$rc04_no_gate_mirror$;

SELECT 'WOS_V1_RC04_LEGACY_PROOF_MIRROR=PASS' AS evidence;
SELECT 'WOS_V1_RC04_EDGE_V8_PROJECTION=PASS' AS evidence;
SELECT 'WOS_V1_RC04_M2_PROOF_SET_DIGEST=PASS' AS evidence;
SELECT 'WOS_V1_RC04_HISTORICAL_PROOF_FINGERPRINT=PASS' AS evidence;
SELECT 'WOS_V1_RC04_MIRROR_NEGATIVE_GATE_AND_UPDATE=PASS' AS evidence;
