-- READ ONLY. Run against xulmpqaknlwqqculbsek only after explicit authorization.
SELECT
  to_regclass('public.wos_qa_p2_m2_gate') AS m2_gate,
  to_regclass('public.wos_qa_p2_m2_receipts') AS m2_receipts,
  to_regprocedure('public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)') AS m2_action,
  (SELECT count(*) FROM public.wos_visual_baselines WHERE status='CURRENT')
    AS current_baselines,
  (SELECT enabled FROM public.wos_qa_p2_execution_gate
    WHERE gate_name='OPERATOR_WRITES') AS operator_gate,
  (SELECT enabled FROM public.wos_qa_p2_office_execution_gate
    WHERE gate_name='OFFICE_WRITES') AS office_gate;

-- Every component must be NULL/zero/false before an approved first install.
