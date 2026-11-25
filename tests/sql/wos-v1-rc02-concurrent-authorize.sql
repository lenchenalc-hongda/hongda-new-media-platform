\set ON_ERROR_STOP on

BEGIN;

INSERT INTO wos_qa_safety.rc02_business_grants(
  authorization_id, request_id, organization_id,
  office_user_id, office_profile_id,
  operator_user_id, operator_profile_id,
  order_number, customer_id, project_id,
  create_payload_fingerprint, state, enabled_until, approval_reference
) VALUES (
  :'authorization_id',
  :'request_id'::uuid,
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111',
  '20202020-2020-4020-8020-202020202020',
  '22222222-2222-4222-8222-222222222222',
  :'order_number',
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'AUTHORIZED',
  clock_timestamp() + interval '5 minutes',
  'RC02-PG17-CONCURRENT-AUTHORIZE'
);

SELECT pg_sleep(1);

COMMIT;
