-- QA-only executable transaction test. Caller MUST wrap in BEGIN / ROLLBACK.
-- The storage.objects fixture below mimics only metadata. It does not create a file.
-- It cannot substitute for an actual authenticated Storage API upload test.

SELECT set_config('qa.wos.admin_uid',a.user_id::text,true),
 set_config('qa.wos.operator_uid',o.user_id::text,true),
 set_config('qa.wos.foreign_uid',f.user_id::text,true),
 set_config('qa.wos.actor_profile_id',a.id::text,true),
 set_config('qa.wos.org_id',a.org_id::text,true)
FROM public.profiles a
JOIN public.profiles o ON o.org_id=a.org_id AND o.role='operator' AND o.is_active
JOIN public.profiles f ON f.org_id<>a.org_id AND f.role='sales' AND f.is_active
WHERE a.role='admin' AND a.is_active LIMIT 1;

SET LOCAL ROLE authenticated;
DO $t$
DECLARE
 a uuid:=nullif(current_setting('qa.wos.admin_uid',true),'')::uuid;
 p uuid:=nullif(current_setting('qa.wos.actor_profile_id',true),'')::uuid;
 org uuid:=nullif(current_setting('qa.wos.org_id',true),'')::uuid;
 id_order uuid;
 img uuid:=gen_random_uuid();
 f text;
BEGIN
 IF a IS NULL OR p IS NULL OR org IS NULL THEN RAISE EXCEPTION 'MISSING_PROFILES'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO public.wos_production_orders
 (organization_id,customer_name_snapshot,order_number,product_name,
 sales_owner_profile_id,project_owner_profile_id,priority,version_label,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id)
 VALUES(org,'QA-WOS-ROLLBACK','QA-'||gen_random_uuid()::text,'QA-HEAT-TRANSFER',
 p,p,'MEDIUM','V1',100,100,'plastic',p) RETURNING id INTO id_order;
 f:='organizations/'||org::text||'/wos/production-order/'||id_order::text||
    '/images/product/versions/V1/'||img::text||'/qa-proof.png';
 PERFORM set_config('qa.wos.order_id',id_order::text,true);
 PERFORM set_config('qa.wos.image_id',img::text,true);
 PERFORM set_config('qa.wos.storage_path',f,true);
END $t$;
RESET ROLE;

-- Database fixture only. A genuine Storage API object requires a separate
-- password/JWT test, and is never inferred from this catalog row.
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES('wos-private',current_setting('qa.wos.storage_path'),
 current_setting('qa.wos.admin_uid'),
 '{"size":1024,"mimetype":"image/png"}'::jsonb);

SET LOCAL ROLE authenticated;
DO $checks$
DECLARE
 admin_uid uuid:=current_setting('qa.wos.admin_uid')::uuid;
 operator_uid uuid:=current_setting('qa.wos.operator_uid')::uuid;
 foreign_uid uuid:=current_setting('qa.wos.foreign_uid')::uuid;
 oid uuid:=current_setting('qa.wos.order_id')::uuid;
 img uuid:=current_setting('qa.wos.image_id')::uuid;
 path text:=current_setting('qa.wos.storage_path');
 key uuid:=gen_random_uuid();
 receipt jsonb;
 replay jsonb;
 registered jsonb;
 attest uuid;
 denied_different_key boolean:=false;
 denied_missing_role boolean:=false;
 denied_unready boolean:=false;
 denied_foreign_read boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',admin_uid::text,true);
 BEGIN
  PERFORM public.wos_submit_production_order(oid,1,'V1',gen_random_uuid());
 EXCEPTION WHEN check_violation THEN denied_unready:=SQLERRM='OFFICE_READINESS_REQUIRED'; END;
 IF NOT denied_unready THEN RAISE EXCEPTION 'SUBMIT_WITHOUT_READINESS_ACCEPTED'; END IF;
 registered:=public.wos_register_uploaded_reference_image(oid,img,'PRODUCT',path);
 IF registered->>'status'<>'CREATED' THEN RAISE EXCEPTION 'IMAGE_REGISTRATION_FAILED';END IF;
 IF (public.wos_register_uploaded_reference_image(oid,img,'PRODUCT',path)->>'status')<>'REPLAYED'
 THEN RAISE EXCEPTION 'IMAGE_REGISTRATION_REPLAY_FAILED';END IF;
 attest:=public.wos_confirm_office_completeness(oid,1,'V1',
 'Office completeness confirmed by QA; never production');
 IF attest IS NULL THEN RAISE EXCEPTION 'READINESS_RECEIPT_MISSING';END IF;
 receipt:=public.wos_submit_production_order(oid,1,'V1',key);
 replay:=public.wos_submit_production_order(oid,1,'V1',key);
 IF receipt->>'status'<>'CREATED' OR replay->>'status'<>'REPLAYED'
 OR replay->>'receiptId' IS DISTINCT FROM receipt->>'receiptId'
 THEN RAISE EXCEPTION 'SUBMIT_IDEMPOTENCY_NOT_VERIFIED'; END IF;
 BEGIN
  PERFORM public.wos_submit_production_order(oid,1,'V1',gen_random_uuid());
 EXCEPTION WHEN serialization_failure THEN denied_different_key:=true; END;
 IF NOT denied_different_key THEN RAISE EXCEPTION 'CONCURRENT_VERSION_GATE_MISSING';END IF;
 IF (SELECT count(*) FROM public.wos_submission_receipts WHERE order_id=oid)<>1
 OR (SELECT count(*) FROM public.wos_workshop_inbox WHERE order_id=oid)<>1
 OR (SELECT count(*) FROM public.wos_status_history
   WHERE entity_type='PRODUCTION_ORDER' AND entity_id=oid AND reason_code='OFFICE_SUBMISSION_COMMITTED')<>1
 OR (SELECT workflow_status FROM public.wos_production_orders WHERE id=oid)<>'SUBMITTED'
 OR (SELECT version FROM public.wos_production_orders WHERE id=oid)<>2
 THEN RAISE EXCEPTION 'ATOMIC_FOUR_FACTS_FAIL';END IF;
 PERFORM set_config('request.jwt.claim.sub',operator_uid::text,true);
 IF (SELECT count(*) FROM public.wos_workshop_inbox WHERE order_id=oid)<>1
 THEN RAISE EXCEPTION 'WORKSHOP_INBOX_NOT_VISIBLE_TO_OPERATOR';END IF;
 BEGIN
  PERFORM public.wos_submit_production_order(oid,1,'V1',gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN denied_missing_role:=true; END;
 IF NOT denied_missing_role THEN RAISE EXCEPTION 'OPERATOR_UNAUTHORIZED_SUBMIT_ALLOWED';END IF;
 PERFORM set_config('request.jwt.claim.sub',foreign_uid::text,true);
 IF EXISTS(SELECT 1 FROM public.wos_workshop_inbox WHERE order_id=oid)
 OR EXISTS(SELECT 1 FROM public.wos_submission_receipts WHERE order_id=oid)
 THEN RAISE EXCEPTION 'FOREIGN_WORKSHOP_LEAK';END IF;
END $checks$;
RESET ROLE;
