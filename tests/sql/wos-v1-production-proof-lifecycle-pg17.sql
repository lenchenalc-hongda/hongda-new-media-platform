SELECT set_config(
  'wos_v1.test_version_label',
  :'version_label',
  false
);

CREATE TEMP TABLE proof_lifecycle_state(
  state text PRIMARY KEY,
  office_digest text,
  workshop_digest text,
  office_profile uuid,
  workshop_profile uuid,
  order_version integer,
  workflow_status text
);

CREATE FUNCTION public.wos_test_renew_all(
  p_order_id uuid,
  p_actor_user_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $renew_all$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT image.id, image.storage_path,
      object.id AS object_id, object.version,
      object.updated_at, proof.verified_sha256
    FROM public.wos_reference_images image
    JOIN public.wos_verified_image_proofs proof
      ON proof.image_id=image.id
      AND proof.order_id=image.entity_id
      AND proof.organization_id=image.organization_id
    JOIN storage.objects object
      ON object.id=proof.storage_object_id
      AND object.name=image.storage_path
    WHERE image.entity_id=p_order_id
      AND image.entity_type='PRODUCTION_ORDER'
      AND image.image_status='READY'
      AND image.superseded_at IS NULL
    ORDER BY image.category
  LOOP
    PERFORM public.wos_v1_renew_expired_image_proof(
      v_row.id,
      p_order_id,
      p_actor_user_id,
      v_row.storage_path,
      v_row.object_id,
      v_row.version,
      v_row.updated_at,
      v_row.verified_sha256
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$renew_all$;

RESET ROLE;
SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;

DO $negative_scope$
BEGIN
  BEGIN
    PERFORM public.wos_v1_renew_expired_image_proof(
      '41111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '50505050-5050-4050-8050-505050505050',
      'organizations/qa/product.png',
      '51111111-1111-4111-8111-111111111111',
      'v1',
      (SELECT updated_at FROM storage.objects
       WHERE id='51111111-1111-4111-8111-111111111111'),
      (SELECT verified_sha256 FROM public.wos_verified_image_proofs
       WHERE image_id='41111111-1111-4111-8111-111111111111')
    );
    RAISE EXCEPTION 'CROSS_ORG_RENEWAL_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.wos_v1_renew_expired_image_proof(
      '99999999-9999-4999-8999-999999999999',
      '33333333-3333-4333-8333-333333333333',
      '10101010-1010-4010-8010-101010101010',
      'organizations/qa/not-current.png',
      '51111111-1111-4111-8111-111111111111',
      'v1',
      (SELECT updated_at FROM storage.objects
       WHERE id='51111111-1111-4111-8111-111111111111'),
      repeat('a',64)
    );
    RAISE EXCEPTION 'NON_CURRENT_IMAGE_RENEWAL_ALLOWED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.wos_v1_renew_expired_image_proof(
      '41111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '10101010-1010-4010-8010-101010101010',
      'organizations/qa/product.png',
      '51111111-1111-4111-8111-111111111111',
      'changed-object-version',
      (SELECT updated_at FROM storage.objects
       WHERE id='51111111-1111-4111-8111-111111111111'),
      (SELECT verified_sha256 FROM public.wos_verified_image_proofs
       WHERE image_id='41111111-1111-4111-8111-111111111111')
    );
    RAISE EXCEPTION 'OBJECT_VERSION_CHANGE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM public.wos_v1_renew_expired_image_proof(
      '41111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '10101010-1010-4010-8010-101010101010',
      'organizations/qa/product.png',
      '51111111-1111-4111-8111-111111111111',
      'v1',
      (SELECT updated_at FROM storage.objects
       WHERE id='51111111-1111-4111-8111-111111111111'),
      repeat('f',64)
    );
    RAISE EXCEPTION 'ALTERED_SHA_RENEWAL_ALLOWED';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;
