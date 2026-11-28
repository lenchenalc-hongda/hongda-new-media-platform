-- Disposable PG17 only. Simulates the pre-existing QA P2 safety schema.

CREATE SCHEMA wos_qa_safety;

CREATE TABLE wos_qa_safety.p2_gate_open_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name text NOT NULL,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE wos_qa_safety.p2_gate_close_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name text NOT NULL,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL
);

CREATE TABLE wos_qa_safety.p2_gate_watchdog_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gate_name text NOT NULL,
  observed_enabled boolean NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE wos_qa_safety.wos_policy_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  fingerprint text NOT NULL
);

CREATE TABLE wos_qa_safety.wos_function_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  fingerprint text NOT NULL
);

CREATE TABLE wos_qa_safety.wos_trigger_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  fingerprint text NOT NULL
);

CREATE TABLE wos_qa_safety.wos_acl_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  fingerprint text NOT NULL
);

CREATE TABLE wos_qa_safety.wos_proof_guard_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  fingerprint text NOT NULL
);

CREATE TABLE wos_qa_safety.wos_revision_install_marker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE wos_qa_safety.wos_revision_rollback_marker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rolled_back_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE wos_qa_safety.p2_guard_probe (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION wos_qa_safety.reap_expired_p2_gates()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 0
$$;

CREATE FUNCTION wos_qa_safety.p2_single_order_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER p2_single_order_write_guard
BEFORE UPDATE ON wos_qa_safety.p2_guard_probe
FOR EACH ROW
EXECUTE FUNCTION wos_qa_safety.p2_single_order_write_guard();

INSERT INTO wos_qa_safety.p2_gate_open_receipts(
  gate_name, organization_id, order_id
) VALUES
  (
    'OPERATOR_WRITES',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '71000000-0000-4000-8000-000000000101'
  ),
  (
    'OFFICE_WRITES',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '71000000-0000-4000-8000-000000000102'
  );

INSERT INTO wos_qa_safety.p2_gate_close_receipts(
  gate_name, organization_id, order_id, reason
) VALUES
  ('OPERATOR_WRITES', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
   '71000000-0000-4000-8000-000000000101', 'NORMAL_CLOSE'),
  ('OPERATOR_WRITES', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
   '71000000-0000-4000-8000-000000000103', 'WATCHDOG_CLOSE'),
  ('OPERATOR_WRITES', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
   '71000000-0000-4000-8000-000000000104', 'FAILURE_CLOSE'),
  ('OFFICE_WRITES', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
   '71000000-0000-4000-8000-000000000102', 'NORMAL_CLOSE'),
  ('OFFICE_WRITES', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
   '71000000-0000-4000-8000-000000000105', 'EXPIRY_CLOSE'),
  ('OFFICE_WRITES', '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
   '71000000-0000-4000-8000-000000000106', 'EXECUTOR_CLOSE');

INSERT INTO wos_qa_safety.p2_gate_watchdog_receipts(
  gate_name, observed_enabled
) VALUES
  ('OPERATOR_WRITES', true),
  ('OFFICE_WRITES', false);

INSERT INTO wos_qa_safety.wos_trigger_backup(fingerprint)
VALUES (repeat('a', 64));

INSERT INTO wos_qa_safety.p2_guard_probe(
  id, organization_id, order_id
) VALUES (
  '71000000-0000-4000-8000-000000000107',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '71000000-0000-4000-8000-000000000107'
);

REVOKE ALL ON SCHEMA wos_qa_safety FROM PUBLIC, anon, authenticated, service_role;
