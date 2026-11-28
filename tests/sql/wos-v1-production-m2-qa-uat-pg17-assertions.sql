-- QA-only production-M2 wrapper assertions on a disposable PG17 database.

DO $grants$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  )
  THEN RAISE EXCEPTION 'QA_UAT_WRAPPER_ACL_INVALID'; END IF;
END
$grants$;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_v1_m2_action(
      '33333333-3333-4333-8333-333333333333',
      7,
      '71000000-0000-4000-8000-000000000000',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Direct core RPC must remain inaccessible.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'expectedAt',NULL,
        'arrivedAt',clock_timestamp()-interval '5 minutes',
        'quantityExpected',NULL,
        'quantityArrived',NULL,
        'physicalCheckAttested',true
      )
    );
    RAISE EXCEPTION 'QA_UAT_DIRECT_PRODUCTION_RPC_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
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
BEGIN
  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
      '33333333-3333-4333-8333-333333333333',
      7,
      '71000000-0000-4000-8000-000000000001',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Office gate must not permit Workshop actions.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'expectedAt',NULL,
        'arrivedAt',clock_timestamp()-interval '5 minutes',
        'quantityExpected',NULL,
        'quantityArrived',NULL,
        'physicalCheckAttested',true
      )
    );
    RAISE EXCEPTION 'QA_UAT_ACTION_SCOPE_ESCAPED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'QA_UAT_M2_GATE_CLOSED' THEN RAISE; END IF;
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
BEGIN
  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      'WOS-V1-STALE-AUTHORIZATION',
      '33333333-3333-4333-8333-333333333333',
      7,
      '71000000-0000-4000-8000-000000000004',
      'BASELINE_SELECT',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Stale authorization ID must never reuse an old gate.',
        'imageIds',jsonb_build_array(
          '41111111-1111-4111-8111-111111111111',
          '42222222-2222-4222-8222-222222222222',
          '43333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444'
        )
      )
    );
    RAISE EXCEPTION 'QA_UAT_STALE_AUTHORIZATION_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'QA_UAT_AUTHORIZATION_ID_MISMATCH' THEN RAISE; END IF;
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
BEGIN
  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
      '33333333-3333-4333-8333-333333333333',
      7,
      '71000000-0000-4000-8000-000000000002',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Expired gate must fail closed.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'expectedAt',NULL,
        'arrivedAt',clock_timestamp()-interval '5 minutes',
        'quantityExpected',NULL,
        'quantityArrived',NULL,
        'physicalCheckAttested',true
      )
    );
    RAISE EXCEPTION 'QA_UAT_EXPIRED_GATE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'QA_UAT_M2_GATE_CLOSED' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '50505050-5050-4050-8050-505050505050',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
      '33333333-3333-4333-8333-333333333333',
      7,
      '71000000-0000-4000-8000-000000000003',
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Cross-organization caller must be denied.',
        'resourceType','FILM',
        'resourceStatus','ARRIVED',
        'expectedAt',NULL,
        'arrivedAt',clock_timestamp()-interval '5 minutes',
        'quantityExpected',NULL,
        'quantityArrived',NULL,
        'physicalCheckAttested',true
      )
    );
    RAISE EXCEPTION 'QA_UAT_CROSS_ORG_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE
  resources text[]:=ARRAY['FILM','FIXTURE','INCOMING_MATERIAL','SIGNED_SAMPLE'];
  statuses text[]:=ARRAY['ARRIVED','ARRIVED','ARRIVED','PHYSICAL_SAMPLE_RECEIVED'];
  request_ids text[]:=ARRAY[
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000004'
  ];
  result jsonb;
  expected_version integer:=7;
  index integer;
BEGIN
  FOR index IN 1..4 LOOP
    result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
      '33333333-3333-4333-8333-333333333333',
      expected_version,
      request_ids[index]::uuid,
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','QA UAT records nonfinal material readiness.',
        'resourceType',resources[index],
        'resourceStatus',statuses[index],
        'expectedAt',NULL,
        'arrivedAt',clock_timestamp()-interval '5 minutes',
        'quantityExpected',
          CASE WHEN resources[index]='INCOMING_MATERIAL' THEN 100 ELSE NULL END,
        'quantityArrived',
          CASE WHEN resources[index]='INCOMING_MATERIAL' THEN 100 ELSE NULL END,
        'physicalCheckAttested',true
      )
    );
    IF result->>'status'<>'APPLIED'
      OR (result->>'version')::integer<>expected_version+1
      OR (result->>'canStart')::boolean<>false
    THEN RAISE EXCEPTION 'QA_UAT_MATERIAL_RECORD_FAILED: %',result; END IF;
    expected_version:=expected_version+1;
  END LOOP;
  IF expected_version<>11 THEN
    RAISE EXCEPTION 'QA_UAT_MATERIAL_VERSION_INVALID';
  END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; image_ids jsonb;