END;
$negative_scope$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
SELECT public.wos_v1_m2_action(
  '33333333-3333-4333-8333-333333333333',
  7,
  '81111111-1111-4111-8111-111111111111',
  'BASELINE_SELECT',
  jsonb_build_object(
    'productionVersionLabel',current_setting('wos_v1.test_version_label'),
    'note','Office selects the current four-image V2 baseline.',
    'imageIds',jsonb_build_array(
      '41111111-1111-4111-8111-111111111111',
      '42222222-2222-4222-8222-222222222222',
      '43333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444'
    )
  )
);
SELECT public.wos_v1_m2_action(
  '33333333-3333-4333-8333-333333333333',
  8,
  '82222222-2222-4222-8222-222222222222',
  'BASELINE_OFFICE_CONFIRM',
  jsonb_build_object(
    'productionVersionLabel',current_setting('wos_v1.test_version_label'),
    'note','Office signs the stable V2 image identity digest.',
    'baselineId',(
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND version_label=current_setting('wos_v1.test_version_label') AND status='DRAFT'
    )
  )
);
RESET ROLE;

INSERT INTO proof_lifecycle_state
SELECT 'after_office',office_proof_set_digest,NULL,
  confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,
  (SELECT version FROM public.wos_production_orders
   WHERE id='33333333-3333-4333-8333-333333333333'),
  (SELECT workflow_status FROM public.wos_production_orders
   WHERE id='33333333-3333-4333-8333-333333333333')
FROM public.wos_visual_baselines
WHERE entity_id='33333333-3333-4333-8333-333333333333'
  AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';

-- Expire all Proofs past the normal 10-minute TTL. The stable identity is
-- unchanged, so signatures must survive and re-verification must renew them.
UPDATE public.wos_verified_image_proofs
SET verified_at=clock_timestamp()-interval '11 minutes',
    expires_at=clock_timestamp()-interval '1 minute'
WHERE order_id='33333333-3333-4333-8333-333333333333';

DO $office_after_ten_minutes$
DECLARE
  v_saved proof_lifecycle_state%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
BEGIN
  SELECT * INTO v_saved FROM proof_lifecycle_state WHERE state='after_office';
  SELECT * INTO v_baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';
  IF v_baseline.office_proof_set_digest IS DISTINCT FROM v_saved.office_digest
    OR v_baseline.confirmed_by_office_profile_id IS DISTINCT FROM
      v_saved.office_profile
  THEN RAISE EXCEPTION 'TEN_MINUTE_EXPIRY_CLEARED_OFFICE_SIGNATURE'; END IF;
END;
$office_after_ten_minutes$;
SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;
SELECT public.wos_test_renew_all(
  '33333333-3333-4333-8333-333333333333',
  '80808080-8080-4080-8080-808080808080'
);
RESET ROLE;

-- Simulate a full day between Office and Workshop.
UPDATE public.wos_verified_image_proofs
SET verified_at=clock_timestamp()-interval '25 hours',
    expires_at=clock_timestamp()-interval '24 hours'
WHERE order_id='33333333-3333-4333-8333-333333333333';

DO $office_after_twenty_four_hours$
DECLARE
  v_saved proof_lifecycle_state%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
BEGIN
  SELECT * INTO v_saved FROM proof_lifecycle_state WHERE state='after_office';
  SELECT * INTO v_baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';
  IF v_baseline.office_proof_set_digest IS DISTINCT FROM v_saved.office_digest
  THEN RAISE EXCEPTION 'TWENTY_FOUR_HOUR_EXPIRY_CLEARED_OFFICE_SIGNATURE'; END IF;
