\set ON_ERROR_STOP on

SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;

BEGIN;

SELECT public.wos_create_production_order(
  '73000000-0000-4000-8000-000000000001',
  jsonb_build_object(
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
  )
);

COMMIT;
