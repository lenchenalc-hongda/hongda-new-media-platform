-- Ephemeral PostgreSQL 17 assertions only. No QA or Production connection.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled=true) THEN
    RAISE EXCEPTION 'M2_GATE_MUST_DEFAULT_OFF';
  END IF;
  IF has_function_privilege('authenticated',
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'M2_RPC_MUST_NOT_BE_GRANTED';
  END IF;
END $$;

-- Synthetic-only privilege and gate activation after verifying fail-closed install.
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  TO authenticated;
UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_M2_PG17_ONLY',
    allowed_order_id='33333333-3333-4333-8333-333333333333',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

-- Office selects the exact four-category proof set.
SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_qa_p2_m2_action(
    '33333333-3333-4333-8333-333333333333',7,
    '61111111-1111-4111-8111-111111111111','BASELINE_SELECT',
    jsonb_build_object(
      'productionVersionLabel','V1',
      'note','Office selected exact four-category private image proof set.',
      'imageIds',jsonb_build_array(
        '41111111-1111-4111-8111-111111111111',
        '42222222-2222-4222-8222-222222222222',
        '43333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444'
      )
    )
  );
  IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>8
    OR r->>'proofStatus'<>'UNVERIFIED' OR (r->>'canStart')::boolean<>false
  THEN RAISE EXCEPTION 'M2_BASELINE_SELECT_FAILED: %',r; END IF;
END $$;
RESET ROLE;

-- Office signs the baseline.
SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
DO $$
DECLARE r jsonb; baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='DRAFT';
  r:=public.wos_qa_p2_m2_action(
    '33333333-3333-4333-8333-333333333333',8,
    '62222222-2222-4222-8222-222222222222','BASELINE_OFFICE_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V1',
      'note','Office independently confirms current image baseline.',
      'baselineId',baseline
    )
  );
  IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>9
  THEN RAISE EXCEPTION 'M2_OFFICE_CONFIRM_FAILED: %',r; END IF;
END $$;
RESET ROLE;

-- Workshop independently signs the exact same proof set.
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE r jsonb; baseline uuid;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  r:=public.wos_qa_p2_m2_action(
    '33333333-3333-4333-8333-333333333333',9,
    '66666666-6666-4666-8666-666666666666','BASELINE_WORKSHOP_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V1',
      'note','Workshop independently confirms same immutable proof set.',
      'baselineId',baseline
    )
  );
  IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>10
  THEN RAISE EXCEPTION 'M2_WORKSHOP_CONFIRM_FAILED: %',r; END IF;
END $$;
RESET ROLE;

-- Individual final material writes are permanently retired once M2 exists.
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_m2_action(
      '33333333-3333-4333-8333-333333333333',10,
      '67777777-7777-4777-8777-777777777777','MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V1',
        'note','Single material finalization must be rejected by M2.',
        'resourceType','FILM','resourceStatus','VERSION_VERIFIED',
        'arrivedAt',clock_timestamp(),'physicalCheckAttested',true
      )
    );
    RAISE EXCEPTION 'M2_SINGLE_FINAL_MATERIAL_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END $$;
RESET ROLE;

-- An open blocker must stop the one final transaction before any material row
-- or order version is committed.
INSERT INTO public.wos_blockers(
  organization_id,entity_type,entity_id,blocker_code,blocker_category,
  description,status,opened_by_profile_id)
VALUES(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
  '33333333-3333-4333-8333-333333333333','QA_FINAL_OPEN_BLOCKER','QA',
  'Synthetic open blocker for final readiness atomic rejection.','OPEN',
  '20202020-2020-4020-8020-202020202020');
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE baseline uuid; payload jsonb;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  payload:=jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Final readiness must reject while any blocker remains open.',
    'baselineId',baseline,'physicalCheckAttested',true,
    'filmArrivedAt',clock_timestamp()-interval '10 minutes',
    'fixtureArrivedAt',clock_timestamp()-interval '9 minutes',
    'incomingArrivedAt',clock_timestamp()-interval '8 minutes',
    'signedSampleArrivedAt',clock_timestamp()-interval '7 minutes',
    'quantityExpected',100,'quantityArrived',110);
  BEGIN
    PERFORM public.wos_qa_p2_m2_action(
      '33333333-3333-4333-8333-333333333333',10,
      '68888888-8888-4888-8888-888888888888','FINAL_READINESS_CONFIRM',
      payload);
    RAISE EXCEPTION 'M2_FINAL_ALLOWED_WITH_OPEN_BLOCKER';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE public.wos_blockers SET status='RESOLVED'
WHERE entity_id='33333333-3333-4333-8333-333333333333'
  AND blocker_code='QA_FINAL_OPEN_BLOCKER';

