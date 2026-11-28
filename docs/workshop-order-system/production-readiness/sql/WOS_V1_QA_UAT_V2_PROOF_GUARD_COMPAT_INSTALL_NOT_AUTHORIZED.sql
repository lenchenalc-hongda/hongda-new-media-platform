-- WOS V1 QA-only V2 revision proof compatibility install.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- Allows trusted proof generation for NEEDS_INFORMATION / V2+ while preserving
-- the existing DRAFT, QA-R, actor, organization, object and cleanup guards.

BEGIN;

DO $guard$
DECLARE
  v_proof_definition text;
  v_guard_definition text;
  v_proof_source_sha256 text;
  v_guard_source_sha256 text;
  v_proof_post_sha256 text;
  v_guard_post_sha256 text;
  v_expected_proof_post_sha256 text;
  v_expected_guard_post_sha256 text;
  v_old_clause text;
  v_new_clause text;
  v_old_status text;
  v_new_status text;
  v_old_guard text;
  v_new_guard text;
BEGIN
  IF current_setting(
    'wos_v1.qa_v2_proof_guard_install_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_PROOF_GUARD_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_PROJECT_MISMATCH';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_REQUIRES_PG17';
  END IF;
  IF to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    OR to_regprocedure('public.wos_qa_proof_write_guard()') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_PREREQUISITE_MISSING';
  END IF;
  IF to_regnamespace('wos_v1_qa_v2_proof_compat') IS NOT NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_ALREADY_INSTALLED';
  END IF;

  v_proof_definition := pg_get_functiondef(
    'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
  );
  v_guard_definition := pg_get_functiondef(
    'public.wos_qa_proof_write_guard()'::regprocedure
  );
  v_proof_source_sha256 := encode(
    sha256(convert_to(v_proof_definition, 'UTF8')),
    'hex'
  );
  v_guard_source_sha256 := encode(
    sha256(convert_to(v_guard_definition, 'UTF8')),
    'hex'
  );

  IF v_proof_source_sha256 NOT IN (
      '1433bdd5244077b1a34a2e7e58b37e5b665c7b5b59a1605544bb5e6854d87772',
      '2c1c1d46469159bc71a1ce17ab40a86eed854816cc2b6a69496f43148faab1e2',
      'b8af269c21de84bb490591ce5c71f379baef9e51e422a7978064eee3b0fefdde'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROOF_FUNCTION_SOURCE_MISMATCH';
  END IF;
  IF v_guard_source_sha256 NOT IN (
      '9a91e8e6441e0beee2c4fa3d4d410582784d3d310939c99007ac65f06d7a63fd',
      'f0944a6afc0ebc0017849274aa3e88b27f81cab6d5fee3e0aa7b0dc5d964c0db'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROOF_GUARD_SOURCE_MISMATCH';
  END IF;
  v_expected_proof_post_sha256 := CASE v_proof_source_sha256
    WHEN '1433bdd5244077b1a34a2e7e58b37e5b665c7b5b59a1605544bb5e6854d87772'
      THEN '0f1dcb8da6ae26da22150e0bed35e025e9618824d64993d0af5eec0a92cb7216'
    WHEN '2c1c1d46469159bc71a1ce17ab40a86eed854816cc2b6a69496f43148faab1e2'
      THEN 'b8af269c21de84bb490591ce5c71f379baef9e51e422a7978064eee3b0fefdde'
    WHEN 'b8af269c21de84bb490591ce5c71f379baef9e51e422a7978064eee3b0fefdde'
      THEN 'b8af269c21de84bb490591ce5c71f379baef9e51e422a7978064eee3b0fefdde'
  END;
  v_expected_guard_post_sha256 :=
    'f0944a6afc0ebc0017849274aa3e88b27f81cab6d5fee3e0aa7b0dc5d964c0db';

  CREATE SCHEMA wos_v1_qa_v2_proof_compat;
  REVOKE ALL ON SCHEMA wos_v1_qa_v2_proof_compat
    FROM PUBLIC, anon, authenticated;
  CREATE TABLE wos_v1_qa_v2_proof_compat.definition_backup (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    proof_definition text NOT NULL,
    guard_definition text NOT NULL,
    proof_source_sha256 text NOT NULL,
    guard_source_sha256 text NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  ALTER TABLE wos_v1_qa_v2_proof_compat.definition_backup
    ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE wos_v1_qa_v2_proof_compat.definition_backup
    FROM PUBLIC, anon, authenticated;
  INSERT INTO wos_v1_qa_v2_proof_compat.definition_backup(
    proof_definition,
    guard_definition,
    proof_source_sha256,
    guard_source_sha256
  ) VALUES (
    v_proof_definition,
    v_guard_definition,
    v_proof_source_sha256,
    v_guard_source_sha256
  );

  IF position(
      'v_order.workflow_status = ''NEEDS_INFORMATION'''
      IN v_proof_definition
    ) = 0
  THEN
    v_old_clause := $old$
      OR (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
      )$old$;
    v_new_clause := $new$
      OR (
        v_order.workflow_status = 'NEEDS_INFORMATION'
        AND v_order.version_label ~ '^V(?:[2-9]|[1-9][0-9]{1,20})$'
      )
      OR (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
      )$new$;
    v_proof_definition := replace(
      v_proof_definition,
      v_old_clause,
      v_new_clause
    );
    v_old_status := $old$
  IF v_order.workflow_status <> 'DRAFT'
    AND NOT ($old$;
    v_new_status := $new$
  IF v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')
    AND NOT ($new$;
    v_proof_definition := replace(
      v_proof_definition,
      v_old_status,
      v_new_status
    );
    IF position(
        'v_order.workflow_status = ''NEEDS_INFORMATION'''
        IN v_proof_definition
      ) = 0
      OR position(
        'v_order.workflow_status NOT IN (''DRAFT'', ''NEEDS_INFORMATION'')'
        IN v_proof_definition
      ) = 0
    THEN
      RAISE EXCEPTION 'WOS_V1_QA_UAT_PROOF_FUNCTION_REPLACEMENT_FAILED';
    END IF;
    EXECUTE v_proof_definition;
  END IF;

  IF position(
      'v_order.workflow_status=''NEEDS_INFORMATION'''
      IN v_guard_definition
    ) = 0
  THEN
    v_old_guard := $old$
 IF v_order.workflow_status='DRAFT' THEN
   NULL;
 ELSIF v_order.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')$old$;
    v_new_guard := $new$
 IF v_order.workflow_status='DRAFT' THEN
   NULL;
 ELSIF v_order.workflow_status='NEEDS_INFORMATION'
   AND v_order.version_label ~ '^V(?:[2-9]|[1-9][0-9]{1,20})$' THEN
   NULL;
 ELSIF v_order.workflow_status IN ('WAITING_MATERIAL','READINESS_CHECK')$new$;
    v_guard_definition := replace(
      v_guard_definition,
      v_old_guard,
      v_new_guard
    );
    IF position(
        'v_order.workflow_status=''NEEDS_INFORMATION'''
        IN v_guard_definition
      ) = 0
    THEN
      RAISE EXCEPTION 'WOS_V1_QA_UAT_PROOF_GUARD_REPLACEMENT_FAILED';
    END IF;
    EXECUTE v_guard_definition;
  END IF;

  v_proof_post_sha256 := encode(
    sha256(convert_to(
      pg_get_functiondef(
        'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
      ),
      'UTF8'
    )),
    'hex'
  );
  v_guard_post_sha256 := encode(
    sha256(convert_to(
      pg_get_functiondef(
        'public.wos_qa_proof_write_guard()'::regprocedure
      ),
      'UTF8'
    )),
    'hex'
  );
  IF v_proof_post_sha256 IS DISTINCT FROM v_expected_proof_post_sha256
    OR v_guard_post_sha256 IS DISTINCT FROM v_expected_guard_post_sha256
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_PROOF_GUARD_POSTFLIGHT_MISMATCH';
  END IF;
END;
$guard$;

COMMIT;

-- NOT_AUTHORIZED
