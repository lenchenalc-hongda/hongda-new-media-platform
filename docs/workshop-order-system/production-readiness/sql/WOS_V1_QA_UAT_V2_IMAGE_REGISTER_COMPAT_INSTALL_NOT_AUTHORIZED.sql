-- WOS V1 QA-only V2 image registration compatibility install.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- The retained QA order resumes at NEEDS_INFORMATION / V2. The hosted
-- registration RPC predates that formal correction state and currently accepts
-- only DRAFT. This installer changes only that state guard.

BEGIN;

DO $register_compat$
DECLARE
  v_definition text;
  v_source_sha256 text;
  v_target_sha256 text;
  v_expected_target_sha256 constant text :=
    '40231c055eae538f101ca7394880e1f746adcccb8265b07a832909238b678f0d';
  v_old_clause text;
  v_new_clause text;
BEGIN
  IF current_setting(
    'wos_v1.qa_v2_image_register_install_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_PROJECT_MISMATCH';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_REQUIRES_PG17';
  END IF;
  IF to_regprocedure(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'
    ) IS NULL
    OR to_regclass('public.wos_qa_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
    OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_PREREQUISITE_MISSING';
  END IF;
  IF to_regnamespace('wos_v1_qa_v2_image_register_compat') IS NOT NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_ALREADY_INSTALLED';
  END IF;

  v_definition := pg_get_functiondef(
    'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
  );
  v_source_sha256 := encode(
    sha256(convert_to(v_definition, 'UTF8')),
    'hex'
  );
  IF v_source_sha256 IS DISTINCT FROM
    'f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_SOURCE_MISMATCH';
  END IF;

  v_old_clause := $old$
 IF v_order.workflow_status <> 'DRAFT'
 OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;$old$;
  v_new_clause := $new$
 IF NOT (
  (
   v_order.workflow_status='DRAFT'
   AND v_order.version_label ~ '^V[1-9][0-9]{0,20}$'
  )
  OR (
   v_order.workflow_status='NEEDS_INFORMATION'
   AND v_order.version_label ~ '^V[2-9][0-9]{0,20}$'
  )
 )
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;$new$;
  IF position(v_old_clause IN v_definition) = 0 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_CLAUSE_MISSING';
  END IF;
  v_definition := replace(v_definition, v_old_clause, v_new_clause);
  v_target_sha256 := encode(
    sha256(convert_to(v_definition, 'UTF8')),
    'hex'
  );
  IF v_target_sha256 IS DISTINCT FROM v_expected_target_sha256 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_TARGET_MISMATCH expected=% actual=%',
      v_expected_target_sha256,
      v_target_sha256;
  END IF;

  CREATE SCHEMA wos_v1_qa_v2_image_register_compat;
  REVOKE ALL ON SCHEMA wos_v1_qa_v2_image_register_compat
    FROM PUBLIC, anon, authenticated;
  CREATE TABLE wos_v1_qa_v2_image_register_compat.definition_backup (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    function_definition text NOT NULL,
    source_sha256 text NOT NULL,
    target_sha256 text NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  ALTER TABLE wos_v1_qa_v2_image_register_compat.definition_backup
    ENABLE ROW LEVEL SECURITY;
  REVOKE ALL
    ON TABLE wos_v1_qa_v2_image_register_compat.definition_backup
    FROM PUBLIC, anon, authenticated;
  INSERT INTO wos_v1_qa_v2_image_register_compat.definition_backup(
    function_definition,
    source_sha256,
    target_sha256
  ) VALUES (
    pg_get_functiondef(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
    ),
    v_source_sha256,
    v_target_sha256
  );

  EXECUTE v_definition;

  IF encode(
      sha256(convert_to(
        pg_get_functiondef(
          'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
        ),
        'UTF8'
      )),
      'hex'
    ) IS DISTINCT FROM v_target_sha256
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_POSTFLIGHT_MISMATCH';
  END IF;
END;
$register_compat$;

COMMIT;

-- NOT_AUTHORIZED
