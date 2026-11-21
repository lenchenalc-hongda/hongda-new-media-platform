-- Database-owner fail-close only. Safe to rerun; it never enables a gate.
BEGIN;
UPDATE public.wos_qa_p2_m2_gate
SET enabled=false,
    enabled_until=NULL,
    approval_reference='NOT_AUTHORIZED',
    allowed_order_id=NULL,
    allowed_organization_id=NULL,
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');
COMMIT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled) THEN
    RAISE EXCEPTION 'M2_FAILCLOSE_NOT_VERIFIED';
  END IF;
END $$;
