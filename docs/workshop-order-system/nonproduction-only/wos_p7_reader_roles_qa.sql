-- Run only on isolated hongda-review-dev in a transaction.
-- Execute AFTER wos_p7_reader_role_hardening.sql has been applied or
-- within the same BEGIN before ROLLBACK for a dry-run.
-- This test uses role simulation, not a signed Auth session or binary file.
SELECT set_config('qa.admin_uid',a.user_id::text,true),
 set_config('qa.admin_pid',a.id::text,true),
 set_config('qa.operator_uid',o.user_id::text,true),
 set_config('qa.viewer_uid',v.user_id::text,true),
 set_config('qa.org',a.org_id::text,true)
FROM public.profiles a
JOIN public.profiles o ON o.org_id=a.org_id AND o.role='operator' AND o.is_active
JOIN public.profiles v ON v.org_id=a.org_id AND v.role='viewer' AND v.is_active
WHERE a.is_active AND a.role='admin' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $qa$
DECLARE
 u_admin uuid:=current_setting('qa.admin_uid')::uuid;
 pid_admin uuid:=current_setting('qa.admin_pid')::uuid;
 u_operator uuid:=current_setting('qa.operator_uid')::uuid;
 u_viewer uuid:=current_setting('qa.viewer_uid')::uuid;
 org uuid:=current_setting('qa.org')::uuid;
 qa_order_id uuid;
 image_id uuid:=gen_random_uuid();
 image_path text;
 result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',u_admin::text,true);
 INSERT INTO public.wos_production_orders(
  organization_id,customer_name_snapshot,order_number,product_name,
  sales_owner_profile_id,project_owner_profile_id,priority,version_label,
  requested_quantity,current_batch_quantity,product_material,created_by_profile_id)
 VALUES(org,'QA-ROLE-TEST','QA-'||gen_random_uuid()::text,'QA-FILM',
  pid_admin,pid_admin,'MEDIUM','V1',100,100,'plastic',pid_admin)
 RETURNING id INTO qa_order_id;
 image_path:='organizations/'||org::text||'/wos/production-order/'||qa_order_id::text||
 '/images/product/versions/V1/'||image_id::text||'/qa-proof.png';
 INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 VALUES('wos-private',image_path,u_admin::text,'{"size":1024,"mimetype":"image/png"}'::jsonb);
 result:=public.wos_register_uploaded_reference_image(qa_order_id,image_id,'PRODUCT',image_path);
 IF result->>'status'<>'CREATED' THEN RAISE EXCEPTION 'QA_REGISTER_FAILED';END IF;
 PERFORM public.wos_confirm_office_completeness(qa_order_id,1,'V1',
  'QA office completeness confirmed only in rollback');
 result:=public.wos_submit_production_order(qa_order_id,1,'V1',gen_random_uuid());
 IF result->>'status'<>'CREATED' THEN RAISE EXCEPTION 'QA_SUBMIT_FAILED';END IF;
 PERFORM set_config('request.jwt.claim.sub',u_operator::text,true);
 IF (SELECT count(*) FROM public.wos_production_orders z WHERE z.id=qa_order_id)<>1
  OR (SELECT count(*) FROM public.wos_reference_images z WHERE z.entity_id=qa_order_id)<>1
  OR (SELECT count(*) FROM public.wos_submission_receipts z WHERE z.order_id=qa_order_id)<>1
  OR (SELECT count(*) FROM public.wos_workshop_inbox z WHERE z.order_id=qa_order_id)<>1
  OR (SELECT count(*) FROM public.wos_office_readiness_receipts z WHERE z.order_id=qa_order_id)<>1
  OR (SELECT count(*) FROM public.wos_status_history z
       WHERE z.entity_id=qa_order_id AND z.reason_code='OFFICE_SUBMISSION_COMMITTED')<>1
  OR NOT EXISTS (SELECT 1 FROM storage.objects z WHERE z.bucket_id='wos-private' AND z.name=image_path)
 THEN RAISE EXCEPTION 'WOS_OPERATOR_CANNOT_READ_ORGANIZATION_SUBMISSION';END IF;
 PERFORM set_config('request.jwt.claim.sub',u_viewer::text,true);
 IF EXISTS(SELECT 1 FROM public.wos_production_orders z WHERE z.id=qa_order_id)
 OR EXISTS(SELECT 1 FROM public.wos_reference_images z WHERE z.entity_id=qa_order_id)
 OR EXISTS(SELECT 1 FROM public.wos_submission_receipts z WHERE z.order_id=qa_order_id)
 OR EXISTS(SELECT 1 FROM public.wos_workshop_inbox z WHERE z.order_id=qa_order_id)
 OR EXISTS(SELECT 1 FROM public.wos_office_readiness_receipts z WHERE z.order_id=qa_order_id)
 OR EXISTS(SELECT 1 FROM public.wos_status_history z WHERE z.entity_id=qa_order_id)
 OR EXISTS(SELECT 1 FROM storage.objects z WHERE z.bucket_id='wos-private' AND z.name=image_path)
 THEN RAISE EXCEPTION 'WOS_VIEWER_SAME_ORG_ROLE_READ_LEAK';END IF;
END $qa$;
RESET ROLE;
