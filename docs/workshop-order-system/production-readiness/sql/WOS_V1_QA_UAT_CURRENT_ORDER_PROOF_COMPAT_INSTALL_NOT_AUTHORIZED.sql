-- WOS V1 QA-only current-order Proof refresh compatibility.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- Allows the reviewed QA UAT Edge wrapper to refresh Proofs for the exact
-- current V2+ order while preserving the ordinary DRAFT, NEEDS_INFORMATION,
-- QA-R, actor, organization, object and revision-gate checks.

BEGIN;

DO $guard$
DECLARE
  v_proof_definition text;
  v_source_definition text;
  v_wrapper_definition text;
  v_source_sha256 text;
  v_old_branch text;
  v_new_branch text;
  v_old_gate text;
  v_new_gate text;
  v_post_sha256 text;
BEGIN
  IF current_setting(
    'wos_v1.qa_current_order_proof_install_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_PROJECT_MISMATCH';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_REQUIRES_PG17';
  END IF;
  IF to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_edge_record_proof(uuid,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_PREREQUISITE_MISSING';
  END IF;
  IF to_regnamespace('wos_v1_qa_current_order_proof_compat') IS NOT NULL THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_ALREADY_INSTALLED';
  END IF;

  v_proof_definition := pg_get_functiondef(
    'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
  );
  v_wrapper_definition := pg_get_functiondef(
    'public.wos_v1_qa_uat_edge_record_proof(uuid,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
  );
  v_source_sha256 := encode(
    sha256(convert_to(v_proof_definition, 'UTF8')),
    'hex'
  );
  IF v_source_sha256 NOT IN (
    '0f1dcb8da6ae26da22150e0bed35e025e9618824d64993d0af5eec0a92cb7216',
    '330dd305519f5a9a44bd2f50ce4d648fafb70614ae358f76f5d1db2cee5040bf'
  )
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_SOURCE_MISMATCH';
  END IF;
  v_source_definition := v_proof_definition;
  IF position(
    'wos_v1.qa_current_order_proof'
    IN v_wrapper_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_WRAPPER_MARKER_MISSING';
  END IF;

  CREATE SCHEMA wos_v1_qa_current_order_proof_compat;
  REVOKE ALL ON SCHEMA wos_v1_qa_current_order_proof_compat
    FROM PUBLIC, anon, authenticated;
  CREATE TABLE wos_v1_qa_current_order_proof_compat.definition_backup (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    function_definition text NOT NULL,
    source_sha256 text NOT NULL,
    patched_definition text NOT NULL,
    patched_sha256 text NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  ALTER TABLE wos_v1_qa_current_order_proof_compat.definition_backup
    ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE
    wos_v1_qa_current_order_proof_compat.definition_backup
    FROM PUBLIC, anon, authenticated;

  v_old_branch := $old$
      OR (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
      )$old$;
  v_new_branch := $new$
      OR (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
      )
      OR (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND current_setting('wos_v1.qa_current_order_proof', true) = 'yes'
        AND v_order.version_label ~ '^V(?:[2-9]|[1-9][0-9]{1,20})$'
      )$new$;

  IF (
    length(v_proof_definition) - length(replace(
      v_proof_definition, v_old_branch, ''
    ))
  ) / length(v_old_branch) <> 1 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_BRANCH_COUNT_MISMATCH';
  END IF;
  v_proof_definition := replace(
    v_proof_definition,
    v_old_branch,
    v_new_branch
  );
  v_old_gate := $old$
      v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
      AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
      AND public.wos_qa_revision_gate_allows(
        v_order.id, v_order.organization_id, v_actor.id
      )$old$;
  v_new_gate := $new$
      (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND v_order.version_label ~ '^QA-R[1-9][0-9]*$'
        AND public.wos_qa_revision_gate_allows(
          v_order.id, v_order.organization_id, v_actor.id
        )
      )
      OR (
        v_order.workflow_status IN ('WAITING_MATERIAL', 'READINESS_CHECK')
        AND current_setting('wos_v1.qa_current_order_proof', true) = 'yes'
        AND v_order.version_label ~ '^V(?:[2-9]|[1-9][0-9]{1,20})$'
      )$new$;
  IF (
    length(v_proof_definition) - length(replace(
      v_proof_definition, v_old_gate, ''
    ))
  ) / length(v_old_gate) <> 1 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_GATE_COUNT_MISMATCH';
  END IF;
  v_proof_definition := replace(
    v_proof_definition,
    v_old_gate,
    v_new_gate
  );
  IF position(
    'wos_v1.qa_current_order_proof'
    IN v_proof_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_REPLACEMENT_FAILED';
  END IF;
  EXECUTE v_proof_definition;

  v_post_sha256 := encode(
    sha256(convert_to(
      pg_get_functiondef(
        'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
      ),
      'UTF8'
    )),
    'hex'
  );
  INSERT INTO wos_v1_qa_current_order_proof_compat.definition_backup(
    function_definition,
    source_sha256,
    patched_definition,
    patched_sha256
  ) VALUES (
    v_source_definition,
    v_source_sha256,
    pg_get_functiondef(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
    ),
    v_post_sha256
  );
END;
$guard$;

COMMIT;

-- NOT_AUTHORIZED
