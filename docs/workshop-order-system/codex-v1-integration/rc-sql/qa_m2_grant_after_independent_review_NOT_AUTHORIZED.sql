-- NOT AUTHORIZED FOR QA YET.
-- Apply only in a separate, independently reviewed transaction after the M2
-- install post-check passes and Owner explicitly approves the grant.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_receipts)
    OR EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled)
  THEN
    RAISE EXCEPTION 'M2_GRANT_PRECONDITION_FAILED';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  TO authenticated;
COMMIT;