BEGIN
  SELECT jsonb_agg(id::text ORDER BY category) INTO image_ids
  FROM public.wos_reference_images
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label='V2' AND image_status='READY';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    11,
    '73000000-0000-4000-8000-000000000001',
    'BASELINE_SELECT',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT Office selects the exact four-image Baseline.',
      'imageIds',image_ids
    )
  );
  IF result->>'status'<>'APPLIED'
    OR (result->>'version')::integer<>12
    OR result->'baselineId' IS NULL
  THEN RAISE EXCEPTION 'QA_UAT_BASELINE_SELECT_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='DRAFT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    12,
    '73000000-0000-4000-8000-000000000002',
    'BASELINE_OFFICE_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT Office signs the current Proof set.',
      'baselineId',baseline_id
    )
  );
  IF result->>'status'<>'APPLIED' OR (result->>'version')::integer<>13
  THEN RAISE EXCEPTION 'QA_UAT_OFFICE_SIGN_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    13,
    '73000000-0000-4000-8000-000000000003',
    'BASELINE_WORKSHOP_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT Workshop signs the same current Proof set.',
      'baselineId',baseline_id
    )
  );
  IF result->>'status'<>'APPLIED' OR (result->>'version')::integer<>14
  THEN RAISE EXCEPTION 'QA_UAT_WORKSHOP_SIGN_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    14,
    '73000000-0000-4000-8000-000000000004',
    'FINAL_READINESS_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT final material transaction for all four categories.',
      'baselineId',baseline_id,
      'physicalCheckAttested',true,
      'filmArrivedAt',clock_timestamp()-interval '6 minutes',
      'fixtureArrivedAt',clock_timestamp()-interval '5 minutes',
      'incomingArrivedAt',clock_timestamp()-interval '4 minutes',
      'signedSampleArrivedAt',clock_timestamp()-interval '3 minutes',
      'quantityExpected',100,
      'quantityArrived',100
    )
  );
  IF result->>'status'<>'APPLIED'
    OR (result->>'version')::integer<>15
    OR result->>'workflowStatus'<>'READINESS_CHECK'
    OR (result->>'canStart')::boolean<>false
  THEN RAISE EXCEPTION 'QA_UAT_FINAL_READINESS_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('wos.qa_uat.manager_auth_user'),
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_authorize_production_start(
    'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    15,
    '74000000-0000-4000-8000-000000000001',
    baseline_id,
    'QA UAT independent manager authorizes scheduling only.'
  );
  IF result->>'status'<>'AUTHORIZED'
    OR (result->>'version')::integer<>16
    OR result->>'workflowStatus'<>'READY_TO_START'
    OR (result->>'productionStarted')::boolean<>false
    OR (result->>'canStart')::boolean<>false
  THEN RAISE EXCEPTION 'QA_UAT_START_RELEASE_FAILED: %',result; END IF;
  result:=public.wos_v1_qa_uat_authorize_production_start(
    'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    15,
    '74000000-0000-4000-8000-000000000001',
    baseline_id,
    'QA UAT independent manager authorizes scheduling only.'
  );
  IF result->>'status'<>'REPLAYED' OR (result->>'version')::integer<>16
  THEN RAISE EXCEPTION 'QA_UAT_START_RELEASE_REPLAY_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config('wos.v1.actor_user_id',
  '10101010-1010-4010-8010-101010101010',false);