-- One atomic final readiness transaction writes all four final material rows,
-- increments the order version once, and never starts production.
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
DECLARE r jsonb; baseline uuid; payload jsonb;
BEGIN
  SELECT id INTO baseline FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT';
  payload:=jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Operator confirms all four physical materials together.',
    'baselineId',baseline,'physicalCheckAttested',true,
    'filmArrivedAt',clock_timestamp()-interval '10 minutes',
    'fixtureArrivedAt',clock_timestamp()-interval '9 minutes',
    'incomingArrivedAt',clock_timestamp()-interval '8 minutes',
    'signedSampleArrivedAt',clock_timestamp()-interval '7 minutes',
    'quantityExpected',100,'quantityArrived',110);
  r:=public.wos_qa_p2_m2_action(
    '33333333-3333-4333-8333-333333333333',10,
    '69999999-9999-4999-8999-999999999999','FINAL_READINESS_CONFIRM',
    payload);
  IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>11
    OR r->>'workflowStatus'<>'READINESS_CHECK'
    OR (r->>'canStart')::boolean<>false
  THEN RAISE EXCEPTION 'M2_FINAL_READINESS_FAILED: %',r; END IF;
  r:=public.wos_qa_p2_m2_action(
    '33333333-3333-4333-8333-333333333333',10,
    '69999999-9999-4999-8999-999999999999','FINAL_READINESS_CONFIRM',
    payload);
  IF r->>'status'<>'REPLAYED' OR (r->>'version')::integer<>11
  THEN RAISE EXCEPTION 'M2_FINAL_REPLAY_FAILED: %',r; END IF;
END $$;
RESET ROLE;

-- The legacy P2 RPC must not bypass canonical proof-set, double signoff or CAS.
UPDATE public.wos_qa_p2_execution_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_LEGACY_BYPASS_PG17_ONLY',
    allowed_order_id='33333333-3333-4333-8333-333333333333',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_operator_action(
      '33333333-3333-4333-8333-333333333333',11,
      '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a',
      'CONFIRM_MATERIAL','FILM','VERSION_VERIFIED',NULL,NULL,
      'legacy final material bypass must be rejected under M2');
    RAISE EXCEPTION 'M2_LEGACY_FINAL_MATERIAL_BYPASS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE n integer; b public.wos_visual_baselines%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM public.wos_status_history
      WHERE entity_id='33333333-3333-4333-8333-333333333333')<>4 THEN
    RAISE EXCEPTION 'M2_STATUS_HISTORY_COUNT_INVALID';
  END IF;
  IF (SELECT count(*) FROM public.wos_qa_p2_m2_receipts)<>4 THEN
    RAISE EXCEPTION 'M2_RECEIPT_COUNT_INVALID';
  END IF;
  IF (SELECT count(*) FROM public.wos_qa_p2_action_receipts)<>0 THEN
    RAISE EXCEPTION 'M2_LEGACY_BYPASS_CREATED_RECEIPT';
  END IF;
  IF (SELECT workflow_status FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>'READINESS_CHECK' THEN
    RAISE EXCEPTION 'M2_FINAL_STATUS_NOT_PERSISTED';
  END IF;
  IF (SELECT version FROM public.wos_production_orders
      WHERE id='33333333-3333-4333-8333-333333333333')<>11 THEN
    RAISE EXCEPTION 'M2_FINAL_VERSION_NOT_PERSISTED';
  END IF;
  SELECT count(*) INTO n FROM public.wos_resource_readiness
  WHERE organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND entity_id='33333333-3333-4333-8333-333333333333'
    AND version_label='V1'
    AND confirmed_by_profile_id='22222222-2222-4222-8222-222222222222'
    AND (
      (resource_type='FILM' AND status='VERSION_VERIFIED')
      OR (resource_type='FIXTURE' AND status='FIT_VERIFIED')
      OR (resource_type='INCOMING_MATERIAL' AND status='QUANTITY_VERIFIED'
        AND quantity_expected=100 AND quantity_arrived=110)
      OR (resource_type='SIGNED_SAMPLE' AND status='VERIFIED')
    );
  IF n<>4 THEN RAISE EXCEPTION 'M2_FOUR_FINAL_MATERIALS_NOT_PERSISTED: %',n; END IF;
  SELECT * INTO b FROM public.wos_visual_baselines
  WHERE entity_id='33333333-3333-4333-8333-333333333333'
    AND status='CURRENT' AND superseded_at IS NULL;
  IF b.confirmed_by_office_profile_id IS NULL
    OR b.confirmed_by_workshop_profile_id IS NULL
    OR b.confirmed_by_office_profile_id=b.confirmed_by_workshop_profile_id
    OR b.office_proof_set_digest IS NULL
    OR b.office_proof_set_digest IS DISTINCT FROM b.workshop_proof_set_digest
    OR b.office_post_order_version+1<>b.workshop_post_order_version
    OR b.workshop_post_order_version<>10
  THEN RAISE EXCEPTION 'M2_CURRENT_DOUBLE_SIGNOFF_INVALID'; END IF;
END $$;

UPDATE public.wos_qa_p2_m2_gate
SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,allowed_organization_id=NULL,updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');
UPDATE public.wos_qa_p2_execution_gate
SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,allowed_organization_id=NULL,updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';

SELECT 'WOS_P2_M2_PG17_DOUBLE_SIGN_AND_ATOMIC_FINAL=PASS' AS evidence;
SELECT 'WOS_P2_M2_PG17_ONE_ORDER_ATOMIC_FINAL_READINESS=PASS' AS evidence;
SELECT 'WOS_P2_M2_PG17_LEGACY_FINAL_MATERIAL_BYPASS=DENIED' AS evidence;
SELECT 'WOS_P2_M2_PG17_GATES_REVOKED_AFTER_TEST=PASS' AS evidence;
