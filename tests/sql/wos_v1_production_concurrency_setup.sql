\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 only. This creates a single synthetic submitted
-- order solely to exercise two simultaneous production RPC transactions.
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'wos_prod_bootstrap_ci' THEN
    RAISE EXCEPTION 'WOS_V1_CONCURRENCY_DISPOSABLE_ONLY';
  END IF;
  IF (SELECT count(*) FROM public.organizations) <> 0
    OR (SELECT count(*) FROM public.profiles) <> 0
    OR (SELECT count(*) FROM public.wos_production_orders) <> 0
  THEN
    RAISE EXCEPTION 'WOS_V1_CONCURRENCY_REQUIRES_CLEANROOM';
  END IF;
END;
$guard$;

INSERT INTO auth.users (id,email) VALUES
  ('90909090-9090-4090-8090-909090909090','concurrency-operator@example.test');
INSERT INTO public.organizations (id,name) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Synthetic Concurrency Org');
INSERT INTO public.profiles (id,user_id,org_id,role,is_active) VALUES
  (
    '99999999-9999-4999-8999-999999999999',
    '90909090-9090-4090-8090-909090909090',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'operator',
    true
  );

INSERT INTO public.wos_production_orders (
  id,organization_id,customer_name_snapshot,order_number,product_name,
  sales_owner_profile_id,project_owner_profile_id,priority,version_label,
  workflow_status,requested_quantity,current_batch_quantity,product_material,
  created_by_profile_id,version
) VALUES (
  '88888888-8888-4888-8888-888888888888',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Synthetic Concurrency Customer',
  'WOS-CONCURRENCY-001',
  'Synthetic Concurrency Product',
  '99999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999999',
  'MEDIUM',
  'V1',
  'SUBMITTED',
  100,
  100,
  'Synthetic Material',
  '99999999-9999-4999-8999-999999999999',
  2
);
INSERT INTO public.wos_submission_receipts (
  id,organization_id,order_id,source_revision,source_version_label,
  idempotency_key,actor_profile_id,request_fingerprint
) VALUES (
  '77777777-7777-4777-8777-777777777777',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '88888888-8888-4888-8888-888888888888',
  1,
  'V1',
  '66666666-6666-4666-8666-666666666666',
  '99999999-9999-4999-8999-999999999999',
  repeat('a',64)
);
INSERT INTO public.wos_workshop_inbox (
  organization_id,order_id,submission_id,source_revision,source_version_label,
  workflow_status
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '88888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  1,
  'V1',
  'SUBMITTED'
);

GRANT EXECUTE ON FUNCTION public.wos_operator_order_action(
  uuid,integer,uuid,text,text
) TO authenticated;

COMMIT;
