-- Continue the same V2 order produced by the RC02 PG17 flow through the
-- complete formal M2 transaction chain.

BEGIN;

SELECT set_config(
  'wos.uat.authorization_id',
  :'authorization_id',
  false
);
SELECT set_config('wos.uat.execution_id', :'execution_id', false);
SELECT set_config('wos.uat.arm_token', :'arm_token', false);
SELECT set_config('wos.uat.process_nonce', :'process_nonce', false);
SELECT set_config('wos.uat.code_sha256', :'code_sha256', false);
SELECT set_config(
  'wos.uat.manager_profile',
  :'manager_profile',
  false
);

DO $seed$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_receipt public.wos_order_create_receipts%ROWTYPE;
  v_office public.profiles%ROWTYPE;
  v_operator public.profiles%ROWTYPE;
  v_manager public.profiles%ROWTYPE;
  v_opened_at timestamptz := clock_timestamp();
  v_authorization_id text :=
    current_setting('wos.uat.authorization_id');
  v_execution_id uuid :=
    current_setting('wos.uat.execution_id')::uuid;
  v_arm_token uuid := current_setting('wos.uat.arm_token')::uuid;
  v_process_nonce uuid :=
    current_setting('wos.uat.process_nonce')::uuid;
  v_code_sha256 text := current_setting('wos.uat.code_sha256');
  v_manager_profile uuid :=
    current_setting('wos.uat.manager_profile')::uuid;
BEGIN
  SELECT order_row.* INTO v_order
  FROM public.wos_production_orders order_row
  WHERE order_row.version_label = 'V2'
    AND order_row.workflow_status = 'WAITING_MATERIAL';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UAT006_CONTINUITY_ORDER_MISSING';
  END IF;
  SELECT receipt.* INTO v_receipt
  FROM public.wos_order_create_receipts receipt
  WHERE receipt.order_id = v_order.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UAT006_CONTINUITY_RECEIPT_MISSING';
  END IF;
  SELECT profile.* INTO v_office
  FROM public.profiles profile
  WHERE profile.id = v_receipt.actor_profile_id
    AND profile.org_id = v_order.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UAT006_CONTINUITY_OFFICE_MISSING';
  END IF;
  SELECT profile.* INTO v_operator
  FROM public.profiles profile
  WHERE profile.org_id = v_order.organization_id
    AND profile.role = 'operator'
    AND profile.is_active = true
  ORDER BY profile.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UAT006_CONTINUITY_OPERATOR_MISSING';
  END IF;
  SELECT profile.* INTO v_manager
  FROM public.profiles profile
  WHERE profile.id = v_manager_profile
    AND profile.org_id = v_order.organization_id
    AND profile.role = 'manager'
    AND profile.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UAT006_CONTINUITY_MANAGER_MISSING';
  END IF;
  UPDATE public.wos_production_orders
  SET order_number = 'QA-NONPROD-' || v_receipt.request_id::text,
      created_by_profile_id = v_office.id,
      sales_owner_profile_id = v_office.id,
      customer_id = COALESCE(
        customer_id,
        'c1111111-1111-4111-8111-111111111111'::uuid
      ),
      project_id = COALESCE(
        project_id,
        'd1111111-1111-4111-8111-111111111111'::uuid
      )
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_reference_images image
    WHERE image.entity_id = v_order.id
      AND image.version_label = 'V2'
      AND image.image_status = 'READY'
      AND image.superseded_at IS NULL
    GROUP BY image.entity_id
    HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'UAT006_RC02_V2_IMAGE_SET_REQUIRED';
  END IF;
  INSERT INTO wos_v1_qa_uat.closeout_controls(
    execution_id,
    authorization_id,
    project_ref,
    code_sha256,
    arm_token,
    opened_at,
    write_deadline_at,
    db_cleanup_deadline_at,
    edge_cleanup_deadline_at,
    authorized_order_id,
    authorized_organization_id,
    authorized_create_request_id,
    authorized_actor_profile_id,
    authorized_payload_fingerprint,
    authorized_order_number,
    authorized_customer_id,
    authorized_project_id,
    db_last_heartbeat_at,
    edge_last_heartbeat_at,
    edge_process_nonce
  ) VALUES(
    v_execution_id,
    v_authorization_id,
    'xulmpqaknlwqqculbsek',
    v_code_sha256,
    v_arm_token,
    v_opened_at,
    v_opened_at + interval '480 seconds',
    v_opened_at + interval '540 seconds',
    v_opened_at + interval '840 seconds',
    v_order.id,
    v_order.organization_id,
    v_receipt.request_id,
    v_office.id,
    v_receipt.payload_fingerprint,
    v_order.order_number,
    v_order.customer_id,
    v_order.project_id,
    v_opened_at,
    v_opened_at,
    v_process_nonce
  );
  INSERT INTO wos_v1_qa_uat.closer_arm_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    arm_token,executor_kind,write_deadline_at,cleanup_deadline_at,heartbeat_at
  ) VALUES
    (
      v_execution_id, 'DB', v_authorization_id,
      'xulmpqaknlwqqculbsek', v_code_sha256, v_arm_token,
      'PG_CRON', v_opened_at + interval '480 seconds',
      v_opened_at + interval '540 seconds', v_opened_at
    ),
    (
      v_execution_id, 'EDGE', v_authorization_id,
      'xulmpqaknlwqqculbsek', v_code_sha256, v_arm_token,
      'LAUNCHD', v_opened_at + interval '480 seconds',
      v_opened_at + interval '840 seconds', v_opened_at
    );
  PERFORM public.wos_v1_qa_uat_bind_order(
    v_execution_id,
    v_receipt.request_id,
    v_order.id,
    v_order.organization_id,
    v_office.id,
    v_receipt.payload_fingerprint
  );
  PERFORM set_config('wos_v1.qa_uat_gate_open_authorized','yes',true);
  PERFORM set_config('wos_v1.qa_project','xulmpqaknlwqqculbsek',true);
  PERFORM public.wos_v1_qa_uat_open_gate(
    v_authorization_id,
    v_order.id,
    v_order.organization_id,
    v_office.id,
    ARRAY['BASELINE_SELECT','BASELINE_OFFICE_CONFIRM'],
    v_opened_at + interval '480 seconds'
  );
  PERFORM public.wos_v1_qa_uat_open_gate(
    v_authorization_id,
    v_order.id,
    v_order.organization_id,
    v_operator.id,
    ARRAY[
      'MATERIAL_RECORD',
      'BASELINE_WORKSHOP_CONFIRM',
      'FINAL_READINESS_CONFIRM'
    ],
    v_opened_at + interval '480 seconds'
  );
  PERFORM public.wos_v1_qa_uat_open_gate(
    v_authorization_id,
    v_order.id,
    v_order.organization_id,
    v_manager.id,
    ARRAY['START_RELEASE'],
    v_opened_at + interval '480 seconds'
  );
  PERFORM set_config('wos.uat.order_id',v_order.id::text,false);
