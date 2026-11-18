-- Synthetic PostgreSQL17 fixture reflecting the observed *existing* QA shapes.
-- NEVER RUN IN QA/PRODUCTION.
\set ON_ERROR_STOP on
CREATE TABLE public.wos_qa_verified_image_proofs(id uuid PRIMARY KEY);
CREATE TABLE public.wos_qa_p2_execution_gate(gate_name text PRIMARY KEY,enabled boolean NOT NULL);
CREATE TABLE public.wos_qa_p2_office_execution_gate(gate_name text PRIMARY KEY,enabled boolean NOT NULL);
INSERT INTO public.wos_qa_p2_execution_gate VALUES('OPERATOR_WRITES',false);
INSERT INTO public.wos_qa_p2_office_execution_gate VALUES('OFFICE_WRITES',false);
CREATE SCHEMA wos_qa_safety;
CREATE OR REPLACE FUNCTION wos_qa_safety.p2_single_order_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'wos_qa_safety'
AS $function$
DECLARE v_operator_on boolean; v_office_on boolean;
BEGIN
 SELECT coalesce((SELECT enabled FROM public.wos_qa_p2_execution_gate
   WHERE gate_name='OPERATOR_WRITES'),true) INTO v_operator_on;
 SELECT coalesce((SELECT enabled FROM public.wos_qa_p2_office_execution_gate
   WHERE gate_name='OFFICE_WRITES'),true) INTO v_office_on;
 IF v_operator_on OR v_office_on THEN
   IF TG_OP='UPDATE' THEN
     IF OLD.id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid AND NEW.id='953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid
       AND OLD.organization_id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
       AND NEW.organization_id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'::uuid
       AND OLD.order_number='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
       AND NEW.order_number='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'
     THEN RETURN NEW; END IF;
   END IF;
   RAISE EXCEPTION 'QA_P2_GATE_SINGLE_ORDER_SCOPE_REJECTED'
     USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
$function$;

CREATE TRIGGER wos_qa_p2_single_order_gate_guard
 BEFORE INSERT OR DELETE OR UPDATE ON public.wos_production_orders
 FOR EACH ROW EXECUTE FUNCTION wos_qa_safety.p2_single_order_write_guard();
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean NOT NULL,
 file_size_limit bigint,allowed_mime_types text[] NOT NULL);
INSERT INTO storage.buckets VALUES('wos-private',false,20971520,
 ARRAY['image/jpeg','image/png','image/webp']);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
 AS $$ SELECT string_to_array(regexp_replace(name,'/[^/]+$',''),'/') $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE
 AS $$ SELECT regexp_replace(name,'^.*/','') $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON storage.objects TO authenticated;
CREATE POLICY wos_p7_private_object_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated  WITH CHECK (((bucket_id = 'wos-private'::text) AND ((storage.foldername(name))[1] = 'organizations'::text) AND ((storage.foldername(name))[3] = 'wos'::text) AND ((storage.foldername(name))[4] = 'production-order'::text) AND ((storage.foldername(name))[6] = 'images'::text) AND ((storage.foldername(name))[7] = ANY (ARRAY['film-pattern'::text, 'product'::text, 'customer-approved-sample'::text, 'signed-sample'::text, 'packaging-label'::text, 'defect-risk'::text, 'other'::text])) AND ((storage.foldername(name))[8] = 'versions'::text) AND ((storage.foldername(name))[9] ~ '^V[1-9][0-9]{0,20}$'::text) AND ((storage.foldername(name))[10] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) AND (storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(jpg|jpeg|png|webp)$'::text) AND (POSITION(('..'::text) IN (storage.filename(name))) = 0) AND (EXISTS ( SELECT 1
   FROM (profiles p
     JOIN wos_production_orders po ON ((po.organization_id = p.org_id)))
  WHERE ((p.user_id = auth.uid()) AND p.is_active AND (p.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales'::text])) AND ((p.org_id)::text = (storage.foldername(objects.name))[2]) AND ((po.id)::text = (storage.foldername(objects.name))[5]) AND (po.workflow_status = 'DRAFT'::text) AND (po.version_label = (storage.foldername(objects.name))[9]) AND ((p.role <> 'sales'::text) OR ((p.id = po.created_by_profile_id) OR (p.id = po.sales_owner_profile_id))))))));
CREATE POLICY wos_p7_private_object_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'wos-private'::text) AND ((storage.foldername(name))[1] = 'organizations'::text) AND ((storage.foldername(name))[3] = 'wos'::text) AND ((storage.foldername(name))[4] = 'production-order'::text) AND (EXISTS ( SELECT 1
   FROM (profiles p
     JOIN wos_production_orders po ON ((po.organization_id = p.org_id)))
  WHERE ((p.user_id = auth.uid()) AND p.is_active AND ((p.org_id)::text = (storage.foldername(objects.name))[2]) AND ((po.id)::text = (storage.foldername(objects.name))[5]) AND ((p.role = ANY (ARRAY['admin'::text, 'manager'::text])) OR ((p.role = 'sales'::text) AND ((p.id = po.created_by_profile_id) OR (p.id = po.sales_owner_profile_id))) OR ((p.role = ANY (ARRAY['operator'::text, 'workshop'::text, 'technician'::text])) AND (po.workflow_status = 'SUBMITTED'::text)))))))) ;
CREATE POLICY wos_p7_storage_reader_roles ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (((bucket_id IS DISTINCT FROM 'wos-private'::text) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_active = true) AND (p.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'operator'::text, 'workshop'::text, 'technician'::text])) AND ((p.org_id)::text = (storage.foldername(objects.name))[2])))))) ;
INSERT INTO public.organizations(id,name) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','Synthetic QA A'),
 ('bbbbbbbb-0000-4000-8000-000000000002','Synthetic QA B');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('11111111-0000-4000-8000-000000000001','21111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','sales',true),
 ('11111111-0000-4000-8000-000000000002','21111111-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','sales',true),
 ('11111111-0000-4000-8000-000000000003','21111111-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001','viewer',true),
 ('11111111-0000-4000-8000-000000000004','21111111-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000001','operator',true);
