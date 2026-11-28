-- WOS V1 QA-only V2 revision proof compatibility rollback.
-- NOT AUTHORIZED FOR EXECUTION.

BEGIN;

DO $rollback$
DECLARE
  v_proof_definition text;
  v_guard_definition text;
  v_proof_source_sha256 text;
  v_guard_source_sha256 text;
BEGIN
  IF current_setting(
    'wos_v1.qa_v2_proof_guard_rollback_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_PROOF_GUARD_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_ROLLBACK_PROJECT_MISMATCH';
  END IF;
  IF to_regclass(
    'wos_v1_qa_v2_proof_compat.definition_backup'
  ) IS NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_NOT_INSTALLED';
  END IF;

  SELECT
    proof_definition,
    guard_definition,
    proof_source_sha256,
    guard_source_sha256
  INTO
    v_proof_definition,
    v_guard_definition,
    v_proof_source_sha256,
    v_guard_source_sha256
  FROM wos_v1_qa_v2_proof_compat.definition_backup
  WHERE singleton = true;

  IF v_proof_source_sha256 IS DISTINCT FROM encode(
      sha256(convert_to(v_proof_definition, 'UTF8')),
      'hex'
    )
    OR v_guard_source_sha256 IS DISTINCT FROM encode(
      sha256(convert_to(v_guard_definition, 'UTF8')),
      'hex'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_BACKUP_TAMPERED';
  END IF;

  EXECUTE v_proof_definition;
  EXECUTE v_guard_definition;

  IF encode(
      sha256(convert_to(
        pg_get_functiondef(
          'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
        ),
        'UTF8'
      )),
      'hex'
    ) IS DISTINCT FROM v_proof_source_sha256
    OR encode(
      sha256(convert_to(
        pg_get_functiondef(
          'public.wos_qa_proof_write_guard()'::regprocedure
        ),
        'UTF8'
      )),
      'hex'
    ) IS DISTINCT FROM v_guard_source_sha256
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_RESTORE_MISMATCH';
  END IF;

  DROP SCHEMA wos_v1_qa_v2_proof_compat CASCADE;
END;
$rollback$;

COMMIT;

-- NOT_AUTHORIZED
