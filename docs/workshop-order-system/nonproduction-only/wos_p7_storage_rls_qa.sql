-- Isolated-only WOS Storage RLS regression (real PG17 policy checks).
-- Execute only in hongda-review-dev xulmpqaknlwqqculbsek.
-- Must be run in BEGIN/ROLLBACK; this file never creates actual binary bytes.
BEGIN;
SET LOCAL statement_timeout='30000ms';
SELECT set_config('qa.uid',a.user_id::text,true),
 set_config('qa.pid',a.id::text,true),
 set_config('qa.org',a.org_id::text,true),
 set_config('qa.foreign',f.org_id::text,true),
 set_config('qa.foreign_uid',f.user_id::text,true)
FROM public.profiles a JOIN public.profiles f ON f.org_id<>a.org_id AND f.is_active
WHERE a.role='admin' AND a.is_active LIMIT 1;
SET LOCAL ROLE authenticated;
DO $qa$
DECLARE
 who uuid:=current_setting('qa.uid')::uuid;
 actor uuid:=current_setting('qa.pid')::uuid;
 org uuid:=current_setting('qa.org')::uuid;
 foreign_org uuid:=current_setting('qa.foreign')::uuid;
 foreign_uid uuid:=current_setting('qa.foreign_uid')::uuid;
 order_id uuid;
 image_id uuid:=gen_random_uuid();
 path text;
 evil_path text;
 denied boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',who::text,true);
 INSERT INTO public.wos_production_orders(
  organization_id,customer_name_snapshot,order_number,product_name,sales_owner_profile_id,
  project_owner_profile_id,priority,version_label,requested_quantity,current_batch_quantity,
  product_material,created_by_profile_id)
 VALUES(org,'QA-STORAGE-ROLLBACK','QA-'||gen_random_uuid()::text,'QA-PRIVATE-FILM',
  actor,actor,'MEDIUM','V1',100,100,'plastic',actor) RETURNING id INTO order_id;
 path:='organizations/'||org||'/wos/production-order/'||order_id||'/images/product/versions/V1/'||image_id||'/qa-proof.png';
 INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 VALUES('wos-private',path,who::text,'{"size":20,"mimetype":"image/png"}'::jsonb);
 IF NOT EXISTS(SELECT 1 FROM storage.objects so WHERE so.bucket_id='wos-private' AND so.name=path)
 THEN RAISE EXCEPTION 'STORAGE_POLICY_SAME_ORG_READ_FAIL';END IF;
 evil_path:='organizations/'||foreign_org||'/wos/production-order/'||order_id||'/images/product/versions/V1/'||gen_random_uuid()||'/qa-evil.png';
 BEGIN
   INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
   VALUES('wos-private',evil_path,who::text,'{"size":20,"mimetype":"image/png"}'::jsonb);
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'STORAGE_CROSS_ORG_PATH_WRITE_ALLOWED';END IF;
 PERFORM set_config('request.jwt.claim.sub',foreign_uid::text,true);
 IF EXISTS(SELECT 1 FROM storage.objects so WHERE so.bucket_id='wos-private' AND so.name=path)
 THEN RAISE EXCEPTION 'STORAGE_FOREIGN_ORG_READ_LEAK';END IF;
END $qa$;
ROLLBACK;
SELECT CASE WHEN (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')=0
 THEN 'PASS_WOS_ACTUAL_STORAGE_OBJECTS_RLS_SIMULATED_ROLE_NO_BINARY_ROLLBACK'
 ELSE 'FAIL_STORAGE_QA_RESIDUE' END AS result;