INSERT INTO public.cpc_customer_references(id,org_id,status,display_name_snapshot)
VALUES('31111111-0000-4000-8000-000000000001',
 'aaaaaaaa-0000-4000-8000-000000000001','active','Synthetic Test Customer');
INSERT INTO public.cpc_projects(id,org_id,customer_reference_id,title,owner_profile_id,status)
VALUES('41111111-0000-4000-8000-000000000001',
 'aaaaaaaa-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001',
 'Synthetic Test Project','11111111-0000-4000-8000-000000000001','active');
INSERT INTO public.wos_production_orders(id,organization_id,customer_id,customer_name_snapshot,
 project_id,project_name_snapshot,order_number,product_name,sales_owner_profile_id,
 project_owner_profile_id,priority,version_label,workflow_status,version,
 requested_quantity,current_batch_quantity,product_material,created_by_profile_id)
VALUES('953d2204-3e65-4b75-b10e-c6e97f1bbb56',
 'aaaaaaaa-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001','Synthetic Test Customer',
 '41111111-0000-4000-8000-000000000001','Synthetic Test Project',
 'QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded','Original Synthetic Order',
 '11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001',
 'MEDIUM','QA-R6','WAITING_MATERIAL',7,100,100,'PP',
 '11111111-0000-4000-8000-000000000001');
INSERT INTO public.wos_production_orders(id,organization_id,customer_id,customer_name_snapshot,
 project_id,order_number,product_name,sales_owner_profile_id,project_owner_profile_id,
 priority,version_label,workflow_status,version,requested_quantity,
 current_batch_quantity,product_material,created_by_profile_id)
SELECT gen_random_uuid(),'aaaaaaaa-0000-4000-8000-000000000001',NULL,'Legacy',NULL,
 'QA-LEGACY-'||g,'Synthetic Legacy','11111111-0000-4000-8000-000000000001',
 '11111111-0000-4000-8000-000000000001','MEDIUM','V1','SUBMITTED',2,25,25,'PP',
 '11111111-0000-4000-8000-000000000001' FROM generate_series(1,83) g;
INSERT INTO public.wos_submission_receipts(organization_id,order_id,source_revision,
 source_version_label,idempotency_key,actor_profile_id,request_fingerprint)
SELECT organization_id,id,1,'V1',gen_random_uuid(),
 '11111111-0000-4000-8000-000000000001',repeat('a',64)
FROM public.wos_production_orders WHERE order_number LIKE 'QA-LEGACY-%'
ORDER BY order_number LIMIT 82;
INSERT INTO public.wos_workshop_inbox(organization_id,order_id,submission_id,
 source_revision,source_version_label)
SELECT organization_id,order_id,id,source_revision,source_version_label
FROM public.wos_submission_receipts;
INSERT INTO public.wos_status_history(organization_id,entity_type,entity_id,
 previous_status,next_status,actor_profile_id,actor_role,reason_code,metadata)
SELECT 'aaaaaaaa-0000-4000-8000-000000000001','PRODUCTION_ORDER',
 '953d2204-3e65-4b75-b10e-c6e97f1bbb56','DRAFT','SUBMITTED',
 '11111111-0000-4000-8000-000000000001','sales','SYNTHETIC','{}'::jsonb
FROM generate_series(1,94);
INSERT INTO storage.objects(id,bucket_id,name,owner_id,version,updated_at,metadata)
SELECT gen_random_uuid(),'wos-private',
 'organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/953d2204-3e65-4b75-b10e-c6e97f1bbb56/images/product/versions/QA-R6/'
 ||gen_random_uuid()||'/legacy'||g||'.png',
 '21111111-0000-4000-8000-000000000001','legacy-version',
 '2026-11-18T00:00:00Z','{"mimetype":"image/png","size":"68"}'::jsonb
FROM generate_series(1,83) g;
DO $verify$ BEGIN
 IF (SELECT count(*) FROM public.wos_production_orders)<>84
 OR (SELECT count(*) FROM public.wos_production_orders WHERE customer_id IS NULL OR project_id IS NULL)<>83
 OR (SELECT count(*) FROM public.wos_submission_receipts)<>82
 OR (SELECT count(*) FROM public.wos_workshop_inbox)<>82
 OR (SELECT count(*) FROM public.wos_status_history)<>94
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private')<>83
 THEN RAISE EXCEPTION 'SYNTHETIC_QA_BASELINE_NOT_EXACT'; END IF;
END $verify$;
SELECT 'WOS_OVERLAY_83_LEGACY_BASELINE_P7_POLICY=PASS' result;