END;
$office_after_twenty_four_hours$;
SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;
SELECT public.wos_test_renew_all(
  '33333333-3333-4333-8333-333333333333',
  '10101010-1010-4010-8010-101010101010'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
SELECT public.wos_v1_m2_action(
  '33333333-3333-4333-8333-333333333333',
  9,
  '83333333-3333-4333-8333-333333333333',
  'BASELINE_WORKSHOP_CONFIRM',
  jsonb_build_object(
    'productionVersionLabel',current_setting('wos_v1.test_version_label'),
    'note','Workshop signs the same stable V2 identity digest.',
    'baselineId',(
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT'
    )
  )
);
RESET ROLE;

INSERT INTO proof_lifecycle_state
SELECT 'after_workshop',office_proof_set_digest,workshop_proof_set_digest,
  confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,
  (SELECT version FROM public.wos_production_orders
   WHERE id='33333333-3333-4333-8333-333333333333'),
  (SELECT workflow_status FROM public.wos_production_orders
   WHERE id='33333333-3333-4333-8333-333333333333')
FROM public.wos_visual_baselines
WHERE entity_id='33333333-3333-4333-8333-333333333333'
  AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';

UPDATE public.wos_verified_image_proofs
SET verified_at=clock_timestamp()-interval '11 minutes',
    expires_at=clock_timestamp()-interval '1 minute'
WHERE order_id='33333333-3333-4333-8333-333333333333';
SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;
SELECT public.wos_test_renew_all(
  '33333333-3333-4333-8333-333333333333',
  '10101010-1010-4010-8010-101010101010'
);
RESET ROLE;

DO $workshop_signature_survives$
DECLARE
  v_saved proof_lifecycle_state%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
BEGIN
  SELECT * INTO v_saved FROM proof_lifecycle_state WHERE state='after_workshop';
  SELECT * INTO v_baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';
  IF v_baseline.office_proof_set_digest IS DISTINCT FROM v_saved.office_digest
    OR v_baseline.workshop_proof_set_digest IS DISTINCT FROM
      v_saved.workshop_digest
    OR v_baseline.confirmed_by_office_profile_id IS DISTINCT FROM
      v_saved.office_profile
    OR v_baseline.confirmed_by_workshop_profile_id IS DISTINCT FROM
      v_saved.workshop_profile
  THEN RAISE EXCEPTION 'RENEWAL_CLEARED_DUAL_SIGNOFFS'; END IF;
END;
$workshop_signature_survives$;

SET ROLE authenticated;
SELECT public.wos_v1_m2_action(
  '33333333-3333-4333-8333-333333333333',
  10,
  '84444444-4444-4444-8444-444444444444',
  'FINAL_READINESS_CONFIRM',
  jsonb_build_object(
    'productionVersionLabel',current_setting('wos_v1.test_version_label'),
    'note','All four physical materials are complete and verified.',
    'baselineId',(
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT'
    ),
    'physicalCheckAttested',true,
    'filmArrivedAt',clock_timestamp()-interval '2 hours',
    'fixtureArrivedAt',clock_timestamp()-interval '2 hours',
    'incomingArrivedAt',clock_timestamp()-interval '2 hours',
    'signedSampleArrivedAt',clock_timestamp()-interval '2 hours',
    'quantityExpected',100,
    'quantityArrived',100
  )
);
RESET ROLE;

UPDATE public.wos_verified_image_proofs
SET verified_at=clock_timestamp()-interval '25 hours',
    expires_at=clock_timestamp()-interval '24 hours'
WHERE order_id='33333333-3333-4333-8333-333333333333';
SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;
SELECT public.wos_test_renew_all(
  '33333333-3333-4333-8333-333333333333',
  '10101010-1010-4010-8010-101010101010'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '80808080-8080-4080-8080-808080808080',
  false
);
SET ROLE authenticated;
SELECT public.wos_v1_authorize_production_start(
  '33333333-3333-4333-8333-333333333333',
  11,
  '85555555-5555-4555-8555-555555555555',
  (
    SELECT id FROM public.wos_visual_baselines
    WHERE entity_id='33333333-3333-4333-8333-333333333333'
      AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT'
  ),
  'Independent manager release after stable identity renewal.'
);
RESET ROLE;

DO $release_positive$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_release public.wos_v1_start_releases%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id='33333333-3333-4333-8333-333333333333';
  SELECT * INTO v_release FROM public.wos_v1_start_releases
  WHERE order_id=v_order.id
  ORDER BY created_at DESC LIMIT 1;
  IF v_order.workflow_status<>'READY_TO_START' OR v_order.version<>12
    OR v_release.result_json->>'productionStarted'<>'false'
    OR v_release.result_json->>'canStart'<>'false'
  THEN RAISE EXCEPTION 'RELEASE_POSITIVE_STATE_INVALID'; END IF;
  INSERT INTO proof_lifecycle_state
  VALUES('positive_release',v_release.proof_set_digest,
    v_release.proof_set_digest,v_release.office_profile_id,
    v_release.workshop_profile_id,v_order.version,v_order.workflow_status);
END;
$release_positive$;

DO $viewer_denied$
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    '40404040-4040-4040-8040-404040404040',
    false
  );
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      12,
      '86666666-6666-4666-8666-666666666666',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel',current_setting('wos_v1.test_version_label'),
        'note','Viewer must not write production evidence.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'arrivedAt',clock_timestamp()
      )
    );
    RAISE EXCEPTION 'VIEWER_WRITE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$viewer_denied$;

