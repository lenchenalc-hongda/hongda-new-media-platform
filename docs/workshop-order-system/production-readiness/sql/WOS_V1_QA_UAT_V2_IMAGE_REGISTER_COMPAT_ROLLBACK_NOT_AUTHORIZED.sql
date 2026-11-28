-- WOS V1 QA-only V2 image registration compatibility rollback.
-- NOT AUTHORIZED FOR EXECUTION.

BEGIN;

DO $rollback$
DECLARE
  v_definition text;
  v_source_sha256 text;
  v_target_sha256 text;
BEGIN
  IF current_setting(
    'wos_v1.qa_v2_image_register_rollback_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_ROLLBACK_PROJECT_MISMATCH';
  END IF;
  IF to_regclass(
    'wos_v1_qa_v2_image_register_compat.definition_backup'
  ) IS NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_NOT_INSTALLED';
  END IF;

  SELECT function_definition, source_sha256, target_sha256
  INTO v_definition, v_source_sha256, v_target_sha256
  FROM wos_v1_qa_v2_image_register_compat.definition_backup
  WHERE singleton = true;

  IF v_source_sha256 IS DISTINCT FROM encode(
      sha256(convert_to(v_definition, 'UTF8')),
      'hex'
    )
    OR v_source_sha256 IS DISTINCT FROM
      'f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187'
    OR v_target_sha256 IS DISTINCT FROM
      '40231c055eae538f101ca7394880e1f746adcccb8265b07a832909238b678f0d'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_BACKUP_TAMPERED';
  END IF;

  EXECUTE v_definition;

  IF encode(
      sha256(convert_to(
        pg_get_functiondef(
          'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
        ),
        'UTF8'
      )),
      'hex'
    ) IS DISTINCT FROM v_source_sha256
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_RESTORE_MISMATCH';
  END IF;

  DROP SCHEMA wos_v1_qa_v2_image_register_compat CASCADE;
END;
$rollback$;

COMMIT;

-- NOT_AUTHORIZED