END;
$seed$;

DO $flow$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_office public.profiles%ROWTYPE;
  v_operator public.profiles%ROWTYPE;
  v_manager public.profiles%ROWTYPE;
  v_result jsonb;
  v_baseline_id uuid;
  v_version integer;
  v_now timestamptz := clock_timestamp();
  v_image_ids jsonb;
  v_resources text[] := ARRAY[
    'FILM','FIXTURE','INCOMING_MATERIAL','SIGNED_SAMPLE'
  ];
  v_statuses text[] := ARRAY[
    'ARRIVED','ARRIVED','ARRIVED','PHYSICAL_SAMPLE_RECEIVED'
  ];
  v_index integer;
  v_authorization_id text :=
    current_setting('wos.uat.authorization_id');
  v_manager_profile uuid :=
    current_setting('wos.uat.manager_profile')::uuid;
BEGIN
  SELECT order_row.* INTO STRICT v_order
  FROM public.wos_production_orders order_row
  WHERE order_row.version_label = 'V2'
    AND order_row.workflow_status = 'WAITING_MATERIAL';
  SELECT profile.* INTO STRICT v_office
  FROM public.profiles profile
  JOIN public.wos_order_create_receipts receipt
    ON receipt.actor_profile_id = profile.id
    AND receipt.order_id = v_order.id
  WHERE profile.is_active = true;
  SELECT profile.* INTO STRICT v_operator
  FROM public.profiles profile
  WHERE profile.org_id = v_order.organization_id
    AND profile.role = 'operator'
    AND profile.is_active = true
  ORDER BY profile.id
  LIMIT 1;
  SELECT profile.* INTO STRICT v_manager
  FROM public.profiles profile
  WHERE profile.id = v_manager_profile;
  v_version := v_order.version;

  PERFORM set_config('request.jwt.claim.sub',v_operator.user_id::text,true);
  FOR v_index IN 1..4 LOOP
    v_result := public.wos_v1_qa_uat_m2_action(
      v_authorization_id,
      v_order.id,
      v_version,
      (
        'a6100000-0000-4000-8000-00000000000'
        || v_index
      )::uuid,
      'MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','UAT-006 continuity material record.',
        'resourceType',v_resources[v_index],
        'resourceStatus',v_statuses[v_index],
        'arrivedAt',v_now - interval '5 minutes',
        'quantityExpected',
          CASE WHEN v_resources[v_index]='INCOMING_MATERIAL'
            THEN 1000 ELSE NULL END,
        'quantityArrived',
          CASE WHEN v_resources[v_index]='INCOMING_MATERIAL'
            THEN 1000 ELSE NULL END,
        'physicalCheckAttested',true
      )
    );
    IF v_result->>'status' <> 'APPLIED' THEN
      RAISE EXCEPTION 'UAT006_CONTINUITY_MATERIAL_FAILED: %',v_result;
    END IF;
    v_version := v_version + 1;
  END LOOP;

  SELECT jsonb_agg(image.id::text ORDER BY image.category)
  INTO v_image_ids
  FROM public.wos_reference_images image
  WHERE image.entity_id = v_order.id
    AND image.version_label = 'V2'
    AND image.image_status = 'READY'
    AND image.superseded_at IS NULL;

  PERFORM set_config('request.jwt.claim.sub',v_office.user_id::text,true);
  v_result := public.wos_v1_qa_uat_m2_action(
    v_authorization_id,v_order.id,v_version,
    'a6200000-0000-4000-8000-000000000001',
    'BASELINE_SELECT',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','UAT-006 selects the retained V2 image baseline.',
      'imageIds',v_image_ids
    )
  );
  v_baseline_id := (v_result->>'baselineId')::uuid;
  v_version := v_version + 1;
  PERFORM public.wos_v1_qa_uat_m2_action(
    v_authorization_id,v_order.id,v_version,
    'a6200000-0000-4000-8000-000000000002',
    'BASELINE_OFFICE_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','UAT-006 Office signs the retained V2 baseline.',
      'baselineId',v_baseline_id
    )
  );
  v_version := v_version + 1;

  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      v_authorization_id,v_order.id,v_version,
      'a6200000-0000-4000-8000-000000000003',
      'BASELINE_WORKSHOP_CONFIRM',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Office must not sign as Workshop.',
        'baselineId',v_baseline_id
      )
    );
    RAISE EXCEPTION 'UAT006_DUPLICATE_SIGNER_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub',v_operator.user_id::text,true);
  PERFORM public.wos_v1_qa_uat_m2_action(
    v_authorization_id,v_order.id,v_version,
    'a6200000-0000-4000-8000-000000000004',
    'BASELINE_WORKSHOP_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','UAT-006 Operator signs the same V2 baseline.',
      'baselineId',v_baseline_id
    )
  );
  v_version := v_version + 1;

  BEGIN
    PERFORM public.wos_v1_qa_uat_m2_action(
      v_authorization_id,v_order.id,v_version,
      'a6200000-0000-4000-8000-000000000005',
      'FINAL_READINESS_CONFIRM',
      jsonb_build_object(
        'productionVersionLabel','V2',
        'note','Wrong quantity must not become ready.',
        'baselineId',v_baseline_id,
        'physicalCheckAttested',true,
        'filmArrivedAt',v_now,
        'fixtureArrivedAt',v_now,
        'incomingArrivedAt',v_now,
        'signedSampleArrivedAt',v_now,
        'quantityExpected',1000,
        'quantityArrived',999
      )
    );
    RAISE EXCEPTION 'UAT006_WRONG_QUANTITY_ALLOWED';
  EXCEPTION WHEN SQLSTATE 'PT409' OR SQLSTATE '22023' THEN
    NULL;
  END;

  v_result := public.wos_v1_qa_uat_m2_action(
    v_authorization_id,v_order.id,v_version,
    'a6200000-0000-4000-8000-000000000006',
    'FINAL_READINESS_CONFIRM',
    jsonb_build_object(
      'productionVersionLabel','V2',
      'note','UAT-006 completes the four-material readiness transaction.',
      'baselineId',v_baseline_id,
      'physicalCheckAttested',true,
      'filmArrivedAt',v_now,
      'fixtureArrivedAt',v_now,
      'incomingArrivedAt',v_now,
      'signedSampleArrivedAt',v_now,
      'quantityExpected',1000,
      'quantityArrived',1000
    )
  );
  IF v_result->>'workflowStatus' <> 'READINESS_CHECK' THEN
    RAISE EXCEPTION 'UAT006_READINESS_FAILED: %',v_result;
  END IF;
  v_version := v_version + 1;

  PERFORM set_config('request.jwt.claim.sub',v_manager.user_id::text,true);
  v_result := public.wos_v1_qa_uat_authorize_production_start(
    v_authorization_id,v_order.id,v_version,
    'a6300000-0000-4000-8000-000000000001',
    v_baseline_id,
    'UAT-006 independent Manager authorizes manual start only.'
  );
  IF v_result->>'workflowStatus' <> 'READY_TO_START'
    OR (v_result->>'productionStarted')::boolean <> false
    OR (v_result->>'canStart')::boolean <> false
  THEN
    RAISE EXCEPTION 'UAT006_RELEASE_FAILED: %',v_result;
  END IF;
  v_result := public.wos_v1_qa_uat_authorize_production_start(
    v_authorization_id,v_order.id,v_version,
    'a6300000-0000-4000-8000-000000000001',
    v_baseline_id,
    'UAT-006 independent Manager authorizes manual start only.'
  );
  IF v_result->>'status' <> 'REPLAYED' THEN
    RAISE EXCEPTION 'UAT006_RELEASE_REPLAY_FAILED: %',v_result;
  END IF;
END;
$flow$;

DO $assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wos_production_orders
    WHERE version_label = 'V2'
      AND workflow_status = 'READY_TO_START'
  ) THEN
    RAISE EXCEPTION 'UAT006_CONTINUITY_FINAL_STATE_INVALID';
  END IF;
END;
$assertions$;

COMMIT;

SELECT 'WOS_V1_UAT006_CONTINUITY_TO_READY=PASS' AS evidence;
