-- All gate openings here happen ONLY in disposable PostgreSQL17 service.
\set ON_ERROR_STOP on
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $off$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_create_cpc_draft_candidate(
  '58888888-0000-4000-8000-0000000000bb',
  '31111111-0000-4000-8000-000000000001',
  '41111111-0000-4000-8000-000000000001','QA OVERLAY PP','PP',400,'MEDIUM');
  RAISE EXCEPTION 'DEFAULT_OFF_FAIL';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $off$;
RESET ROLE;
UPDATE wos_mvp_qa.p1_execution_gate
 SET enabled=true,enabled_until=clock_timestamp()+interval '6 minutes',
 approved_run_id='44399990001',approved_sha=repeat('a',40),
 approval_reference='POSTGRES17_DISPOSABLE_SYNTHETIC_ONLY',
 updated_at=clock_timestamp() WHERE singleton;
SET ROLE authenticated;
DO $create$
DECLARE v jsonb;
BEGIN
 v:=public.wos_mvp_create_cpc_draft_candidate(
 '58888888-0000-4000-8000-0000000000bb',
 '31111111-0000-4000-8000-000000000001',
 '41111111-0000-4000-8000-000000000001','QA OVERLAY PP','PP',400,'MEDIUM');
 IF v->>'result'<>'CREATED' THEN RAISE EXCEPTION 'CPC_DRAFT_FAILED';END IF;
 v:=public.wos_mvp_create_cpc_draft_candidate(
 '58888888-0000-4000-8000-0000000000bb',
 '31111111-0000-4000-8000-000000000001',
 '41111111-0000-4000-8000-000000000001','QA OVERLAY PP','PP',400,'MEDIUM');
 IF v->>'result'<>'REPLAYED' THEN RAISE EXCEPTION 'CPC_DRAFT_REPLAY_FAILED';END IF;
END $create$;
RESET ROLE;
DO $constraints$
BEGIN
 IF (SELECT count(*) FROM wos_mvp_qa.cpc_order_bindings
 WHERE order_id='58888888-0000-4000-8000-0000000000bb'
 AND customer_id='31111111-0000-4000-8000-000000000001'
 AND project_id='41111111-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'CPC_TRIPLE_NOT_PERSISTED'; END IF;
 IF (SELECT count(*) FROM public.wos_production_orders
 WHERE customer_id IS NULL OR project_id IS NULL)<>83
 THEN RAISE EXCEPTION 'LEGACY_83_LOST';END IF;
 IF has_table_privilege('authenticated','wos_mvp_qa.cpc_order_bindings','INSERT')
 OR has_table_privilege('authenticated','wos_mvp_attestation.private_image_proofs','INSERT')
 THEN RAISE EXCEPTION 'PRIVATE_GRANT_LEAK';END IF;
END $constraints$;
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000003';
SET ROLE authenticated;
DO $viewer$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_create_cpc_draft_candidate(
  '58888888-0000-4000-8000-0000000000bc',
  '31111111-0000-4000-8000-000000000001',
  '41111111-0000-4000-8000-000000000001','VIEWER','PP',20,'MEDIUM');
  RAISE EXCEPTION 'VIEWER_ALLOW';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $viewer$;
RESET ROLE;
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000002';
SET ROLE authenticated;
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_create_cpc_draft_candidate(
  '58888888-0000-4000-8000-0000000000bd',
  '31111111-0000-4000-8000-000000000001',
  '41111111-0000-4000-8000-000000000001','FOREIGN','PP',20,'MEDIUM');
  RAISE EXCEPTION 'FOREIGN_ALLOW';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $foreign$;
RESET ROLE;
UPDATE public.wos_qa_p2_execution_gate SET enabled=true WHERE gate_name='OPERATOR_WRITES';
SET request.jwt.claim.sub='21111111-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $p2$
BEGIN
 BEGIN
  PERFORM public.wos_mvp_create_cpc_draft_candidate(
  '58888888-0000-4000-8000-0000000000be',
  '31111111-0000-4000-8000-000000000001',
  '41111111-0000-4000-8000-000000000001','P2 ON','PP',20,'MEDIUM');
  RAISE EXCEPTION 'P2_CONCURRENT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $p2$;
RESET ROLE;
UPDATE public.wos_qa_p2_execution_gate SET enabled=false WHERE gate_name='OPERATOR_WRITES';
SELECT 'WOS_QA_OVERLAY_CPC_GATE_RLS_AND_P2_INTERLOCK=PASS' AS result;
