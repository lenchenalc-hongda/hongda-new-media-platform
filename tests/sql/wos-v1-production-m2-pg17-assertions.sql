-- Disposable PostgreSQL 17 assertions for production V1 M2.
DO $$
BEGIN
  IF has_table_privilege('authenticated','public.wos_v1_m2_receipts','INSERT')
    OR has_table_privilege('authenticated','public.wos_v1_start_releases','INSERT')
    OR has_function_privilege(
      'authenticated',
      'public.wos_v1_m2_checked_proof_set(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'PRODUCTION_M2_DIRECT_WRITE_OR_HELPER_EXPOSED';
  END IF;
END $$;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      7,
      '61000000-0000-4000-8000-000000000000',
      'BASELINE_SELECT',
      jsonb_build_object(
        'productionVersionLabel','V1',
        'note','A five-image baseline must be rejected.',
        'imageIds',jsonb_build_array(
          '41111111-1111-4111-8111-111111111111',
          '42222222-2222-4222-8222-222222222222',
          '43333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
          '45555555-5555-4555-8555-555555555555'
        )
      )
    );
    RAISE EXCEPTION 'PRODUCTION_M2_FIVE_IMAGE_BASELINE_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.wos_v1_m2_action(
    '33333333-3333-4333-8333-333333333333',
    7,
    '61111111-1111-4111-8111-111111111111',
    'BASELINE_SELECT',
    jsonb_build_object(
      'productionVersionLabel','V1',
      'note','Office selects the current four-category private proof set.',
      'imageIds',jsonb_build_array(
        '41111111-1111-4111-8111-111111111111',
        '42222222-2222-4222-8222-222222222222',
        '43333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444'
      )
    )
  );
  IF result->>'status' <> 'APPLIED'
    OR (result->>'version')::integer <> 8
    OR (result->>'canStart')::boolean <> false
  THEN RAISE EXCEPTION 'PRODUCTION_M2_BASELINE_SELECT_FAILED: %', result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='DRAFT';
  result := public.wos_v1_m2_action(
    '33333333-3333-4333-8333-333333333333',
    8,
    '62222222-2222-4222-8222-222222222222',
    'BASELINE_OFFICE_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V1',
      'note','Office independently confirms the exact current proof set.',
      'baselineId',baseline
    )
  );
  IF result->>'status' <> 'APPLIED'
    OR (result->>'version')::integer <> 9
  THEN RAISE EXCEPTION 'PRODUCTION_M2_OFFICE_SIGN_FAILED: %', result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  result := public.wos_v1_m2_action(
    '33333333-3333-4333-8333-333333333333',
    9,
    '66666666-6666-4666-8666-666666666666',
    'BASELINE_WORKSHOP_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V1',
      'note','Workshop independently confirms the same immutable proof set.',
      'baselineId',baseline
    )
  );
  IF result->>'status' <> 'APPLIED'
    OR (result->>'version')::integer <> 10
  THEN RAISE EXCEPTION 'PRODUCTION_M2_WORKSHOP_SIGN_FAILED: %', result; END IF;
END $$;
RESET ROLE;

INSERT INTO public.wos_blockers(
  organization_id,entity_type,entity_id,blocker_code,blocker_category,
  description,status,opened_by_profile_id)
VALUES(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
  '33333333-3333-4333-8333-333333333333','WOS_FINAL_OPEN_BLOCKER','MATERIAL',
  'Synthetic open blocker must prevent final readiness.','OPEN',
  '20202020-2020-4020-8020-202020202020'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      10,
      '68888888-8888-4888-8888-888888888888',
      'FINAL_READINESS_CONFIRM',
      jsonb_build_object(
        'productionVersionLabel','V1',
        'note','Final readiness must fail while a blocker remains open.',
        'baselineId',baseline,
        'physicalCheckAttested',true,
        'filmArrivedAt',clock_timestamp()-interval '10 minutes',
        'fixtureArrivedAt',clock_timestamp()-interval '9 minutes',
        'incomingArrivedAt',clock_timestamp()-interval '8 minutes',
        'signedSampleArrivedAt',clock_timestamp()-interval '7 minutes',
        'quantityExpected',100,
        'quantityArrived',100
      )
    );
    RAISE EXCEPTION 'PRODUCTION_M2_FINAL_ALLOWED_WITH_OPEN_BLOCKER';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END $$;
RESET ROLE;

UPDATE public.wos_blockers
SET status='RESOLVED',resolved_by_profile_id='20202020-2020-4020-8020-202020202020',
    resolved_at=clock_timestamp()
WHERE entity_id='33333333-3333-4333-8333-333333333333'
  AND blocker_code='WOS_FINAL_OPEN_BLOCKER';

