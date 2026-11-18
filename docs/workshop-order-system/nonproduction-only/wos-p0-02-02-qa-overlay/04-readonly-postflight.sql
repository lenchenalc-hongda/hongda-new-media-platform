-- READ ONLY. Run immediately after separately authorized QA overlay installation.
BEGIN READ ONLY;
DO $post$
BEGIN
 IF to_regnamespace('wos_mvp_qa') IS NULL
 OR to_regnamespace('wos_mvp_attestation') IS NULL
 OR to_regnamespace('wos_mvp_isolated') IS NULL
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_PRIVATE_SCHEMA_MISSING'; END IF;
 IF to_regclass('wos_mvp_qa.p1_execution_gate') IS NULL
 OR to_regclass('wos_mvp_qa.cpc_order_bindings') IS NULL
 OR to_regclass('wos_mvp_attestation.private_image_proofs') IS NULL
 OR to_regclass('wos_mvp_attestation.office_document_receipts') IS NULL
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_NEW_TABLE_MISSING'; END IF;
 IF (SELECT count(*) FROM wos_mvp_qa.p1_execution_gate WHERE singleton=true AND enabled=false
  AND enabled_until IS NULL AND approved_run_id IS NULL)<>1
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_P1_GATE_NOT_OFF'; END IF;
 IF (SELECT enabled FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES') IS DISTINCT FROM false
 OR (SELECT enabled FROM public.wos_qa_p2_office_execution_gate WHERE gate_name='OFFICE_WRITES') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_CHANGED_P2_GATE'; END IF;
 IF (SELECT count(*) FROM public.wos_production_orders)<>84
 OR (SELECT count(*) FROM public.wos_production_orders WHERE customer_id IS NULL OR project_id IS NULL)<>83
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_HISTORICAL_RECORD_COUNT_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema IN ('wos_mvp_qa','wos_mvp_attestation')
   AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE'))
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_PRIVATE_WRITE_GRANT_PRESENT'; END IF;
 IF (SELECT count(*) FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
  AND policyname IN ('wos_p7_private_object_insert','wos_p7_private_object_select',
    'wos_p7_storage_reader_roles'))<>3
 THEN RAISE EXCEPTION 'WOS_QA_OVERLAY_P7_POLICY_REMOVED'; END IF;
END $post$;
SELECT 'WOS_QA_OVERLAY_READONLY_POSTFLIGHT=PASS' AS result;
COMMIT;