DO $cross_org_denied$
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    '50505050-5050-4050-8050-505050505050',
    false
  );
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      12,
      '87777777-7777-4777-8777-777777777777',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel',current_setting('wos_v1.test_version_label'),
        'note','Cross-organization actor must not write.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'arrivedAt',clock_timestamp()
      )
    );
    RAISE EXCEPTION 'CROSS_ORG_WRITE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_org_denied$;

-- Actual content change invalidates both signatures and rolls READY_TO_START
-- back to WAITING_MATERIAL.
SELECT set_config(
  'request.jwt.claim.sub',
  '80808080-8080-4080-8080-808080808080',
  false
);
UPDATE public.wos_verified_image_proofs
SET verified_sha256=repeat('f',64)
WHERE image_id='41111111-1111-4111-8111-111111111111';

DO $content_change_invalidated$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id='33333333-3333-4333-8333-333333333333';
  SELECT * INTO v_baseline FROM public.wos_visual_baselines
  WHERE entity_id=v_order.id AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';
  IF v_order.workflow_status<>'WAITING_MATERIAL' OR v_order.version<>13
    OR v_baseline.office_proof_set_digest IS NOT NULL
    OR v_baseline.workshop_proof_set_digest IS NOT NULL
    OR v_baseline.confirmed_by_office_profile_id IS NOT NULL
    OR v_baseline.confirmed_by_workshop_profile_id IS NOT NULL
  THEN RAISE EXCEPTION 'CONTENT_CHANGE_DID_NOT_INVALIDATE'; END IF;
END;
$content_change_invalidated$;

DO $final_state$
DECLARE
  v_positive proof_lifecycle_state%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
BEGIN
  SELECT * INTO v_positive FROM proof_lifecycle_state
  WHERE state='positive_release';
  SELECT * INTO v_order FROM public.wos_production_orders
  WHERE id='33333333-3333-4333-8333-333333333333';
  SELECT * INTO v_baseline FROM public.wos_visual_baselines
  WHERE entity_id=v_order.id AND version_label=current_setting('wos_v1.test_version_label') AND status='CURRENT';
  IF v_positive.workflow_status<>'READY_TO_START'
    OR v_positive.order_version<>12
    OR v_order.workflow_status<>'WAITING_MATERIAL'
    OR v_order.version<>13
    OR v_baseline.office_proof_set_digest IS NOT NULL
    OR v_baseline.workshop_proof_set_digest IS NOT NULL
  THEN RAISE EXCEPTION 'PROOF_LIFECYCLE_FINAL_STATE_INVALID'; END IF;
END;
$final_state$;

CREATE OR REPLACE FUNCTION public.wos_test_set_version_label(p_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $set_version_label$
BEGIN
  UPDATE public.wos_production_orders
  SET version_label=p_label
  WHERE id='33333333-3333-4333-8333-333333333333';
  UPDATE public.wos_reference_images
  SET version_label=p_label
  WHERE entity_id='33333333-3333-4333-8333-333333333333';
END;
$set_version_label$;

SET request.jwt.claims='{"role":"service_role"}';
SET ROLE service_role;
DO $invalid_revision_labels$
DECLARE
  v_label text;
  v_message text;
  v_object_id uuid;
  v_object_version text;
  v_object_updated_at timestamptz;
  v_sha256 text;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['V1','V0','V01','V1x','V'] LOOP
    PERFORM public.wos_test_set_version_label(v_label);
    SELECT proof.storage_object_id,proof.storage_object_version,
      proof.storage_object_updated_at,proof.verified_sha256
    INTO v_object_id,v_object_version,v_object_updated_at,v_sha256
    FROM public.wos_verified_image_proofs proof
    WHERE proof.image_id='41111111-1111-4111-8111-111111111111';
    BEGIN
      PERFORM public.wos_v1_renew_expired_image_proof(
        '41111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        '10101010-1010-4010-8010-101010101010',
        'organizations/qa/product.png',
        v_object_id,
        v_object_version,
        v_object_updated_at,
        v_sha256
      );
      RAISE EXCEPTION 'INVALID_VERSION_LABEL_ALLOWED:%',v_label;
    EXCEPTION WHEN SQLSTATE '42501' THEN
      GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
      IF v_message<>'RENEWAL_ORDER_NOT_EDITABLE' THEN
        RAISE EXCEPTION 'INVALID_VERSION_WRONG_REJECTION:%:%',v_label,v_message;
      END IF;
    END;
  END LOOP;
END;
$invalid_revision_labels$;
RESET ROLE;
