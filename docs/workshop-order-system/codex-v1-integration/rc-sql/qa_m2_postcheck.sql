-- READ ONLY. Run after the reviewed transaction, before any separate EXECUTE grant.
SELECT
  to_regclass('public.wos_qa_p2_m2_gate') IS NOT NULL AS gate_created,
  to_regclass('public.wos_qa_p2_m2_receipts') IS NOT NULL AS receipts_created,
  to_regprocedure('public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)')
    IS NOT NULL AS action_created,
  (SELECT bool_and(NOT enabled) FROM public.wos_qa_p2_m2_gate) AS gates_default_off,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.wos_qa_p2_m2_gate'::regclass) AS gate_rls,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.wos_qa_p2_m2_receipts'::regclass) AS receipts_rls,
  NOT has_function_privilege(
    'authenticated',
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) AS authenticated_execute_revoked;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='wos_visual_baselines'
  AND column_name IN (
    'office_proof_set_digest',
    'office_post_order_version',
    'workshop_proof_set_digest',
    'workshop_post_order_version'
  )
ORDER BY column_name;
