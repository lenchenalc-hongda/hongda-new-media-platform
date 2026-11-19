-- WOS-PROD-READY-P0-02-02-P1-READONLY-IDENTITY-ATTESTOR
-- DESIGN ONLY. INSTALL_NOT_AUTHORIZED. Do not run from CI or this PR.
-- One-time, QA-only transaction for xulmpqaknlwqqculbsek.
-- QA project must be independently verified immediately before any future Owner grant.
-- Creates NOLOGIN / NO PASSWORD, no table grants, no RLS or Storage policy edits.
BEGIN;
DO $preflight$
BEGIN
  IF session_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'WOS_QA_OWNER_POSTGRES_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'wos_qa_readonly_preflight')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'wos_p1_preflight_private') THEN
    RAISE EXCEPTION 'WOS_QA_PREFLIGHT_ALREADY_INSTALLED' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM wos_mvp_qa.p1_execution_gate)
     OR EXISTS (SELECT 1 FROM wos_mvp_qa.p1_execution_gate
                 WHERE enabled IS DISTINCT FROM FALSE
                    OR enabled_until IS NOT NULL
                    OR approved_run_id IS NOT NULL
                    OR approved_sha IS NOT NULL) THEN
    RAISE EXCEPTION 'WOS_QA_P1_MUST_BE_OFF' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM wos_mvp_qa.p1_execution_gate) <> 1
     OR (SELECT count(*) FROM public.wos_qa_p2_execution_gate
           WHERE gate_name = 'OPERATOR_WRITES' AND enabled = FALSE AND enabled_until IS NULL) <> 1
     OR (SELECT count(*) FROM public.wos_qa_p2_office_execution_gate
           WHERE gate_name = 'OFFICE_WRITES' AND enabled = FALSE AND enabled_until IS NULL) <> 1
     OR (SELECT count(*) FROM public.wos_production_orders) <> 84
     OR (SELECT count(*) FROM public.wos_production_orders
          WHERE customer_id IS NULL OR project_id IS NULL) <> 83
     OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'wos-private') <> 83 THEN
    RAISE EXCEPTION 'WOS_QA_BASELINE_CHANGED_REAUTHORIZE' USING ERRCODE = '55000';
  END IF;
END
$preflight$;

CREATE ROLE wos_qa_readonly_preflight
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN
  NOREPLICATION NOBYPASSRLS PASSWORD NULL;

CREATE SCHEMA wos_p1_preflight_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA wos_p1_preflight_private FROM PUBLIC;

-- A single fixed-shape aggregation, no parameters, no dynamic SQL.
-- Intentional narrow RLS bypass: this SECURITY DEFINER is owned by postgres.
-- It must never be placed in public or any exposed Data API schema.
CREATE FUNCTION wos_p1_preflight_private.readonly_snapshot()
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $snapshot$
BEGIN
  IF session_user <> 'wos_qa_readonly_preflight' THEN
    RAISE EXCEPTION 'WOS_QA_PREFLIGHT_CALLER_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('transaction_read_only', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'WOS_QA_PREFLIGHT_READ_ONLY_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'proof_version', 'WOS_P1_QA_READONLY_V1',
    'qa_project_ref', 'xulmpqaknlwqqculbsek',
    'database', pg_catalog.current_database(),
    'checked_at', pg_catalog.clock_timestamp(),
    'p1_off', (
      SELECT count(*) = 1 AND coalesce(
        pg_catalog.bool_and(enabled = FALSE AND enabled_until IS NULL
          AND approved_run_id IS NULL AND approved_sha IS NULL), FALSE)
      FROM wos_mvp_qa.p1_execution_gate
    ),
    'p2_operator_off', (
      SELECT count(*) = 1 AND coalesce(
        pg_catalog.bool_and(enabled = FALSE AND enabled_until IS NULL), FALSE)
      FROM public.wos_qa_p2_execution_gate WHERE gate_name = 'OPERATOR_WRITES'
    ),
    'p2_office_off', (
      SELECT count(*) = 1 AND coalesce(
        pg_catalog.bool_and(enabled = FALSE AND enabled_until IS NULL), FALSE)
      FROM public.wos_qa_p2_office_execution_gate WHERE gate_name = 'OFFICE_WRITES'
    ),
    'orders', (SELECT count(*) FROM public.wos_production_orders),
    'null_cpc', (SELECT count(*) FROM public.wos_production_orders
      WHERE customer_id IS NULL OR project_id IS NULL),
    'private_objects', (SELECT count(*) FROM storage.objects
      WHERE bucket_id = 'wos-private'),
    'private_bucket', (SELECT public = FALSE FROM storage.buckets WHERE id = 'wos-private'),
    'image_proofs', (SELECT count(*) FROM wos_mvp_attestation.private_image_proofs),
    'cpc_bindings', (SELECT count(*) FROM wos_mvp_qa.cpc_order_bindings),
    'office_receipts', (SELECT count(*) FROM wos_mvp_attestation.office_document_receipts)
  );
END
$snapshot$;

-- Revoke PUBLIC function EXECUTE before the same transaction commits.
REVOKE ALL ON FUNCTION wos_p1_preflight_private.readonly_snapshot() FROM PUBLIC;
GRANT USAGE ON SCHEMA wos_p1_preflight_private TO wos_qa_readonly_preflight;
GRANT EXECUTE ON FUNCTION wos_p1_preflight_private.readonly_snapshot()
  TO wos_qa_readonly_preflight;

-- Verify role cannot use any other reachable SECURITY DEFINER function.
-- No login, password, table privilege, role membership or schema CREATE.
DO $verify$
BEGIN
  IF EXISTS (
     SELECT 1 FROM pg_catalog.pg_roles r
     WHERE r.rolname = 'wos_qa_readonly_preflight'
       AND (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
            OR r.rolbypassrls OR r.rolreplication OR r.rolinherit)
  ) THEN
    RAISE EXCEPTION 'WOS_QA_ROLE_IS_PRIVILEGED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member
    WHERE r.rolname = 'wos_qa_readonly_preflight'
  ) THEN
    RAISE EXCEPTION 'WOS_QA_ROLE_MEMBERSHIP_FORBIDDEN';
  END IF;
  IF pg_catalog.has_table_privilege('wos_qa_readonly_preflight',
       'public.wos_production_orders', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('wos_qa_readonly_preflight',
       'storage.objects', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('wos_qa_readonly_preflight',
       'wos_mvp_qa.p1_execution_gate', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('wos_qa_readonly_preflight',
       'public.wos_qa_p2_execution_gate', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('wos_qa_readonly_preflight',
       'public.wos_qa_p2_office_execution_gate', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'WOS_QA_DIRECT_TABLE_ACCESS_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND NOT (n.nspname = 'wos_p1_preflight_private'
               AND p.proname = 'readonly_snapshot')
      AND pg_catalog.has_schema_privilege('wos_qa_readonly_preflight', n.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('wos_qa_readonly_preflight', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'WOS_QA_EXTRA_SECURITY_DEFINER_EXECUTE_FORBIDDEN';
  END IF;
END
$verify$;
COMMIT;

-- NO ALTER ROLE ... LOGIN or password in this file.
-- Separate Owner authorization is required for authentication provisioning.
