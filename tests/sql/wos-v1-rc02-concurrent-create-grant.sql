DO $authorize_concurrent_create$
DECLARE
  v_payload jsonb := jsonb_build_object(
    'orderNumber',
      'QA-NONPROD-PG17-73000000-0000-4000-8000-000000000001',
    'customerId', '81000000-0000-4000-8000-000000000001',
    'projectId', '82000000-0000-4000-8000-000000000001',
    'productName', 'RC02 Concurrent Create Product',
    'priority', 'MEDIUM',
    'requestedQuantity', 10,
    'currentBatchQuantity', 10,
    'splitDelivery', false,
    'productMaterial', 'RC02 Synthetic PET',
    'salesOwnerProfileId', '11111111-1111-4111-8111-111111111111',
    'projectOwnerProfileId', '11111111-1111-4111-8111-111111111111'
  );
  v_fingerprint text;
BEGIN
  v_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'requestId', '73000000-0000-4000-8000-000000000001'::uuid,
    'actorUserId', '10101010-1010-4010-8010-101010101010'::uuid,
    'organizationId', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid,
    'payload', v_payload - ARRAY[
      'customerNameSnapshot',
      'projectNameSnapshot',
      'salesOwnerProfileId',
      'projectOwnerProfileId'
    ]
  )::text, 'UTF8')), 'hex');
  INSERT INTO wos_qa_safety.rc02_business_grants(
    authorization_id, request_id, organization_id,
    office_user_id, office_profile_id,
    operator_user_id, operator_profile_id,
    order_number, customer_id, project_id,
    create_payload_fingerprint, state, enabled_until, approval_reference
  ) VALUES (
    'WOS-V1-RC02-PG17-CONCURRENT-CREATE',
    '73000000-0000-4000-8000-000000000001',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '20202020-2020-4020-8020-202020202020',
    '22222222-2222-4222-8222-222222222222',
    'QA-NONPROD-PG17-73000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    v_fingerprint,
    'AUTHORIZED',
    clock_timestamp() + interval '10 minutes',
    'RC02-PG17-CONCURRENT-CREATE'
  );
END;
$authorize_concurrent_create$;
