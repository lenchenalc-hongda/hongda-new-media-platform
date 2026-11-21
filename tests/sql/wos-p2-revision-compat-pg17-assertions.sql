-- Disposable PG17 only; follows the reviewed Office->Review synthetic chain.
UPDATE public.wos_qa_p2_execution_gate SET enabled=true,
 enabled_until=clock_timestamp()+INTERVAL '5 minutes',
 approval_reference='SYNTHETIC_POST_REVIEW_PG17_ONLY'
 WHERE gate_name='OPERATOR_WRITES';
INSERT INTO public.wos_reference_images(
  organization_id,entity_type,entity_id,category,version_label,image_status,storage_bucket)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','FILM_PATTERN','V1','READY','wos-private'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','SIGNED_SAMPLE','V1','READY','wos-private');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.wos_qa_p2_operator_action(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',7,
    'eeee1111-1111-4111-8111-111111111111',
    'CONFIRM_MATERIAL','FIXTURE','ARRIVED',NULL,NULL,
    'operator checked new revision fixture receipt');
  IF r->>'workflowStatus'<>'WAITING_MATERIAL' OR (r->>'version')::integer<>8
  THEN RAISE EXCEPTION 'POST_REVIEW_MATERIAL_CONFIRM_DENIED'; END IF;
  BEGIN
    PERFORM public.wos_qa_p2_operator_action(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',8,
      'eeee2222-2222-4222-8222-222222222222',
      'CONFIRM_MATERIAL','FILM','VERSION_VERIFIED',NULL,NULL,
      'old signed film image must not pass the revised version');
    RAISE EXCEPTION 'OLD_FILM_VERSION_REUSED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.wos_qa_p2_operator_action(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',8,
      'eeee3333-3333-4333-8333-333333333333',
      'CONFIRM_MATERIAL','SIGNED_SAMPLE','VERIFIED',NULL,NULL,
      'old signed sample cannot authorize the new revision');
    RAISE EXCEPTION 'OLD_SIGNED_SAMPLE_REUSED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT version FROM public.wos_production_orders
    WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>8
  OR (SELECT count(*) FROM public.wos_resource_readiness
    WHERE entity_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>1
 THEN RAISE EXCEPTION 'UNVERIFIED_MATERIAL_VERSION_BOUNDARY'; END IF;
 IF (SELECT version_label FROM public.wos_production_orders
    WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'QA-R6'
 THEN RAISE EXCEPTION 'NEW_VERSION_LABEL_LOST'; END IF;
END $$;
UPDATE public.wos_qa_p2_execution_gate SET enabled=false,enabled_until=NULL,
 approval_reference='NOT_AUTHORIZED' WHERE gate_name='OPERATOR_WRITES';
SELECT 'WOS_P2_PG17_POST_REVIEW_MATERIAL_RECEIPT=PASS' AS evidence;
SELECT 'WOS_P2_PG17_OLD_FILM_AND_SIGNED_SAMPLE_REJECTED=PASS' AS evidence;
