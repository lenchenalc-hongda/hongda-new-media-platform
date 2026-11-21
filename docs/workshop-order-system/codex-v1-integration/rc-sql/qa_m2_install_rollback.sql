-- NOT AUTHORIZED FOR QA YET.
-- Only valid immediately after install and before any M2 receipt exists.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled) THEN
    RAISE EXCEPTION 'M2_ROLLBACK_REFUSED_GATE_ENABLED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_receipts) THEN
    RAISE EXCEPTION 'M2_ROLLBACK_REFUSED_RECEIPTS_EXIST';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated;
DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_spec_digest(uuid);
DROP INDEX IF EXISTS public.wos_p2_m2_one_current_baseline_per_entity;
DROP TABLE IF EXISTS public.wos_qa_p2_m2_receipts;
DROP TABLE IF EXISTS public.wos_qa_p2_m2_gate;

ALTER TABLE public.wos_visual_baselines
  DROP COLUMN IF EXISTS office_proof_set_digest,
  DROP COLUMN IF EXISTS office_post_order_version,
  DROP COLUMN IF EXISTS workshop_proof_set_digest,
  DROP COLUMN IF EXISTS workshop_post_order_version;
COMMIT;
