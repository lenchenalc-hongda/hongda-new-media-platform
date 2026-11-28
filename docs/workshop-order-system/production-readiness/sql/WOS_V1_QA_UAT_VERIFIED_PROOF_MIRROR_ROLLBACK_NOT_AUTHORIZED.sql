-- WOS V1 QA-only verified-proof mirror rollback.
-- NOT AUTHORIZED FOR EXECUTION.

BEGIN;

DO $rollback$
DECLARE
  v_state wos_v1_qa_proof_mirror_compat.install_state%ROWTYPE;
  v_function_definition text;
  v_trigger_oid oid;
BEGIN
  IF current_setting(
    'wos_v1.qa_verified_proof_mirror_rollback_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_ROLLBACK_PROJECT_MISMATCH';
  END IF;
  IF to_regclass(
    'wos_v1_qa_proof_mirror_compat.install_state'
  ) IS NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_NOT_INSTALLED';
  END IF;

  SELECT state.* INTO v_state
  FROM wos_v1_qa_proof_mirror_compat.install_state state
  WHERE state.singleton=true;
  SELECT trigger_row.oid INTO v_trigger_oid
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgname='wos_v1_qa_uat_verified_proof_mirror'
    AND trigger_row.tgrelid='public.wos_qa_verified_image_proofs'::regclass;
  IF v_trigger_oid IS NULL
    OR pg_get_triggerdef(v_trigger_oid) IS DISTINCT FROM
      v_state.trigger_definition
    OR to_regprocedure(
      'public.wos_v1_qa_uat_mirror_verified_proof()'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_TAMPERED';
  END IF;

  v_function_definition := pg_get_functiondef(
    'public.wos_v1_qa_uat_mirror_verified_proof()'::regprocedure
  );
  IF v_function_definition IS DISTINCT FROM v_state.function_definition
    OR encode(
      sha256(convert_to(v_function_definition,'UTF8')),
      'hex'
    ) IS DISTINCT FROM v_state.function_sha256
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_TAMPERED';
  END IF;

  DROP TRIGGER wos_v1_qa_uat_verified_proof_mirror
    ON public.wos_qa_verified_image_proofs;
  DROP FUNCTION public.wos_v1_qa_uat_mirror_verified_proof();
  DROP SCHEMA wos_v1_qa_proof_mirror_compat CASCADE;
END;
$rollback$;

COMMIT;

-- NOT_AUTHORIZED