BEGIN;
UPDATE public.wos_visual_baselines
SET confirmed_by_office_profile_id='88888888-8888-4888-8888-888888888888'
WHERE entity_id='33333333-3333-4333-8333-333333333333'
  AND status='CURRENT';
SELECT set_config(
  'request.jwt.claim.sub',
  '80808080-8080-4080-8080-808080808080',
  false
);
SET ROLE authenticated;
DO $$
DECLARE baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      10,
      '68777777-7777-4777-8777-777777777777',
      'FINAL_READINESS_CONFIRM',
      jsonb_build_object(
        'productionVersionLabel','V1',
        'note','Office signer must not perform final readiness confirmation.',
        'baselineId',baseline,
        'physicalCheckAttested',true,
        'filmArrivedAt',clock_timestamp()-interval '10 minutes',
        'fixtureArrivedAt',clock_timestamp()-interval '9 minutes',
        'incomingArrivedAt',clock_timestamp()-interval '8 minutes',
        'signedSampleArrivedAt',clock_timestamp()-interval '7 minutes',
        'quantityExpected',100,
        'quantityArrived',100
      )
    );
    RAISE EXCEPTION 'PRODUCTION_M2_FINAL_ALLOWED_FOR_OFFICE_SIGNER';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    IF SQLERRM<>'FINAL_READINESS_OFFICE_SIGNER_FORBIDDEN' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      10,
      '68999999-9999-4999-8999-999999999999',
      'FINAL_READINESS_CONFIRM',
      jsonb_build_object(
        'productionVersionLabel','V1',
        'note','Insufficient arrival quantity must be rejected.',
        'baselineId',baseline,
        'physicalCheckAttested',true,
        'filmArrivedAt',clock_timestamp()-interval '10 minutes',
        'fixtureArrivedAt',clock_timestamp()-interval '9 minutes',
        'incomingArrivedAt',clock_timestamp()-interval '8 minutes',
        'signedSampleArrivedAt',clock_timestamp()-interval '7 minutes',
        'quantityExpected',200,
        'quantityArrived',100
      )
    );
    RAISE EXCEPTION 'PRODUCTION_M2_INSUFFICIENT_QUANTITY_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '30303030-3030-4030-8030-303030303030',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline uuid; payload jsonb;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  payload := jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Final atomic material confirmation for all four categories.',
    'baselineId',baseline,
    'physicalCheckAttested',true,
    'filmArrivedAt',clock_timestamp()-interval '10 minutes',
    'fixtureArrivedAt',clock_timestamp()-interval '9 minutes',
    'incomingArrivedAt',clock_timestamp()-interval '8 minutes',
    'signedSampleArrivedAt',clock_timestamp()-interval '7 minutes',
    'quantityExpected',100,
    'quantityArrived',110
  );
  result := public.wos_v1_m2_action(
    '33333333-3333-4333-8333-333333333333',
    10,
    '69999999-9999-4999-8999-999999999999',
    'FINAL_READINESS_CONFIRM',
    payload
  );
  IF result->>'status' <> 'APPLIED'
    OR (result->>'version')::integer <> 11
    OR result->>'workflowStatus' <> 'READINESS_CHECK'
    OR (result->>'canStart')::boolean <> false
  THEN RAISE EXCEPTION 'PRODUCTION_M2_FINAL_READINESS_FAILED: %', result; END IF;
  result := public.wos_v1_m2_action(
    '33333333-3333-4333-8333-333333333333',
    10,
    '69999999-9999-4999-8999-999999999999',
    'FINAL_READINESS_CONFIRM',
    payload
  );
  IF result->>'status' <> 'REPLAYED'
    OR (result->>'version')::integer <> 11
  THEN RAISE EXCEPTION 'PRODUCTION_M2_FINAL_REPLAY_FAILED: %', result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '80808080-8080-4080-8080-808080808080',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  result := public.wos_v1_authorize_production_start(
    '33333333-3333-4333-8333-333333333333',
    11,
    '6a111111-1111-4111-8111-111111111111',
    baseline,
    'Independent manager release after all evidence checks.'
  );
  IF result->>'status' <> 'AUTHORIZED'
    OR (result->>'version')::integer <> 12
    OR result->>'workflowStatus' <> 'READY_TO_START'
    OR (result->>'productionStarted')::boolean <> false
    OR (result->>'canStart')::boolean <> false
  THEN RAISE EXCEPTION 'PRODUCTION_START_RELEASE_FAILED: %', result; END IF;
  result := public.wos_v1_authorize_production_start(
    '33333333-3333-4333-8333-333333333333',
    11,
    '6a111111-1111-4111-8111-111111111111',
    baseline,
    'Independent manager release after all evidence checks.'
  );
  IF result->>'status' <> 'REPLAYED' THEN
    RAISE EXCEPTION 'PRODUCTION_START_RELEASE_REPLAY_FAILED: %', result;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  n integer;
  office uuid;
  workshop uuid;
  v_status text;
  v_version integer;
