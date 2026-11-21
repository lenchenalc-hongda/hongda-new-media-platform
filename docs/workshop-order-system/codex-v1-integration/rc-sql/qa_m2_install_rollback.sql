-- NOT AUTHORIZED FOR QA YET.
-- Only valid immediately after install and before any M2 receipt exists.
BEGIN;
DO $$
DECLARE v_revision_rolled_back boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled) THEN
    RAISE EXCEPTION 'M2_ROLLBACK_REFUSED_GATE_ENABLED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_receipts) THEN
    RAISE EXCEPTION 'M2_ROLLBACK_REFUSED_RECEIPTS_EXIST';
  END IF;
  IF pg_catalog.to_regclass(
       'wos_qa_safety.wos_revision_rollback_marker'
     ) IS NOT NULL THEN
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM wos_qa_safety.wos_revision_rollback_marker '
      || 'WHERE install_key=''revision-images-v1'')'
      INTO v_revision_rolled_back;
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.wos_register_qa_revision_image(uuid,uuid,text,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.wos_qa_revision_gate_allows(uuid,uuid,uuid)'
     ) IS NOT NULL
     OR (
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_policies
         WHERE schemaname='storage' AND tablename='objects'
           AND policyname='wos_qa_revision_object_insert'
       )
       AND NOT v_revision_rolled_back
     )
  THEN
    RAISE EXCEPTION 'M2_ROLLBACK_REVISION_IMAGE_DEPENDENCY_ACTIVE';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wos_qa_p2_m2_reference_image_guard
  ON public.wos_reference_images;
DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_invalidate_signoff(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_image_change_guard();
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
