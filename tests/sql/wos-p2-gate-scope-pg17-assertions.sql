-- Ephemeral PostgreSQL 17 scope assertions. No QA or Production connection.
CREATE SCHEMA IF NOT EXISTS wos_qa_safety;
GRANT USAGE ON SCHEMA wos_qa_safety TO authenticated;

UPDATE public.wos_qa_p2_execution_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_SCOPED_GATE_PG17',
    allowed_order_id='33333333-3333-4333-8333-333333333333',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';
UPDATE public.wos_qa_p2_office_execution_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_SCOPED_GATE_PG17',
    allowed_order_id='33333333-3333-4333-8333-333333333333',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at=clock_timestamp()
WHERE gate_name='OFFICE_WRITES';
UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_SCOPED_GATE_PG17',
    allowed_order_id='33333333-3333-4333-8333-333333333333',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

UPDATE public.wos_production_orders
SET customer_name_snapshot='SCOPED_WRITE_ALLOWED'
WHERE id='33333333-3333-4333-8333-333333333333';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.wos_production_orders(
      id,organization_id,order_number,workflow_status,version,version_label,
      customer_name_snapshot,product_name,product_material,requested_quantity,
      current_batch_quantity)
    VALUES(
      '39999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA-NONPROD-OUTSIDE-SCOPE',
      'SUBMITTED',1,'V1','Outside scope','Outside scope','Outside scope',1,1);
    RAISE EXCEPTION 'OUTSIDE_ORDER_INSERT_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    UPDATE public.wos_production_orders
    SET organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'CROSS_ORG_UPDATE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    UPDATE public.wos_production_orders
    SET order_number='NOT-A-QA-ORDER'
    WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'NON_QA_ORDER_UPDATE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;

-- One enabled Gate pointing at a different order makes the scope ambiguous and
-- therefore fail closed for every order write.
UPDATE public.wos_qa_p2_m2_gate
SET allowed_order_id='38888888-8888-4888-8888-888888888888',
    updated_at=clock_timestamp()
WHERE gate_name='M2_OFFICE_WRITES';
DO $$
BEGIN
  BEGIN
    UPDATE public.wos_production_orders
    SET customer_name_snapshot='DISAGREEING_GATES_MUST_DENY'
    WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'DISAGREEING_GATE_SCOPE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
UPDATE public.wos_qa_p2_m2_gate
SET allowed_order_id='33333333-3333-4333-8333-333333333333',
    updated_at=clock_timestamp()
WHERE gate_name='M2_OFFICE_WRITES';

-- Enabled-but-expired gates must not silently fall back to "no gate".
UPDATE public.wos_qa_p2_execution_gate
SET enabled_until=clock_timestamp()-interval '1 second',
    updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';
DO $$
BEGIN
  BEGIN
    UPDATE public.wos_production_orders
    SET customer_name_snapshot='EXPIRED_GATE_MUST_DENY'
    WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'EXPIRED_ENABLED_GATE_WAS_IGNORED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;

UPDATE public.wos_qa_p2_execution_gate
SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,allowed_organization_id=NULL,
    updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';
UPDATE public.wos_qa_p2_office_execution_gate
SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,allowed_organization_id=NULL,
    updated_at=clock_timestamp()
WHERE gate_name='OFFICE_WRITES';
UPDATE public.wos_qa_p2_m2_gate
SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,allowed_organization_id=NULL,
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

UPDATE public.wos_production_orders
SET customer_name_snapshot='QA M2 CUSTOMER'
WHERE id='33333333-3333-4333-8333-333333333333';

SELECT 'WOS_P2_GATE_PG17_ORDER_ORG_ONLY=PASS' AS evidence;
SELECT 'WOS_P2_GATE_PG17_AMBIGUOUS_OR_EXPIRED=DENIED' AS evidence;