BEGIN
  IF (SELECT count(*) FROM public.wos_v1_m2_receipts) <> 4 THEN
    RAISE EXCEPTION 'PRODUCTION_M2_RECEIPT_COUNT_INVALID';
  END IF;
  IF (SELECT count(*) FROM public.wos_v1_start_releases) <> 1 THEN
    RAISE EXCEPTION 'PRODUCTION_START_RELEASE_COUNT_INVALID';
  END IF;
  SELECT workflow_status,version INTO v_status,v_version
  FROM public.wos_production_orders
  WHERE id='33333333-3333-4333-8333-333333333333';
  IF v_status <> 'READY_TO_START' OR v_version <> 12 THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_RELEASE_STATE_INVALID: %, %',
      v_status,v_version;
  END IF;
  SELECT confirmed_by_office_profile_id,confirmed_by_workshop_profile_id
  INTO office,workshop
  FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  IF office IS NULL OR workshop IS NULL OR office=workshop THEN
    RAISE EXCEPTION 'PRODUCTION_DUAL_SIGNOFF_INVALID';
  END IF;
  SELECT count(*) INTO n FROM public.wos_resource_readiness
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label='V1'
    AND confirmed_at IS NOT NULL
    AND resource_type IN (
      'FILM','FIXTURE','INCOMING_MATERIAL','SIGNED_SAMPLE'
    )
    AND status IN (
      'VERSION_VERIFIED','FIT_VERIFIED','QUANTITY_VERIFIED','VERIFIED'
    );
  IF n <> 4 THEN RAISE EXCEPTION 'PRODUCTION_FINAL_MATERIAL_COUNT_INVALID'; END IF;
END $$;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_v1_authorize_production_start(
      '33333333-3333-4333-8333-333333333333',
      12,
      '6a222222-2222-4222-8222-222222222222',
      (SELECT id FROM public.wos_visual_baselines
       WHERE entity_id='33333333-3333-4333-8333-333333333333'
         AND status='CURRENT'),
      'Operator must not override independent manager release.'
    );
    RAISE EXCEPTION 'PRODUCTION_START_ALLOWED_FOR_OPERATOR';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wos_confirmations
    WHERE entity_id='33333333-3333-4333-8333-333333333333'
      AND confirmation_type='START_RELEASE'
      AND decision='CONFIRMED'
      AND profile_id='88888888-8888-4888-8888-888888888888'
  ) THEN RAISE EXCEPTION 'PRODUCTION_START_CONFIRMATION_MISSING'; END IF;
END $$;

UPDATE public.wos_verified_image_proofs
SET expires_at=clock_timestamp()+interval '10 minutes'
WHERE image_id='41111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF (SELECT workflow_status FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>'READY_TO_START'
    OR (SELECT version FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>12
    OR NOT EXISTS (
      SELECT 1 FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND status='CURRENT'
        AND confirmed_by_office_profile_id IS NOT NULL
        AND confirmed_by_workshop_profile_id IS NOT NULL
        AND office_proof_set_digest=workshop_proof_set_digest
    )
  THEN RAISE EXCEPTION 'FRESHNESS_ONLY_CHANGE_INVALIDATED_SIGNOFF'; END IF;
END $$;

UPDATE public.wos_verified_image_proofs
SET verified_sha256=repeat('f',64)
WHERE image_id='41111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF (SELECT workflow_status FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>'WAITING_MATERIAL'
    OR (SELECT version FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>13
  THEN RAISE EXCEPTION 'PRODUCTION_PROOF_CHANGE_DID_NOT_INVALIDATE_RELEASE'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.wos_visual_baselines
    WHERE entity_id='33333333-3333-4333-8333-333333333333'
      AND status='CURRENT'
      AND (
        confirmed_by_office_profile_id IS NOT NULL
        OR confirmed_by_workshop_profile_id IS NOT NULL
        OR office_proof_set_digest IS NOT NULL
        OR workshop_proof_set_digest IS NOT NULL
      )
  ) THEN RAISE EXCEPTION 'PRODUCTION_PROOF_CHANGE_DID_NOT_CLEAR_SIGNOFF'; END IF;
END $$;

SELECT 'WOS_V1_PRODUCTION_M2_PG17=PASS';
