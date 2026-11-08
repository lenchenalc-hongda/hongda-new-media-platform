-- WOS P8 branch only, adversarial shared-Storage policy composition test.
-- Every role, bucket, object, grant and broad test policy is rolled back.
-- Storage object rows are synthetic metadata only (no actual file bytes).
BEGIN;
DO $guard$ BEGIN
 IF to_regclass('public.wos_production_orders') IS NULL
 OR (SELECT count(*) FROM public.profiles)<>0
 OR (SELECT count(*) FROM public.organizations)<>0
 OR (SELECT count(*) FROM storage.objects)<>0
 THEN RAISE EXCEPTION 'WOS_P8_STAGING_EMPTY_FOR_ADVERSARIAL_TEST'; END IF;
END $guard$;

-- Deliberately simulate a dangerously permissive rule from another module
-- and full SQL ACLs. Restrictive WOS policies must defeat it.
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
CREATE POLICY wos_p8_adversarial_broad_permissive_rollback ON storage.objects
 FOR ALL TO authenticated USING(true) WITH CHECK(true);

INSERT INTO auth.users(id,instance_id,aud,role) VALUES
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.organizations(id,name) VALUES
 ('aaaaaaaa-1111-1111-1111-111111111111','P8 A'),
 ('bbbbbbbb-2222-2222-2222-222222222222','P8 B');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111','admin',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','bbbbbbbb-2222-2222-2222-222222222222','admin',true),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333','aaaaaaaa-1111-1111-1111-111111111111','viewer',true);
INSERT INTO public.wos_production_orders(
 id,organization_id,customer_name_snapshot,order_number,product_name,
 sales_owner_profile_id,project_owner_profile_id,priority,version_label,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id)
VALUES(
 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 'aaaaaaaa-1111-1111-1111-111111111111','synthetic','WOS-P8-SCOPE-001','synthetic',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 'LOW','V1',1,1,'synthetic','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO storage.buckets(id,name,public) VALUES ('p8-other-bucket','p8-other-bucket',false);
INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES
 ('88888888-8888-8888-8888-888888888888','p8-other-bucket','other-module/test.png','{"size":"96","mimetype":"image/png"}'::jsonb);

SET LOCAL request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata,version) VALUES(
 'ffffffff-ffff-ffff-ffff-ffffffffffff','wos-private',
 'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/99999999-9999-9999-9999-999999999999/valid.png',
 '11111111-1111-1111-1111-111111111111','{"mimetype":"image/png","size":"96"}'::jsonb,'v1');
DO $admin$
DECLARE n integer; blocked boolean:=false;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>1
 THEN RAISE EXCEPTION 'VALID_OFFICE_READ_FAILED'; END IF;
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata,version) VALUES(
  'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa','wos-private',
  'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa/bad..png',
  '11111111-1111-1111-1111-111111111111','{"size":"96"}'::jsonb,'v1');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'MALFORMED_WOS_INSERT_PASSED_BROAD_POLICY'; END IF;
 UPDATE storage.objects SET name=name||'.changed' WHERE bucket_id='wos-private';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'WOS_UPDATE_BYPASS_%',n; END IF;
 DELETE FROM storage.objects WHERE bucket_id='wos-private';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'WOS_DELETE_BYPASS_%',n; END IF;
END $admin$;
RESET ROLE;

SET LOCAL request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
SET LOCAL ROLE authenticated;
DO $viewer$
DECLARE blocked boolean:=false;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'VIEWER_READ_BYPASS_WITH_BROAD_POLICY'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='p8-other-bucket')<>1
 THEN RAISE EXCEPTION 'UNRELATED_BUCKET_INADVERTENTLY_BLOCKED'; END IF;
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata,version) VALUES(
   'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb','wos-private',
   'organizations/aaaaaaaa-1111-1111-1111-111111111111/wos/production-order/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/images/product/versions/V1/bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb/viewer.png',
   '33333333-3333-3333-3333-333333333333','{"size":"96"}'::jsonb,'v1');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'VIEWER_INSERT_BYPASS_WITH_BROAD_POLICY'; END IF;
END $viewer$;
RESET ROLE;

SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SET LOCAL ROLE authenticated;
DO $foreign$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'FOREIGN_ORG_READ_BYPASS_WITH_BROAD_POLICY'; END IF;
END $foreign$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $anon$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>0
 THEN RAISE EXCEPTION 'ANON_READ_BYPASS'; END IF;
END $anon$;
RESET ROLE;

ROLLBACK;
SELECT 'WOS_P8_STORAGE_PERMISSIVE_OR_BYPASS_DENIED_AND_ROLLBACK_PASS' AS result,
 (SELECT count(*) FROM storage.objects) AS objects_left,
 (SELECT count(*) FROM public.profiles) AS profiles_left,
 (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND policyname='wos_p8_adversarial_broad_permissive_rollback') AS injected_policies_left;