UPDATE public.wos_reference_images
SET image_status='SUPERSEDED',superseded_at=clock_timestamp()
WHERE id='41111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF (SELECT workflow_status FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>'WAITING_MATERIAL'
    OR (SELECT version FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>17
    OR EXISTS(
      SELECT 1 FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND status='CURRENT'
        AND (confirmed_by_office_profile_id IS NOT NULL
          OR confirmed_by_workshop_profile_id IS NOT NULL
          OR office_proof_set_digest IS NOT NULL
          OR workshop_proof_set_digest IS NOT NULL)
    )
  THEN RAISE EXCEPTION 'QA_UAT_IMAGE_CHANGE_DID_NOT_INVALIDATE'; END IF;
END $$;

UPDATE public.wos_reference_images
SET image_status='READY',superseded_at=NULL
WHERE id='41111111-1111-4111-8111-111111111111';

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; image_ids jsonb;
BEGIN
  SELECT jsonb_agg(id::text ORDER BY category) INTO image_ids
  FROM public.wos_reference_images
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label='V2' AND image_status='READY';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    17,
    '75000000-0000-4000-8000-000000000001',
    'BASELINE_SELECT',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT reselects the restored current image set.',
      'imageIds',image_ids
    )
  );
  IF result->>'status'<>'APPLIED' OR (result->>'version')::integer<>18
  THEN RAISE EXCEPTION 'QA_UAT_RESELECT_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='DRAFT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    18,
    '75000000-0000-4000-8000-000000000002',
    'BASELINE_OFFICE_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT Office re-signs after image restoration.',
      'baselineId',baseline_id
    )
  );
  IF result->>'status'<>'APPLIED' OR (result->>'version')::integer<>19
  THEN RAISE EXCEPTION 'QA_UAT_REOFFICE_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    19,
    '75000000-0000-4000-8000-000000000003',
    'BASELINE_WORKSHOP_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT Workshop re-signs after image restoration.',
      'baselineId',baseline_id
    )
  );
  IF result->>'status'<>'APPLIED' OR (result->>'version')::integer<>20
  THEN RAISE EXCEPTION 'QA_UAT_REWORKSHOP_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_m2_action(
      'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    20,
    '75000000-0000-4000-8000-000000000004',
    'FINAL_READINESS_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','QA UAT final material retry after image restoration.',
      'baselineId',baseline_id,
      'physicalCheckAttested',true,
      'filmArrivedAt',clock_timestamp()-interval '6 minutes',
      'fixtureArrivedAt',clock_timestamp()-interval '5 minutes',
      'incomingArrivedAt',clock_timestamp()-interval '4 minutes',
      'signedSampleArrivedAt',clock_timestamp()-interval '3 minutes',
      'quantityExpected',100,
      'quantityArrived',100
    )
  );
  IF result->>'status'<>'APPLIED' OR (result->>'version')::integer<>21
  THEN RAISE EXCEPTION 'QA_UAT_REFINAL_FAILED: %',result; END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('wos.qa_uat.manager_auth_user'),
  false
);
SET ROLE authenticated;
DO $$
DECLARE result jsonb; baseline_id uuid;
BEGIN
  SELECT id INTO baseline_id FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND version_label='V2';
  result:=public.wos_v1_qa_uat_authorize_production_start(
    'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    '33333333-3333-4333-8333-333333333333',
    21,
    '75000000-0000-4000-8000-000000000005',
    baseline_id,
    'QA UAT independent manager reauthorizes scheduling only.'
  );
  IF result->>'status'<>'AUTHORIZED'
    OR (result->>'version')::integer<>22
    OR (result->>'productionStarted')::boolean<>false
    OR (result->>'canStart')::boolean<>false
  THEN RAISE EXCEPTION 'QA_UAT_RERELEASE_FAILED: %',result; END IF;
END $$;
RESET ROLE;

UPDATE public.wos_verified_image_proofs
SET expires_at=clock_timestamp()+interval '10 minutes'
WHERE image_id='41111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF (SELECT workflow_status FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>'WAITING_MATERIAL'
    OR (SELECT version FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>23
    OR EXISTS(
      SELECT 1 FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND status='CURRENT'
        AND (confirmed_by_office_profile_id IS NOT NULL
          OR confirmed_by_workshop_profile_id IS NOT NULL
          OR office_proof_set_digest IS NOT NULL
          OR workshop_proof_set_digest IS NOT NULL)
    )
  THEN RAISE EXCEPTION 'QA_UAT_PROOF_CHANGE_DID_NOT_INVALIDATE'; END IF;
  IF (SELECT count(*) FROM public.wos_v1_m2_receipts)=12
    AND (SELECT count(*) FROM public.wos_v1_start_releases)=2
    AND (SELECT count(*) FROM wos_v1_qa_uat.write_gates
      WHERE last_used_at IS NOT NULL)>=3
  THEN NULL;
  ELSE RAISE EXCEPTION 'QA_UAT_RECEIPT_OR_GATE_AUDIT_INVALID'; END IF;
END $$;

SELECT 'WOS_V1_PRODUCTION_M2_QA_UAT_ASSERTIONS=PASS';
