-- ZERO-WRITE ROLLBACK PROPOSAL. NOT AUTHORIZED FOR HOSTED QA.
-- Allowed only if overlay has NEVER processed any candidate order or image.
-- After ANY live QA write, leave schema intact and fail-close the feature gate,
-- then use a separately approved forward-fix/data restore instead of DROP.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $stop$
BEGIN
 IF to_regclass('wos_mvp_qa.p1_execution_gate') IS NULL
 OR to_regclass('wos_mvp_qa.cpc_order_bindings') IS NULL
 OR to_regclass('wos_mvp_attestation.office_document_receipts') IS NULL
 OR to_regclass('wos_mvp_attestation.private_image_proofs') IS NULL
 THEN RAISE EXCEPTION 'WOS_OVERLAY_ROLLBACK_BASELINE_NOT_PRESENT';END IF;
 IF (SELECT enabled FROM wos_mvp_qa.p1_execution_gate WHERE singleton) IS DISTINCT FROM false
 OR (SELECT enabled FROM public.wos_qa_p2_execution_gate WHERE gate_name='OPERATOR_WRITES') IS DISTINCT FROM false
 OR (SELECT enabled FROM public.wos_qa_p2_office_execution_gate WHERE gate_name='OFFICE_WRITES') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'WOS_OVERLAY_ROLLBACK_REQUIRES_ALL_GATES_OFF';END IF;
 IF EXISTS(SELECT 1 FROM wos_mvp_qa.cpc_order_bindings)
 OR EXISTS(SELECT 1 FROM wos_mvp_attestation.office_document_receipts)
 OR EXISTS(SELECT 1 FROM wos_mvp_attestation.private_image_proofs)
 OR EXISTS(SELECT 1 FROM public.wos_production_orders WHERE order_number LIKE 'WOS-CANDIDATE-%')
 OR EXISTS(SELECT 1 FROM public.wos_production_orders WHERE follow_up_batch_plan IS NOT NULL)
 THEN RAISE EXCEPTION 'WOS_OVERLAY_LIVE_DATA_EXISTS_USE_FORWARD_FIX';END IF;
 IF (SELECT count(*) FROM public.wos_production_orders)<>84
 OR (SELECT count(*) FROM public.wos_production_orders WHERE customer_id IS NULL OR project_id IS NULL)<>83
 THEN RAISE EXCEPTION 'WOS_OVERLAY_HISTORICAL_BASELINE_CHANGED';END IF;
END $stop$;
DROP FUNCTION public.wos_mvp_submit_first_order_full_candidate(uuid,integer,uuid,text);
DROP FUNCTION public.wos_mvp_submit_first_order_verified_candidate(uuid,integer,uuid,text);
DROP FUNCTION public.wos_mvp_save_complete_office_candidate(uuid,integer,uuid,jsonb);
DROP FUNCTION public.wos_mvp_register_image_candidate(uuid,uuid,integer,text);
DROP FUNCTION public.wos_mvp_commit_image_proof_candidate(uuid,uuid,uuid,integer,text,text,uuid,text,timestamptz);
DROP FUNCTION public.wos_mvp_storage_snapshot_candidate(text);
DROP FUNCTION public.wos_mvp_create_cpc_draft_candidate(uuid,uuid,uuid,text,text,integer,text);
DROP FUNCTION wos_mvp_attestation.submit_first_order_with_full_document(uuid,integer,uuid,text);
DROP FUNCTION wos_mvp_attestation.submit_first_order_with_storage_proof(uuid,integer,uuid,text);
DROP FUNCTION wos_mvp_attestation.save_complete_office_document(uuid,integer,uuid,jsonb);
DROP FUNCTION wos_mvp_isolated.create_cpc_draft(uuid,uuid,uuid,text,text,integer,text);
DROP FUNCTION wos_mvp_qa.assert_cpc_link(uuid,uuid);
DROP FUNCTION wos_mvp_qa.require_live_gate();
DROP TABLE wos_mvp_attestation.office_document_receipts RESTRICT;
DROP TABLE wos_mvp_attestation.private_image_proofs RESTRICT;
DROP TABLE wos_mvp_qa.cpc_order_bindings RESTRICT;
DROP TABLE wos_mvp_qa.p1_execution_gate RESTRICT;
DROP SCHEMA wos_mvp_attestation RESTRICT;
DROP SCHEMA wos_mvp_isolated RESTRICT;
DROP SCHEMA wos_mvp_qa RESTRICT;
ALTER TABLE public.wos_production_orders DROP COLUMN follow_up_batch_plan RESTRICT;
COMMIT;