-- P0-01-02 structural proof (disposable PG17, NO customer data).
\set ON_ERROR_STOP on
DO $exist$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM pg_constraint
 WHERE conrelid='public.wos_production_orders'::regclass
 AND conname IN ('wos_mvp_customer_org_fk','wos_mvp_project_customer_org_fk',
  'wos_mvp_sales_owner_org_fk','wos_mvp_project_owner_org_fk','wos_mvp_creator_org_fk');
 IF n<>5 THEN RAISE EXCEPTION 'EXPECTED_5_COMPOSITE_FKS_GOT_%',n; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='wos_production_orders' AND column_name IN('customer_id','project_id') AND is_nullable='YES') THEN
   RAISE EXCEPTION 'CPC_IDS_NOT_REQUIRED';
 END IF;
 IF has_table_privilege('authenticated','public.wos_production_orders','INSERT')
 OR has_table_privilege('authenticated','public.wos_reference_images','INSERT') THEN
   RAISE EXCEPTION 'UNSAFE_DIRECT_CLIENT_INSERT';
 END IF;
END $exist$;
INSERT INTO public.cpc_customer_references(id,org_id,status,display_name_snapshot)
VALUES
 ('32222222-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','active','Different Same-Org Customer'),
 ('32222222-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','active','Foreign-Org Customer');
-- Use an already persisted, fully CPC-linked synthetic order from initial P0-01 test.
DO $negative$
DECLARE base_row public.wos_production_orders%ROWTYPE;
BEGIN
 SELECT * INTO STRICT base_row FROM public.wos_production_orders
 WHERE id='51111111-0000-4000-8000-000000000001';
 BEGIN
  INSERT INTO public.wos_production_orders
   SELECT (jsonb_populate_record(null::public.wos_production_orders,
     (to_jsonb(base_row) || jsonb_build_object(
      'id','53333333-0000-4000-8000-000000000001',
      'customer_id','32222222-0000-4000-8000-000000000001',
      'order_number','WOS-CPC-MISMATCH')))).*;
  RAISE EXCEPTION 'WRONG_CUSTOMER_MATCH_WAS_ACCEPTED';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO public.wos_production_orders
   SELECT (jsonb_populate_record(null::public.wos_production_orders,
     (to_jsonb(base_row) || jsonb_build_object(
      'id','53333333-0000-4000-8000-000000000002',
      'organization_id','bbbbbbbb-0000-4000-8000-000000000002',
      'order_number','WOS-CPC-FOREIGN')))).*;
  RAISE EXCEPTION 'FOREIGN_ORG_ORDER_WAS_ACCEPTED';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.wos_production_orders SET project_id=NULL
   WHERE id=base_row.id;
  RAISE EXCEPTION 'NULL_PROJECT_ACCEPTED';
 EXCEPTION WHEN not_null_violation THEN NULL;
 END;
 BEGIN
  UPDATE public.cpc_projects SET customer_reference_id='32222222-0000-4000-8000-000000000001'
   WHERE id=base_row.project_id;
  RAISE EXCEPTION 'CPC_PAIR_MUTATED_UNDER_EXISTING_ORDER';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM public.wos_production_orders WHERE order_number LIKE 'WOS-CPC-%')<>0 THEN
  RAISE EXCEPTION 'INVALID_ORDER_ROW_PERSISTED';
 END IF;
END $negative$;
SELECT 'WOS_P0_01_02_TRIPLE_FK_WRONG_ORG_PAIR_NULL_AND_REASSIGN=PASS' AS result;
