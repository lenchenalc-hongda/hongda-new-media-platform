-- WOS P8: local isolated CI DB only. Inspect foundation after actual psql replay.
DO $assert$
DECLARE
  tables_count integer;
  rls_count integer;
  policies_count integer;
  bad_mutation_grants integer;
BEGIN
  SELECT count(*) INTO tables_count FROM information_schema.tables
  WHERE table_schema='public' AND table_name LIKE 'wos_%';
  IF tables_count<>10 THEN RAISE EXCEPTION 'WOS_P8_FOUNDATION_TABLE_COUNT %',tables_count; END IF;
  SELECT count(*) INTO rls_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'wos_%' AND c.relkind='r' AND c.relrowsecurity;
  IF rls_count<>10 THEN RAISE EXCEPTION 'WOS_P8_FOUNDATION_RLS_INCOMPLETE %',rls_count; END IF;
  SELECT count(*) INTO policies_count FROM pg_policies
  WHERE schemaname='public' AND tablename LIKE 'wos_%';
  IF policies_count<>13 THEN RAISE EXCEPTION 'WOS_P8_FOUNDATION_POLICY_COUNT %',policies_count; END IF;
  SELECT count(*) INTO bad_mutation_grants FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name LIKE 'wos_%'
    AND grantee IN ('anon','authenticated') AND privilege_type IN ('UPDATE','DELETE','TRUNCATE');
  IF bad_mutation_grants<>0 THEN RAISE EXCEPTION 'WOS_P8_MUTATION_GRANTS_PRESENT %',bad_mutation_grants; END IF;
END $assert$;

INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-1111-1111-1111-111111111111','admin',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-2222-2222-2222-222222222222','admin',true);

INSERT INTO public.wos_production_orders(
 organization_id, customer_name_snapshot,order_number,product_name,
 sales_owner_profile_id,project_owner_profile_id,priority,version_label,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id
) VALUES(
 'aaaaaaaa-1111-1111-1111-111111111111','QA-ONLY','WOS-P8-EPHEMERAL-001','Synthetic Print',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'LOW','V1',1,1,'SYNTHETIC','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
DO $self$
BEGIN
  IF (SELECT count(*) FROM public.wos_production_orders)<>1
  THEN RAISE EXCEPTION 'WOS_P8_SAME_ORG_READ_FAILED'; END IF;
END $self$;
RESET ROLE;

SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
DO $foreign$
BEGIN
  IF (SELECT count(*) FROM public.wos_production_orders)<>0
  THEN RAISE EXCEPTION 'WOS_P8_CROSS_ORG_RLS_BYPASS'; END IF;
END $foreign$;
RESET ROLE;

-- This foundation only checks same-organization SELECT. It does NOT implement
-- P7 Viewer-role restrictions; the production-specific P7 hardening gate is OPEN.
\echo WOS_P8_PG17_FOUNDATION_10_TABLES=PASS
\echo WOS_P8_PG17_RLS_GRANT_POLICY_ASSERTIONS=PASS
\echo WOS_P8_PG17_CROSS_ORG_NEGATIVE_TEST=PASS
\echo WOS_P8_FOUNDATION_VIEWER_ROLE_HARDENING=PENDING_P7_PRODUCTION_SPECIFIC
