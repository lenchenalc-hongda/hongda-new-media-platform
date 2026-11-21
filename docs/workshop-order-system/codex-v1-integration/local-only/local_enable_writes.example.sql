-- Disposable local Supabase only. Replace the two UUID placeholders after the
-- synthetic order exists. Never run against cloud QA or Production.
BEGIN;
UPDATE public.wos_qa_p2_execution_gate
SET enabled=true,enabled_until=clock_timestamp()+interval '15 minutes',
    approval_reference='LOCAL_WOS_E2E_REPLACE_WITH_TIMESTAMP',
    updated_at=clock_timestamp()
WHERE gate_name='OPERATOR_WRITES';
UPDATE public.wos_qa_p2_office_execution_gate
SET enabled=true,enabled_until=clock_timestamp()+interval '15 minutes',
    approval_reference='LOCAL_WOS_E2E_REPLACE_WITH_TIMESTAMP',
    updated_at=clock_timestamp()
WHERE gate_name='OFFICE_WRITES';
UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,enabled_until=clock_timestamp()+interval '15 minutes',
    approval_reference='LOCAL_WOS_E2E_REPLACE_WITH_TIMESTAMP',
    allowed_order_id='00000000-0000-4000-8000-000000000000',
    allowed_organization_id='00000000-0000-4000-8000-000000000000',
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OPERATOR_WRITES','M2_OFFICE_WRITES');
COMMIT;
