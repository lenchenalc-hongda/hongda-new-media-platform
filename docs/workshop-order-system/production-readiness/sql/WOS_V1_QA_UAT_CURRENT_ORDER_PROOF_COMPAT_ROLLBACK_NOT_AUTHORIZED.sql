-- WOS V1 QA-only current-order Proof compatibility rollback.
-- NOT AUTHORIZED FOR EXECUTION.

BEGIN;

DO $rollback$
DECLARE
  v_backup wos_v1_qa_current_order_proof_compat.definition_backup%ROWTYPE;
  v_current_definition text;
  v_current_sha256 text;
BEGIN
  IF current_setting(
    'wos_v1.qa_current_order_proof_rollback_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_ROLLBACK_PROJECT_MISMATCH';
  END IF;
  IF to_regclass(
    'wos_v1_qa_current_order_proof_compat.definition_backup'
  ) IS NULL THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_ROLLBACK_NOT_INSTALLED';
  END IF;

  SELECT * INTO STRICT v_backup
  FROM wos_v1_qa_current_order_proof_compat.definition_backup
  WHERE singleton=true;
  v_current_definition := pg_get_functiondef(
    'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
  );
  v_current_sha256 := encode(
    sha256(convert_to(v_current_definition, 'UTF8')),
    'hex'
  );
  IF v_current_sha256 IS DISTINCT FROM v_backup.patched_sha256
    OR v_current_definition IS DISTINCT FROM v_backup.patched_definition
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_ROLLBACK_TAMPERED';
  END IF;

  EXECUTE v_backup.function_definition;
  v_current_sha256 := encode(
    sha256(convert_to(
      pg_get_functiondef(
        'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
      ),
      'UTF8'
    )),
    'hex'
  );
  IF v_current_sha256 IS DISTINCT FROM v_backup.source_sha256 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_RESTORE_MISMATCH';
  END IF;

  DROP SCHEMA wos_v1_qa_current_order_proof_compat CASCADE;
END;
$rollback$;

COMMIT;

-- NOT_AUTHORIZED
