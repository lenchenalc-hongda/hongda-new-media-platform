-- READ ONLY. WOS-PROD-READY-P0-02-02-QA-OVERLAY.
-- Never invoke INSTALL until this check, a fresh Owner approval, exact Blob audit
-- and current SHA/RLS fingerprint review pass. Unique QA sentinel prevents
-- accidental execution against Production or an arbitrary QA clone.
BEGIN READ ONLY;
DO $pre$
DECLARE n int;
BEGIN
 IF to_regclass('public.wos_qa_p2_execution_gate') IS NULL
 OR to_regclass('public.wos_qa_p2_office_execution_gate') IS NULL
 OR to_regclass('public.wos_production_orders') IS NULL
 OR to_regclass('public.wos_reference_images') IS NULL
 OR to_regclass('public.wos_submission_receipts') IS NULL
 OR to_regclass('public.wos_workshop_inbox') IS NULL
 OR to_regclass('storage.objects') IS NULL
 OR to_regprocedure('public.cpc_can_read_project(uuid,uuid)') IS NULL
 OR to_regprocedure('public.cpc_can_read_customer_reference(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'WOS_OVERLAY_QA_DEPENDENCY_MISSING'; END IF;
 IF to_regnamespace('wos_mvp_qa') IS NOT NULL
 OR to_regnamespace('wos_mvp_attestation') IS NOT NULL
 OR to_regnamespace('wos_mvp_isolated') IS NOT NULL
 THEN RAISE EXCEPTION 'WOS_OVERLAY_ALREADY_INSTALLED_OR_COLLISION'; END IF;
 IF (SELECT count(*) FROM public.wos_production_orders)<>84
 OR (SELECT count(*) FROM public.wos_production_orders WHERE customer_id IS NULL OR project_id IS NULL)<>83
 THEN RAISE EXCEPTION 'WOS_LEGACY_ORDER_BASELINE_CHANGED'; END IF;
 IF (SELECT workflow_status='WAITING_MATERIAL' AND version=7 AND version_label='QA-R6'
   FROM public.wos_production_orders
   WHERE id='953d2204-3e65-4b75-b10e-c6e97f1bbb56') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'WOS_QA_V7_SENTINEL_CHANGED'; END IF;
 IF (SELECT enabled FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES') IS DISTINCT FROM false
 OR (SELECT enabled FROM public.wos_qa_p2_office_execution_gate WHERE gate_name='OFFICE_WRITES') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'WOS_P2_GATES_NOT_OFF'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='wos_production_orders' AND column_name='follow_up_batch_plan')
 THEN RAISE EXCEPTION 'WOS_FOLLOWUP_COLUMN_ALREADY_EXISTS_RECHECK'; END IF;
 IF (SELECT count(*) FROM storage.buckets WHERE id='wos-private'
   AND public=false AND file_size_limit=20971520
   AND 'image/png'=ANY(allowed_mime_types))<>1
 THEN RAISE EXCEPTION 'WOS_PRIVATE_BUCKET_SETTINGS_CHANGED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'
  AND tablename='objects' AND policyname='wos_p7_private_object_insert'
  AND permissive='PERMISSIVE' AND cmd='INSERT')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'
  AND tablename='objects' AND policyname='wos_p7_private_object_select'
  AND permissive='PERMISSIVE' AND cmd='SELECT')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'
  AND tablename='objects' AND policyname='wos_p7_storage_reader_roles'
  AND permissive='RESTRICTIVE' AND cmd='SELECT')
 THEN RAISE EXCEPTION 'WOS_P7_RLS_POLICY_BASELINE_CHANGED'; END IF;
 SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relnamespace='public'::regnamespace AND c.relname='wos_production_orders'
  AND t.tgname='wos_qa_p2_single_order_gate_guard' AND t.tgenabled='O';
 IF n<>1 THEN RAISE EXCEPTION 'WOS_P2_PROTECTIVE_TRIGGER_CHANGED'; END IF;
END $pre$;
SELECT 'WOS_QA_OVERLAY_READONLY_PREFLIGHT=PASS' AS result;
COMMIT;