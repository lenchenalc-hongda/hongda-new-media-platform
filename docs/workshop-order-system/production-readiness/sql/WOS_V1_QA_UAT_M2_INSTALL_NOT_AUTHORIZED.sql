-- QA-only adapter for the reviewed production M2 contract.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- This file never grants the production M2 entry points. Authenticated callers
-- can use only the wrappers after the separate activation file is applied.
BEGIN;

DO $guard$
DECLARE
  v_closer_active boolean:=false;
BEGIN
  IF current_setting('wos_v1.qa_uat_install_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROJECT_MISMATCH';
  END IF;
  IF to_regproc('public.wos_v1_m2_action') IS NULL
    OR to_regproc('public.wos_v1_authorize_production_start') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_M2_NOT_INSTALLED';
  END IF;
  IF to_regprocedure(
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
  ) IS NULL OR to_regclass('public.wos_qa_trusted_proof_receipts') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_DATABASE_NOT_IDENTIFIED';
  END IF;
  IF to_regclass('wos_v1_qa_closer.lifecycle') IS NOT NULL THEN
    EXECUTE $closer_active$
      SELECT EXISTS(
        SELECT 1 FROM wos_v1_qa_closer.lifecycle
        WHERE singleton=true AND public_api_owner='CLOSER_ONLY'
      )
    $closer_active$ INTO v_closer_active;
  ELSIF to_regclass('wos_v1_qa_closer.controls') IS NOT NULL THEN
    v_closer_active:=true;
  END IF;
  IF v_closer_active THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_ONLY_PUBLIC_API_OWNED';
  END IF;
END;
$guard$;

CREATE SCHEMA IF NOT EXISTS wos_v1_qa_uat;
REVOKE ALL ON SCHEMA wos_v1_qa_uat FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS wos_v1_qa_uat.write_gates (
  gate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id text NOT NULL CHECK (length(btrim(authorization_id)) BETWEEN 1 AND 120),
  project_ref text NOT NULL CHECK (project_ref='xulmpqaknlwqqculbsek'),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  allowed_actions text[] NOT NULL CHECK (
    cardinality(allowed_actions) BETWEEN 1 AND 6
    AND allowed_actions <@ ARRAY[
      'MATERIAL_RECORD',
      'BASELINE_SELECT',
      'BASELINE_OFFICE_CONFIRM',
      'BASELINE_WORKSHOP_CONFIRM',
      'FINAL_READINESS_CONFIRM',
      'START_RELEASE'
    ]::text[]
  ),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','CLOSED')),
  closed_at timestamptz,
  CHECK (expires_at>opened_at),
  CHECK (expires_at<=opened_at+interval '15 minutes'),
  CHECK ((state='OPEN' AND closed_at IS NULL)
      OR (state='CLOSED' AND closed_at IS NOT NULL)),
  UNIQUE (authorization_id,order_id,actor_profile_id)
);
ALTER TABLE wos_v1_qa_uat.write_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_uat.write_gates
  FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS wos_v1_qa_uat_write_gates_lookup_idx
  ON wos_v1_qa_uat.write_gates(order_id,actor_profile_id,state,expires_at);

CREATE TABLE IF NOT EXISTS wos_v1_qa_uat.closeout_controls (
  execution_id uuid PRIMARY KEY,
  authorization_id text NOT NULL UNIQUE CHECK (
    authorization_id LIKE 'WOS-V1-PRODUCTION-M2-QA-UAT-%'
  ),
  project_ref text NOT NULL CHECK (project_ref='xulmpqaknlwqqculbsek'),
  code_sha256 text NOT NULL CHECK (code_sha256 ~ '^[a-f0-9]{64}$'),
  arm_token uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  write_deadline_at timestamptz NOT NULL,
  db_cleanup_deadline_at timestamptz NOT NULL,
  edge_cleanup_deadline_at timestamptz NOT NULL,
  db_state text NOT NULL DEFAULT 'ARMED'
    CHECK (db_state IN ('ARMED','CLOSED')),
  edge_state text NOT NULL DEFAULT 'ARMED'
    CHECK (edge_state IN ('ARMED','CLOSED')),
  db_closed_at timestamptz,
  edge_closed_at timestamptz,
  authorized_order_id uuid,
  authorized_organization_id uuid,
  authorized_create_request_id uuid
    REFERENCES public.wos_order_create_receipts(request_id),
  authorized_actor_profile_id uuid REFERENCES public.profiles(id),
  authorized_payload_fingerprint text,
  authorized_order_number text,
  authorized_customer_id uuid
    REFERENCES public.cpc_customer_references(id),
  authorized_project_id uuid REFERENCES public.cpc_projects(id),
  db_last_heartbeat_at timestamptz,
  edge_last_heartbeat_at timestamptz,
  edge_process_nonce uuid,
  db_cron_job_id bigint,
  edge_job_label text,
  close_reason text,
  CHECK (write_deadline_at=opened_at+interval '480 seconds'),
  CHECK (db_cleanup_deadline_at=opened_at+interval '540 seconds'),
  CHECK (edge_cleanup_deadline_at=opened_at+interval '840 seconds'),
  CHECK ((db_state='ARMED' AND db_closed_at IS NULL)
      OR (db_state='CLOSED' AND db_closed_at IS NOT NULL)),
  CHECK ((edge_state='ARMED' AND edge_closed_at IS NULL)
      OR (edge_state='CLOSED' AND edge_closed_at IS NOT NULL))
);
ALTER TABLE wos_v1_qa_uat.closeout_controls
  ADD COLUMN IF NOT EXISTS authorized_create_request_id uuid
    REFERENCES public.wos_order_create_receipts(request_id),
  ADD COLUMN IF NOT EXISTS authorized_actor_profile_id uuid
    REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS authorized_payload_fingerprint text,
  ADD COLUMN IF NOT EXISTS authorized_order_number text,
  ADD COLUMN IF NOT EXISTS authorized_customer_id uuid
    REFERENCES public.cpc_customer_references(id),
  ADD COLUMN IF NOT EXISTS authorized_project_id uuid
    REFERENCES public.cpc_projects(id);
ALTER TABLE wos_v1_qa_uat.closeout_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_uat.closeout_controls
  FROM PUBLIC,anon,authenticated;

DO $migrate_authorization_check$
DECLARE
  v_constraint text;
BEGIN
  IF EXISTS(
    SELECT 1
    FROM wos_v1_qa_uat.closeout_controls control
    WHERE control.authorization_id
      !~ '^WOS-V1-PRODUCTION-M2-QA-UAT-[0-9]{3}$'
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_AUTHORIZATION_AUDIT_INVALID';
  END IF;
  FOR v_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid=
        'wos_v1_qa_uat.closeout_controls'::regclass
      AND constraint_row.contype='c'
      AND pg_get_constraintdef(constraint_row.oid)
        LIKE '%authorization_id%'
      AND constraint_row.conkey=ARRAY[
        (
          SELECT attribute_row.attnum
          FROM pg_attribute attribute_row
          WHERE attribute_row.attrelid=
              'wos_v1_qa_uat.closeout_controls'::regclass
            AND attribute_row.attname='authorization_id'
        )
      ]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE wos_v1_qa_uat.closeout_controls DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
  ALTER TABLE wos_v1_qa_uat.closeout_controls
    ADD CONSTRAINT wos_v1_qa_uat_controls_authorization_id_check
    CHECK (
      authorization_id ~ '^WOS-V1-PRODUCTION-M2-QA-UAT-[0-9]{3}$'
    );
END;
$migrate_authorization_check$;

CREATE TABLE IF NOT EXISTS wos_v1_qa_uat.closer_arm_receipts (
  execution_id uuid NOT NULL
    REFERENCES wos_v1_qa_uat.closeout_controls(execution_id),
  closer_kind text NOT NULL CHECK (closer_kind IN ('DB','EDGE')),
  authorization_id text NOT NULL,
  project_ref text NOT NULL CHECK (project_ref='xulmpqaknlwqqculbsek'),
  code_sha256 text NOT NULL CHECK (code_sha256 ~ '^[a-f0-9]{64}$'),
  arm_token uuid NOT NULL,
  executor_kind text NOT NULL CHECK (executor_kind IN ('PG_CRON','LAUNCHD')),
  write_deadline_at timestamptz NOT NULL,
  cleanup_deadline_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'ARMED' CHECK (state='ARMED'),
  PRIMARY KEY(execution_id,closer_kind)
);
ALTER TABLE wos_v1_qa_uat.closer_arm_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_uat.closer_arm_receipts
  FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS wos_v1_qa_uat.closer_close_receipts (
  execution_id uuid NOT NULL
    REFERENCES wos_v1_qa_uat.closeout_controls(execution_id),
  closer_kind text NOT NULL CHECK (closer_kind IN ('DB','EDGE')),
  authorization_id text NOT NULL,
  project_ref text NOT NULL CHECK (project_ref='xulmpqaknlwqqculbsek'),
  code_sha256 text NOT NULL CHECK (code_sha256 ~ '^[a-f0-9]{64}$'),
  request_id uuid NOT NULL,
  closed_at timestamptz NOT NULL,
  cleanup_deadline_at timestamptz NOT NULL,
  timely boolean NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY(execution_id,closer_kind)
);
ALTER TABLE wos_v1_qa_uat.closer_close_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_uat.closer_close_receipts
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.guard_closeout_control_identity()
RETURNS trigger
LANGUAGE plpgsql SET search_path=''
AS $guard_control$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_AUDIT_DELETE_FORBIDDEN';
  END IF;
  IF NEW.execution_id IS DISTINCT FROM OLD.execution_id
    OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
    OR NEW.project_ref IS DISTINCT FROM OLD.project_ref
    OR NEW.code_sha256 IS DISTINCT FROM OLD.code_sha256
    OR NEW.arm_token IS DISTINCT FROM OLD.arm_token
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
    OR NEW.write_deadline_at IS DISTINCT FROM OLD.write_deadline_at
    OR NEW.db_cleanup_deadline_at IS DISTINCT FROM OLD.db_cleanup_deadline_at
    OR NEW.edge_cleanup_deadline_at IS DISTINCT FROM OLD.edge_cleanup_deadline_at
  THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD.db_state='CLOSED' AND NEW.db_state<>'CLOSED' THEN
    RAISE EXCEPTION 'QA_UAT_DB_CLOSER_REOPEN_FORBIDDEN';
  END IF;
  IF OLD.edge_state='CLOSED' AND NEW.edge_state<>'CLOSED' THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_CLOSER_REOPEN_FORBIDDEN';
  END IF;
  IF OLD.authorized_order_id IS NOT NULL
    AND NEW.authorized_order_id IS DISTINCT FROM OLD.authorized_order_id
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_ORDER_IMMUTABLE';
  END IF;
  IF OLD.authorized_organization_id IS NOT NULL
    AND NEW.authorized_organization_id IS DISTINCT FROM OLD.authorized_organization_id
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_ORGANIZATION_IMMUTABLE';
  END IF;
  IF OLD.authorized_create_request_id IS NOT NULL
    AND NEW.authorized_create_request_id
      IS DISTINCT FROM OLD.authorized_create_request_id
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_CREATE_REQUEST_IMMUTABLE';
  END IF;
  IF OLD.authorized_actor_profile_id IS NOT NULL
    AND NEW.authorized_actor_profile_id
      IS DISTINCT FROM OLD.authorized_actor_profile_id
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_ACTOR_IMMUTABLE';
  END IF;
  IF OLD.authorized_payload_fingerprint IS NOT NULL
    AND NEW.authorized_payload_fingerprint
      IS DISTINCT FROM OLD.authorized_payload_fingerprint
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_CREATE_FINGERPRINT_IMMUTABLE';
  END IF;
  IF OLD.authorized_order_number IS NOT NULL
    AND NEW.authorized_order_number
      IS DISTINCT FROM OLD.authorized_order_number
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_ORDER_NUMBER_IMMUTABLE';
  END IF;
  IF OLD.authorized_customer_id IS NOT NULL
    AND NEW.authorized_customer_id IS DISTINCT FROM OLD.authorized_customer_id
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_CUSTOMER_IMMUTABLE';
  END IF;
  IF OLD.authorized_project_id IS NOT NULL
    AND NEW.authorized_project_id IS DISTINCT FROM OLD.authorized_project_id
  THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZED_PROJECT_IMMUTABLE';
  END IF;
  IF OLD.edge_process_nonce IS NOT NULL
    AND NEW.edge_process_nonce IS DISTINCT FROM OLD.edge_process_nonce
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_PROCESS_NONCE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$guard_control$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.guard_closeout_control_identity()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wos_v1_qa_uat_closeout_control_guard
  ON wos_v1_qa_uat.closeout_controls;
CREATE TRIGGER wos_v1_qa_uat_closeout_control_guard
BEFORE UPDATE OR DELETE ON wos_v1_qa_uat.closeout_controls
FOR EACH ROW EXECUTE FUNCTION wos_v1_qa_uat.guard_closeout_control_identity();

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.assert_write_open(
  p_authorization_id text,
  p_order_id uuid
) RETURNS wos_v1_qa_uat.closeout_controls
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $assert_open$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.authorization_id=p_authorization_id
    AND control.project_ref='xulmpqaknlwqqculbsek'
  FOR SHARE;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED' THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_CLOSED' USING ERRCODE='42501';
  END IF;
  IF clock_timestamp()>=v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_UAT_WRITE_DEADLINE_EXPIRED' USING ERRCODE='42501';
  END IF;
  IF v_control.authorized_order_id IS NULL
    OR v_control.authorized_order_id<>p_order_id
    OR v_control.authorized_create_request_id IS NULL
    OR v_control.authorized_actor_profile_id IS NULL
    OR v_control.authorized_payload_fingerprint IS NULL
    OR v_control.authorized_order_number IS NULL
    OR v_control.authorized_customer_id IS NULL
    OR v_control.authorized_project_id IS NULL
  THEN
    RAISE EXCEPTION 'QA_UAT_ORDER_NOT_BOUND' USING ERRCODE='42501';
  END IF;
  PERFORM 1
  FROM public.wos_production_orders production_order
  JOIN public.wos_order_create_receipts create_receipt
    ON create_receipt.request_id=v_control.authorized_create_request_id
    AND create_receipt.order_id=production_order.id
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=v_control.authorized_organization_id
    AND production_order.created_by_profile_id=
      v_control.authorized_actor_profile_id
    AND production_order.sales_owner_profile_id=
      v_control.authorized_actor_profile_id
    AND production_order.order_number=v_control.authorized_order_number
    AND production_order.order_number=
      'QA-NONPROD-'||v_control.authorized_create_request_id::text
    AND production_order.customer_id=v_control.authorized_customer_id
    AND production_order.project_id=v_control.authorized_project_id
    AND create_receipt.organization_id=v_control.authorized_organization_id
    AND create_receipt.actor_profile_id=v_control.authorized_actor_profile_id
    AND create_receipt.payload_fingerprint=
      v_control.authorized_payload_fingerprint
    AND create_receipt.response_json->>'status' IN ('CREATED','REPLAYED')
    AND create_receipt.response_json->>'orderId'=p_order_id::text
    AND create_receipt.response_json->>'requestId'=
      v_control.authorized_create_request_id::text
  FOR SHARE OF production_order,create_receipt;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_ORDER_BINDING_DRIFT' USING ERRCODE='42501';
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
    OR v_control.edge_last_heartbeat_at IS NULL
    OR v_control.edge_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
  THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_HEARTBEAT_STALE' USING ERRCODE='42501';
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_qa_uat.closer_arm_receipts receipt
    WHERE receipt.execution_id=v_control.execution_id
      AND receipt.authorization_id=p_authorization_id
      AND receipt.project_ref='xulmpqaknlwqqculbsek'
      AND receipt.code_sha256=v_control.code_sha256
      AND receipt.arm_token=v_control.arm_token
      AND receipt.write_deadline_at=v_control.write_deadline_at
      AND receipt.state='ARMED'
      AND (
        (
          receipt.closer_kind='DB'
          AND receipt.executor_kind='PG_CRON'
          AND receipt.cleanup_deadline_at=v_control.db_cleanup_deadline_at
        )
        OR (
          receipt.closer_kind='EDGE'
          AND receipt.executor_kind='LAUNCHD'
          AND receipt.cleanup_deadline_at=v_control.edge_cleanup_deadline_at
        )
      )
  )<>2 THEN
    RAISE EXCEPTION 'QA_UAT_CLOSERS_NOT_ARMED' USING ERRCODE='42501';
  END IF;
  RETURN v_control;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_CLOSERS_NOT_ARMED' USING ERRCODE='42501';
END;
$assert_open$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.assert_write_open(text,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.arm_db_closer(
  p_execution_id uuid,
  p_arm_token uuid,
  p_authorization_id text,
  p_project_ref text,
  p_code_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $arm_db$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-004'
    OR p_project_ref<>'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_SCOPE_MISMATCH';
  END IF;
  IF p_code_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_CODE_SHA_INVALID';
  END IF;
  INSERT INTO wos_v1_qa_uat.closeout_controls(
    execution_id,authorization_id,project_ref,code_sha256,arm_token,opened_at,
    write_deadline_at,db_cleanup_deadline_at,edge_cleanup_deadline_at
  ) VALUES(
    p_execution_id,p_authorization_id,p_project_ref,p_code_sha256,p_arm_token,
    v_now,
    v_now+interval '480 seconds',
    v_now+interval '540 seconds',
    v_now+interval '840 seconds'
  )
  ON CONFLICT (execution_id) DO NOTHING;
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.authorization_id<>p_authorization_id
    OR v_control.project_ref<>p_project_ref
    OR v_control.code_sha256<>p_code_sha256
    OR v_control.arm_token<>p_arm_token
  THEN
    RAISE EXCEPTION 'QA_UAT_DB_CLOSER_ARM_CONFLICT';
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    RAISE EXCEPTION 'QA_UAT_DB_CLOSER_ALREADY_CLOSED';
  END IF;
  RETURN jsonb_build_object(
    'status','PENDING_HEARTBEAT',
    'executionId',p_execution_id,
    'authorizationId',p_authorization_id,
    'projectRef',p_project_ref,
    'codeSha256',p_code_sha256,
    'dbArmToken',p_arm_token,
    'writeDeadlineAt',v_control.write_deadline_at,
    'dbCleanupDeadlineAt',v_control.db_cleanup_deadline_at,
    'edgeCleanupDeadlineAt',v_control.edge_cleanup_deadline_at
  );
END;
$arm_db$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.arm_db_closer(
  uuid,uuid,text,text,text
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.record_db_heartbeat(
  p_execution_id uuid,
  p_arm_token uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $db_heartbeat$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.arm_token<>p_arm_token
    OR v_control.db_state<>'ARMED'
    OR v_control.edge_state<>'ARMED'
  THEN
    RAISE EXCEPTION 'QA_UAT_DB_HEARTBEAT_SCOPE_DENIED';
  END IF;
  IF v_now>=v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_UAT_WRITE_DEADLINE_EXPIRED';
  END IF;
  UPDATE wos_v1_qa_uat.closeout_controls
  SET db_last_heartbeat_at=v_now
  WHERE execution_id=p_execution_id;
  INSERT INTO wos_v1_qa_uat.closer_arm_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    arm_token,executor_kind,write_deadline_at,cleanup_deadline_at,heartbeat_at
  ) VALUES(
    p_execution_id,'DB',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_arm_token,'PG_CRON',v_control.write_deadline_at,
    v_control.db_cleanup_deadline_at,v_now
  )
  ON CONFLICT (execution_id,closer_kind) DO UPDATE
  SET heartbeat_at=EXCLUDED.heartbeat_at
  WHERE wos_v1_qa_uat.closer_arm_receipts.executor_kind='PG_CRON'
    AND wos_v1_qa_uat.closer_arm_receipts.arm_token=EXCLUDED.arm_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_DB_HEARTBEAT_CONFLICT';
  END IF;
  RETURN jsonb_build_object(
    'status','ARMED',
    'executionId',p_execution_id,
    'executorKind','PG_CRON',
    'heartbeatAt',v_now
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_DB_CLOSER_CONTROL_MISSING';
END;
$db_heartbeat$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.record_db_heartbeat(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.record_edge_heartbeat(
  p_execution_id uuid,
  p_arm_token uuid,
  p_process_nonce uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_heartbeat$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.arm_token<>p_arm_token
    OR v_control.code_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_HEARTBEAT_SCOPE_DENIED';
  END IF;
  IF v_now>=v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_UAT_WRITE_DEADLINE_EXPIRED';
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_CLOSER_ALREADY_CLOSED';
  END IF;
  IF v_control.edge_process_nonce IS NOT NULL
    AND v_control.edge_process_nonce<>p_process_nonce
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_PROCESS_NONCE_CONFLICT';
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<v_now-interval '30 seconds'
    OR NOT EXISTS(
      SELECT 1 FROM wos_v1_qa_uat.closer_arm_receipts receipt
      WHERE receipt.execution_id=p_execution_id
        AND receipt.closer_kind='DB'
        AND receipt.executor_kind='PG_CRON'
    )
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_DB_HEARTBEAT_REQUIRED';
  END IF;
  UPDATE wos_v1_qa_uat.closeout_controls
  SET edge_process_nonce=coalesce(edge_process_nonce,p_process_nonce),
      edge_last_heartbeat_at=v_now
  WHERE execution_id=p_execution_id;
  INSERT INTO wos_v1_qa_uat.closer_arm_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    arm_token,executor_kind,write_deadline_at,cleanup_deadline_at,heartbeat_at
  ) VALUES(
    p_execution_id,'EDGE',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_arm_token,'LAUNCHD',v_control.write_deadline_at,
    v_control.edge_cleanup_deadline_at,v_now
  )
  ON CONFLICT (execution_id,closer_kind) DO UPDATE
  SET heartbeat_at=EXCLUDED.heartbeat_at
  WHERE wos_v1_qa_uat.closer_arm_receipts.executor_kind='LAUNCHD'
    AND wos_v1_qa_uat.closer_arm_receipts.arm_token=EXCLUDED.arm_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_HEARTBEAT_CONFLICT';
  END IF;
  RETURN jsonb_build_object(
    'status','ARMED',
    'executionId',p_execution_id,
    'executorKind','LAUNCHD',
    'processNonce',p_process_nonce,
    'heartbeatAt',v_now
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_EDGE_CLOSER_CONTROL_MISSING';
END;
$edge_heartbeat$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.record_edge_heartbeat(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.bind_qa_uat_order(
  p_execution_id uuid,
  p_create_request_id uuid,
  p_order_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_payload_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $bind_order$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_receipt public.wos_order_create_receipts%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED'
    OR clock_timestamp()>=v_control.write_deadline_at
  THEN
    RAISE EXCEPTION 'QA_UAT_ORDER_BIND_WINDOW_CLOSED';
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.edge_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
    OR v_control.edge_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
  THEN
    RAISE EXCEPTION 'QA_UAT_CLOSER_HEARTBEAT_REQUIRED';
  END IF;
  IF p_payload_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'QA_UAT_ORDER_BIND_FINGERPRINT_INVALID';
  END IF;
  SELECT * INTO STRICT v_receipt
  FROM public.wos_order_create_receipts receipt
  WHERE receipt.request_id=p_create_request_id
    AND receipt.order_id=p_order_id
    AND receipt.organization_id=p_organization_id
    AND receipt.actor_profile_id=p_actor_profile_id
    AND receipt.payload_fingerprint=p_payload_fingerprint
    AND receipt.response_json->>'status' IN ('CREATED','REPLAYED')
    AND receipt.response_json->>'orderId'=p_order_id::text
    AND receipt.response_json->>'requestId'=p_create_request_id::text
  FOR SHARE;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=p_organization_id
    AND production_order.created_by_profile_id=p_actor_profile_id
    AND production_order.sales_owner_profile_id=p_actor_profile_id
    AND production_order.order_number=
      'QA-NONPROD-'||p_create_request_id::text
    AND production_order.customer_id IS NOT NULL
    AND production_order.project_id IS NOT NULL
  FOR SHARE;
  IF v_control.authorized_order_id IS NOT NULL THEN
    IF v_control.authorized_order_id<>p_order_id
      OR v_control.authorized_organization_id<>p_organization_id
      OR v_control.authorized_create_request_id<>p_create_request_id
      OR v_control.authorized_actor_profile_id<>p_actor_profile_id
      OR v_control.authorized_payload_fingerprint<>p_payload_fingerprint
      OR v_control.authorized_order_number<>v_order.order_number
      OR v_control.authorized_customer_id<>v_order.customer_id
      OR v_control.authorized_project_id<>v_order.project_id
    THEN
      RAISE EXCEPTION 'QA_UAT_ORDER_BIND_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status','REPLAYED',
      'executionId',p_execution_id,
      'orderId',p_order_id,
      'organizationId',p_organization_id,
      'createRequestId',p_create_request_id
    );
  END IF;
  UPDATE wos_v1_qa_uat.closeout_controls
  SET authorized_order_id=p_order_id,
      authorized_organization_id=p_organization_id,
      authorized_create_request_id=p_create_request_id,
      authorized_actor_profile_id=p_actor_profile_id,
      authorized_payload_fingerprint=p_payload_fingerprint,
      authorized_order_number=v_order.order_number,
      authorized_customer_id=v_order.customer_id,
      authorized_project_id=v_order.project_id
  WHERE execution_id=p_execution_id;
  RETURN jsonb_build_object(
    'status','BOUND',
    'executionId',p_execution_id,
    'orderId',p_order_id,
    'organizationId',p_organization_id,
    'createRequestId',p_create_request_id,
    'actorProfileId',p_actor_profile_id,
    'payloadFingerprint',p_payload_fingerprint,
    'orderNumber',v_order.order_number,
    'customerId',v_order.customer_id,
    'projectId',v_order.project_id
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'QA_UAT_ORDER_BIND_SCOPE_DENIED';
END;
$bind_order$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.bind_qa_uat_order(
  uuid,uuid,uuid,uuid,uuid,text
)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.revoke_qa_wrappers()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $revoke$
BEGIN
  IF to_regprocedure(
    'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb) FROM authenticated';
  END IF;
  IF to_regprocedure(
    'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text) FROM authenticated';
  END IF;
  RETURN true;
END;
$revoke$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.revoke_qa_wrappers()
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.unschedule_db_cron(
  p_execution_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $unschedule_cron$
DECLARE
  v_job_id bigint;
  v_removed boolean;
BEGIN
  SELECT control.db_cron_job_id INTO v_job_id
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_DB_CLOSER_CONTROL_MISSING';
  END IF;
  IF v_job_id IS NULL THEN
    RETURN true;
  END IF;
  IF to_regclass('cron.job') IS NULL
    OR to_regprocedure('cron.unschedule(bigint)') IS NULL
  THEN
    RETURN false;
  END IF;
  BEGIN
    EXECUTE format('SELECT cron.unschedule(%s)',v_job_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT NOT EXISTS(
    SELECT 1 FROM cron.job job WHERE job.jobid=v_job_id
  ) INTO v_removed;
  RETURN coalesce(v_removed,false);
END;
$unschedule_cron$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.unschedule_db_cron(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.close_db_closer(
  p_execution_id uuid,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $close_db$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_existing wos_v1_qa_uat.closer_close_receipts%ROWTYPE;
  v_closed_at timestamptz;
  v_timely boolean;
  v_cron_unscheduled boolean:=false;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.db_state='CLOSED' THEN
    SELECT * INTO STRICT v_existing
    FROM wos_v1_qa_uat.closer_close_receipts receipt
    WHERE receipt.execution_id=p_execution_id
      AND receipt.closer_kind='DB';
    v_cron_unscheduled:=wos_v1_qa_uat.unschedule_db_cron(p_execution_id);
    RETURN jsonb_build_object(
      'status','REPLAYED','executionId',p_execution_id,
      'closedAt',v_existing.closed_at,'timely',v_existing.timely,
      'deadlineAt',v_existing.cleanup_deadline_at,
      'cronUnscheduled',v_cron_unscheduled
    );
  END IF;
  v_closed_at:=clock_timestamp();
  v_timely:=v_closed_at<=v_control.db_cleanup_deadline_at;
  UPDATE wos_v1_qa_uat.write_gates
  SET state='CLOSED',closed_at=coalesce(closed_at,v_closed_at)
  WHERE project_ref='xulmpqaknlwqqculbsek'
    AND authorization_id=v_control.authorization_id
    AND state='OPEN';
  PERFORM wos_v1_qa_uat.revoke_qa_wrappers();
  INSERT INTO wos_v1_qa_uat.closer_close_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    request_id,closed_at,cleanup_deadline_at,timely,reason
  ) VALUES(
    p_execution_id,'DB',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_request_id,v_closed_at,
    v_control.db_cleanup_deadline_at,v_timely,left(p_reason,200)
  );
  UPDATE wos_v1_qa_uat.closeout_controls
  SET db_state='CLOSED',db_closed_at=v_closed_at,close_reason=left(p_reason,200)
  WHERE execution_id=p_execution_id;
  v_cron_unscheduled:=wos_v1_qa_uat.unschedule_db_cron(p_execution_id);
  RETURN jsonb_build_object(
    'status','CLOSED','executionId',p_execution_id,
    'closedAt',v_closed_at,'timely',v_timely,
    'deadlineAt',v_control.db_cleanup_deadline_at,
    'cronUnscheduled',v_cron_unscheduled
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_DB_CLOSER_CONTROL_MISSING';
END;
$close_db$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.close_db_closer(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.close_edge_closer(
  p_execution_id uuid,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $close_edge$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_existing wos_v1_qa_uat.closer_close_receipts%ROWTYPE;
  v_closed_at timestamptz;
  v_timely boolean;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.edge_state='CLOSED' THEN
    SELECT * INTO STRICT v_existing
    FROM wos_v1_qa_uat.closer_close_receipts receipt
    WHERE receipt.execution_id=p_execution_id
      AND receipt.closer_kind='EDGE';
    RETURN jsonb_build_object(
      'status','REPLAYED','executionId',p_execution_id,
      'closedAt',v_existing.closed_at,'timely',v_existing.timely
    );
  END IF;
  v_closed_at:=clock_timestamp();
  v_timely:=v_closed_at<=v_control.edge_cleanup_deadline_at;
  INSERT INTO wos_v1_qa_uat.closer_close_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    request_id,closed_at,cleanup_deadline_at,timely,reason
  ) VALUES(
    p_execution_id,'EDGE',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_request_id,v_closed_at,
    v_control.edge_cleanup_deadline_at,v_timely,left(p_reason,200)
  );
  UPDATE wos_v1_qa_uat.closeout_controls
  SET edge_state='CLOSED',edge_closed_at=v_closed_at,close_reason=left(p_reason,200)
  WHERE execution_id=p_execution_id;
  RETURN jsonb_build_object(
    'status','CLOSED','executionId',p_execution_id,
    'closedAt',v_closed_at,'timely',v_timely,
    'deadlineAt',v_control.edge_cleanup_deadline_at
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_EDGE_CLOSER_CONTROL_MISSING';
END;
$close_edge$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.close_edge_closer(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.db_close_tick(
  p_execution_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $db_tick$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id;
  IF v_control.db_state='CLOSED' THEN
    RETURN wos_v1_qa_uat.close_db_closer(
      p_execution_id,p_request_id,'SCHEDULED_DB_CLOSE'
    );
  END IF;
  IF clock_timestamp()<v_control.write_deadline_at THEN
    PERFORM wos_v1_qa_uat.record_db_heartbeat(
      p_execution_id,
      v_control.arm_token
    );
    RETURN jsonb_build_object(
      'status','WAITING',
      'executionId',p_execution_id,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  RETURN wos_v1_qa_uat.close_db_closer(
    p_execution_id,p_request_id,'SCHEDULED_DB_CLOSE'
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_DB_CLOSER_CONTROL_MISSING';
END;
$db_tick$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.db_close_tick(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.edge_close_tick(
  p_execution_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_tick$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id;
  IF v_control.edge_state='CLOSED' THEN
    RETURN wos_v1_qa_uat.close_edge_closer(
      p_execution_id,p_request_id,'SCHEDULED_EDGE_CLOSE'
    );
  END IF;
  IF clock_timestamp()<v_control.write_deadline_at THEN
    RETURN jsonb_build_object(
      'status','WAITING',
      'executionId',p_execution_id,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  RETURN wos_v1_qa_uat.close_edge_closer(
    p_execution_id,p_request_id,'SCHEDULED_EDGE_CLOSE'
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_EDGE_CLOSER_CONTROL_MISSING';
END;
$edge_tick$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.edge_close_tick(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.closer_status(
  p_execution_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $status$
  SELECT jsonb_build_object(
    'status','FOUND',
    'executionId',control.execution_id,
    'authorizationId',control.authorization_id,
    'projectRef',control.project_ref,
    'codeSha256',control.code_sha256,
    'openedAt',control.opened_at,
    'writeDeadlineAt',control.write_deadline_at,
    'dbCleanupDeadlineAt',control.db_cleanup_deadline_at,
    'edgeCleanupDeadlineAt',control.edge_cleanup_deadline_at,
    'dbCronJobId',control.db_cron_job_id,
    'authorizedOrderId',control.authorized_order_id,
    'authorizedOrganizationId',control.authorized_organization_id,
    'authorizedCreateRequestId',control.authorized_create_request_id,
    'authorizedActorProfileId',control.authorized_actor_profile_id,
    'authorizedPayloadFingerprint',control.authorized_payload_fingerprint,
    'authorizedOrderNumber',control.authorized_order_number,
    'authorizedCustomerId',control.authorized_customer_id,
    'authorizedProjectId',control.authorized_project_id,
    'dbLastHeartbeatAt',control.db_last_heartbeat_at,
    'edgeLastHeartbeatAt',control.edge_last_heartbeat_at,
    'edgeProcessNonce',control.edge_process_nonce,
    'dbState',control.db_state,
    'edgeState',control.edge_state,
    'armedKinds',(
      SELECT jsonb_agg(receipt.closer_kind ORDER BY receipt.closer_kind)
      FROM wos_v1_qa_uat.closer_arm_receipts receipt
      WHERE receipt.execution_id=control.execution_id
    ),
    'executorKinds',(
      SELECT jsonb_agg(receipt.executor_kind ORDER BY receipt.closer_kind)
      FROM wos_v1_qa_uat.closer_arm_receipts receipt
      WHERE receipt.execution_id=control.execution_id
    ),
    'openGateCount',(
      SELECT count(*) FROM wos_v1_qa_uat.write_gates gate
      WHERE gate.authorization_id=control.authorization_id
        AND gate.state='OPEN'
    ),
    'm2AuthenticatedExecute',has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    ),
    'releaseAuthenticatedExecute',has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)',
      'EXECUTE'
    )
  )
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id
$status$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.closer_status(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_write_allowed(
  p_authorization_id text,
  p_project_ref text,
  p_execution_id uuid,
  p_process_nonce uuid,
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_order_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_allowed$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
BEGIN
  IF p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-004'
    OR p_project_ref<>'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_SCOPE_MISMATCH' USING ERRCODE='42501';
  END IF;
  PERFORM 1
  FROM public.profiles profile
  JOIN public.wos_production_orders production_order
    ON production_order.id=p_order_id
    AND production_order.organization_id=p_organization_id
    AND production_order.order_number LIKE 'QA-NONPROD-%'
  WHERE profile.id=p_actor_profile_id
    AND profile.org_id=p_organization_id
    AND profile.is_active=true
    AND profile.role IN ('admin','manager','sales');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_ACTOR_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.authorization_id=p_authorization_id
    AND control.project_ref=p_project_ref
    AND control.execution_id=p_execution_id
  FOR SHARE;
  IF v_control.edge_process_nonce IS DISTINCT FROM p_process_nonce THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_PROCESS_NONCE_DENIED' USING ERRCODE='42501';
  END IF;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED'
    OR clock_timestamp()>=v_control.write_deadline_at
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_GATE_CLOSED' USING ERRCODE='42501';
  END IF;
  IF v_control.authorized_order_id IS DISTINCT FROM p_order_id
    OR v_control.authorized_organization_id IS DISTINCT FROM p_organization_id
    OR v_control.authorized_create_request_id IS NULL
    OR v_control.authorized_actor_profile_id IS NULL
    OR v_control.authorized_payload_fingerprint IS NULL
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_ORDER_NOT_BOUND' USING ERRCODE='42501';
  END IF;
  PERFORM 1
  FROM public.wos_production_orders production_order
  JOIN public.wos_order_create_receipts create_receipt
    ON create_receipt.request_id=v_control.authorized_create_request_id
    AND create_receipt.order_id=production_order.id
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=p_organization_id
    AND production_order.created_by_profile_id=
      v_control.authorized_actor_profile_id
    AND production_order.sales_owner_profile_id=
      v_control.authorized_actor_profile_id
    AND production_order.order_number=v_control.authorized_order_number
    AND production_order.order_number=
      'QA-NONPROD-'||v_control.authorized_create_request_id::text
    AND production_order.customer_id=v_control.authorized_customer_id
    AND production_order.project_id=v_control.authorized_project_id
    AND create_receipt.organization_id=p_organization_id
    AND create_receipt.actor_profile_id=v_control.authorized_actor_profile_id
    AND create_receipt.payload_fingerprint=
      v_control.authorized_payload_fingerprint
    AND create_receipt.response_json->>'status' IN ('CREATED','REPLAYED')
    AND create_receipt.response_json->>'orderId'=p_order_id::text
    AND create_receipt.response_json->>'requestId'=
      v_control.authorized_create_request_id::text
  FOR SHARE OF production_order,create_receipt;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_ORDER_BINDING_DRIFT'
      USING ERRCODE='42501';
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
    OR v_control.edge_last_heartbeat_at IS NULL
    OR v_control.edge_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_HEARTBEAT_STALE' USING ERRCODE='42501';
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_qa_uat.closer_arm_receipts receipt
    WHERE receipt.execution_id=v_control.execution_id
      AND receipt.authorization_id=p_authorization_id
      AND receipt.project_ref=p_project_ref
      AND receipt.code_sha256=v_control.code_sha256
      AND receipt.arm_token=v_control.arm_token
      AND receipt.write_deadline_at=v_control.write_deadline_at
      AND receipt.state='ARMED'
      AND (
        (
          receipt.closer_kind='DB'
          AND receipt.executor_kind='PG_CRON'
          AND receipt.cleanup_deadline_at=v_control.db_cleanup_deadline_at
        )
        OR (
          receipt.closer_kind='EDGE'
          AND receipt.executor_kind='LAUNCHD'
          AND receipt.cleanup_deadline_at=v_control.edge_cleanup_deadline_at
        )
      )
  )<>2 THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_CLOSERS_NOT_ARMED' USING ERRCODE='42501';
  END IF;
  RETURN true;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_EDGE_GATE_CLOSED' USING ERRCODE='42501';
END;
$edge_allowed$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_write_allowed(
  text,text,uuid,uuid,uuid,uuid,uuid
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_write_allowed(
  text,text,uuid,uuid,uuid,uuid,uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_control_status(
  p_authorization_id text,
  p_project_ref text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $edge_status$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_status text;
BEGIN
  IF p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-004'
    OR p_project_ref<>'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'QA_UAT_EDGE_SCOPE_MISMATCH' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.authorization_id=p_authorization_id
    AND control.project_ref=p_project_ref;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED' THEN
    v_status:='CLOSED';
  ELSIF clock_timestamp()>=v_control.write_deadline_at THEN
    v_status:='EXPIRED';
  ELSIF (
    SELECT count(*)
    FROM wos_v1_qa_uat.closer_arm_receipts receipt
    WHERE receipt.execution_id=v_control.execution_id
      AND receipt.authorization_id=v_control.authorization_id
      AND receipt.project_ref=v_control.project_ref
      AND receipt.code_sha256=v_control.code_sha256
      AND receipt.arm_token=v_control.arm_token
      AND receipt.write_deadline_at=v_control.write_deadline_at
      AND receipt.state='ARMED'
      AND (
        (
          receipt.closer_kind='DB'
          AND receipt.executor_kind='PG_CRON'
          AND receipt.cleanup_deadline_at=v_control.db_cleanup_deadline_at
        )
        OR (
          receipt.closer_kind='EDGE'
          AND receipt.executor_kind='LAUNCHD'
          AND receipt.cleanup_deadline_at=v_control.edge_cleanup_deadline_at
        )
      )
  )<>2 THEN
    v_status:='NOT_ARMED';
  ELSIF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
    OR v_control.edge_last_heartbeat_at IS NULL
    OR v_control.edge_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
  THEN
    v_status:='STALE';
  ELSE
    v_status:='OPEN';
  END IF;
  RETURN jsonb_build_object(
    'status',v_status,
    'executionId',v_control.execution_id,
    'codeSha256',v_control.code_sha256,
    'writeDeadlineAt',v_control.write_deadline_at,
    'edgeCleanupDeadlineAt',v_control.edge_cleanup_deadline_at,
    'edgeProcessNonce',v_control.edge_process_nonce,
    'dbLastHeartbeatAt',v_control.db_last_heartbeat_at,
    'edgeLastHeartbeatAt',v_control.edge_last_heartbeat_at
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RETURN jsonb_build_object('status','NOT_ARMED');
END;
$edge_status$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_control_status(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_control_status(text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_heartbeat(
  p_execution_id uuid,
  p_arm_token uuid,
  p_process_nonce uuid
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $edge_heartbeat_public$
  SELECT wos_v1_qa_uat.record_edge_heartbeat(
    p_execution_id,p_arm_token,p_process_nonce
  )
$edge_heartbeat_public$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_bind_order(
  p_execution_id uuid,
  p_create_request_id uuid,
  p_order_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_payload_fingerprint text
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $bind_order_public$
  SELECT wos_v1_qa_uat.bind_qa_uat_order(
    p_execution_id,p_create_request_id,p_order_id,p_organization_id,
    p_actor_profile_id,p_payload_fingerprint
  )
$bind_order_public$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_bind_order(
  uuid,uuid,uuid,uuid,uuid,text
)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_bind_order(
  uuid,uuid,uuid,uuid,uuid,text
)
  TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_close_edge(
  p_execution_id uuid,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $close_edge_public$
  SELECT wos_v1_qa_uat.close_edge_closer(
    p_execution_id,p_request_id,p_reason
  )
$close_edge_public$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_close_edge(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_close_edge(uuid,uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_probe(
  p_execution_id uuid,
  p_process_nonce uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $edge_probe$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_receipt wos_v1_qa_uat.closer_close_receipts%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.execution_id=p_execution_id;
  IF v_control.edge_process_nonce IS DISTINCT FROM p_process_nonce THEN
    RETURN jsonb_build_object(
      'status','DENIED','executionId',p_execution_id
    );
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    IF v_control.edge_state='CLOSED' THEN
      SELECT * INTO STRICT v_receipt
      FROM wos_v1_qa_uat.closer_close_receipts receipt
      WHERE receipt.execution_id=p_execution_id
        AND receipt.closer_kind='EDGE';
    END IF;
    RETURN jsonb_build_object(
      'status','CLOSED',
      'executionId',p_execution_id,
      'edgeProcessNonce',v_control.edge_process_nonce,
      'closedAt',CASE
        WHEN v_control.edge_state='CLOSED' THEN v_receipt.closed_at
        ELSE NULL
      END,
      'timely',CASE
        WHEN v_control.edge_state='CLOSED' THEN v_receipt.timely
        ELSE NULL
      END
    );
  END IF;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED' THEN
    RETURN jsonb_build_object(
      'status','NOT_ARMED',
      'executionId',p_execution_id,
      'edgeProcessNonce',v_control.edge_process_nonce,
      'dbState',v_control.db_state,
      'edgeState',v_control.edge_state
    );
  END IF;
  IF clock_timestamp()>=v_control.write_deadline_at THEN
    RETURN jsonb_build_object(
      'status','EXPIRED',
      'executionId',p_execution_id,
      'edgeProcessNonce',v_control.edge_process_nonce,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_qa_uat.closer_arm_receipts receipt
    WHERE receipt.execution_id=p_execution_id
      AND receipt.authorization_id=v_control.authorization_id
      AND receipt.project_ref=v_control.project_ref
      AND receipt.code_sha256=v_control.code_sha256
      AND receipt.arm_token=v_control.arm_token
      AND receipt.write_deadline_at=v_control.write_deadline_at
      AND receipt.state='ARMED'
      AND (
        (
          receipt.closer_kind='DB'
          AND receipt.executor_kind='PG_CRON'
          AND receipt.cleanup_deadline_at=v_control.db_cleanup_deadline_at
        )
        OR (
          receipt.closer_kind='EDGE'
          AND receipt.executor_kind='LAUNCHD'
          AND receipt.cleanup_deadline_at=v_control.edge_cleanup_deadline_at
        )
      )
  )<>2 THEN
    RETURN jsonb_build_object(
      'status','NOT_ARMED',
      'executionId',p_execution_id,
      'edgeProcessNonce',v_control.edge_process_nonce,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
    OR v_control.edge_last_heartbeat_at IS NULL
    OR v_control.edge_last_heartbeat_at<clock_timestamp()-interval '30 seconds'
  THEN
    RETURN jsonb_build_object(
      'status','STALE',
      'executionId',p_execution_id,
      'edgeProcessNonce',v_control.edge_process_nonce,
      'writeDeadlineAt',v_control.write_deadline_at,
      'dbLastHeartbeatAt',v_control.db_last_heartbeat_at,
      'edgeLastHeartbeatAt',v_control.edge_last_heartbeat_at
    );
  END IF;
  RETURN jsonb_build_object(
    'status','OPEN',
    'executionId',p_execution_id,
    'edgeProcessNonce',v_control.edge_process_nonce,
    'writeDeadlineAt',v_control.write_deadline_at,
    'dbLastHeartbeatAt',v_control.db_last_heartbeat_at,
    'edgeLastHeartbeatAt',v_control.edge_last_heartbeat_at
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RETURN jsonb_build_object(
    'status','NOT_ARMED',
    'executionId',p_execution_id,
    'edgeProcessNonce',NULL
  );
END;
$edge_probe$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_probe(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_probe(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION wos_v1_qa_uat.assert_edge_write_transaction(
  p_execution_id uuid,
  p_process_nonce uuid,
  p_actor_user_id uuid,
  p_order_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_tx_guard$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_profile
  FROM public.profiles profile
  WHERE profile.user_id=p_actor_user_id
    AND profile.is_active=true;
  RETURN public.wos_v1_qa_uat_edge_write_allowed(
    'WOS-V1-PRODUCTION-M2-QA-UAT-004',
    'xulmpqaknlwqqculbsek',
    p_execution_id,
    p_process_nonce,
    v_profile.id,
    v_profile.org_id,
    p_order_id
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_UAT_EDGE_ACTOR_SCOPE_DENIED' USING ERRCODE='42501';
END;
$edge_tx_guard$;
REVOKE ALL ON FUNCTION wos_v1_qa_uat.assert_edge_write_transaction(
  uuid,uuid,uuid,uuid
)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_record_proof(
  p_execution_id uuid,
  p_process_nonce uuid,
  p_image_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_storage_object_id uuid,
  p_storage_object_version text,
  p_storage_object_updated_at timestamptz,
  p_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_record$
BEGIN
  PERFORM wos_v1_qa_uat.assert_edge_write_transaction(
    p_execution_id,p_process_nonce,p_actor_user_id,p_order_id
  );
  RETURN public.wos_p7_record_trusted_image_proof(
    p_image_id,p_order_id,p_actor_user_id,p_storage_path,
    p_storage_object_id,p_storage_object_version,
    p_storage_object_updated_at,p_sha256
  );
END;
$edge_record$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_record_proof(
  uuid,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_record_proof(
  uuid,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,text
) TO service_role;

CREATE FUNCTION public.wos_v1_qa_uat_open_gate(
  p_authorization_id text,
  p_order_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_allowed_actions text[],
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $open$
DECLARE
  v_order public.wos_production_orders%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_gate_id uuid;
BEGIN
  IF current_setting('wos_v1.qa_uat_gate_open_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_GATE_OPEN_NOT_AUTHORIZED'
      USING ERRCODE='42501';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_PROJECT_MISMATCH'
      USING ERRCODE='42501';
  END IF;
  v_control:=wos_v1_qa_uat.assert_write_open(
    btrim(p_authorization_id),
    p_order_id
  );
  IF p_expires_at>v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_UAT_GATE_EXCEEDS_WRITE_DEADLINE'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=p_organization_id
    AND production_order.order_number LIKE 'QA-NONPROD-%'
  FOR SHARE;
  SELECT * INTO STRICT v_actor
  FROM public.profiles profile
  WHERE profile.id=p_actor_profile_id
    AND profile.org_id=p_organization_id
    AND profile.is_active=true;
  INSERT INTO wos_v1_qa_uat.write_gates(
    authorization_id,project_ref,organization_id,order_id,actor_profile_id,
    allowed_actions,expires_at
  ) VALUES(
    btrim(p_authorization_id),'xulmpqaknlwqqculbsek',p_organization_id,
    p_order_id,p_actor_profile_id,p_allowed_actions,p_expires_at
  )
  RETURNING gate_id INTO v_gate_id;
  RETURN v_gate_id;
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'WOS_V1_QA_UAT_GATE_SCOPE_INVALID'
    USING ERRCODE='42501';
END;
$open$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_open_gate(
  text,uuid,uuid,uuid,text[],timestamptz
) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wos_v1_qa_uat_m2_action(
  p_authorization_id text,
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_action text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $m2$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  IF btrim(p_authorization_id)<>'WOS-V1-PRODUCTION-M2-QA-UAT-004' THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZATION_ID_MISMATCH' USING ERRCODE='42501';
  END IF;
  PERFORM wos_v1_qa_uat.assert_write_open(
    btrim(p_authorization_id),
    p_order_id
  );
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_actor
  FROM public.profiles profile
  WHERE profile.user_id=auth.uid()
    AND profile.is_active=true;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=v_actor.org_id
    AND production_order.order_number LIKE 'QA-NONPROD-%';
  PERFORM 1
  FROM wos_v1_qa_uat.write_gates gate
  WHERE gate.project_ref='xulmpqaknlwqqculbsek'
    AND gate.order_id=p_order_id
    AND gate.organization_id=v_actor.org_id
    AND gate.actor_profile_id=v_actor.id
    AND gate.authorization_id=p_authorization_id
    AND gate.state='OPEN'
    AND gate.opened_at<=clock_timestamp()
    AND gate.expires_at>clock_timestamp()
    AND p_action=ANY(gate.allowed_actions)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_M2_GATE_CLOSED' USING ERRCODE='42501';
  END IF;
  UPDATE wos_v1_qa_uat.write_gates
  SET last_used_at=clock_timestamp()
  WHERE order_id=p_order_id
    AND project_ref='xulmpqaknlwqqculbsek'
    AND authorization_id=p_authorization_id
    AND organization_id=v_actor.org_id
    AND actor_profile_id=v_actor.id
    AND state='OPEN'
    AND opened_at<=clock_timestamp()
    AND expires_at>clock_timestamp()
    AND p_action=ANY(allowed_actions);
  RETURN public.wos_v1_m2_action(
    p_order_id,p_expected_version,p_request_id,p_action,p_payload
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
END;
$m2$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_m2_action(
  text,uuid,integer,uuid,text,jsonb
) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wos_v1_qa_uat_authorize_production_start(
  p_authorization_id text,
  p_order_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_baseline_id uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $release$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_order public.wos_production_orders%ROWTYPE;
BEGIN
  IF btrim(p_authorization_id)<>'WOS-V1-PRODUCTION-M2-QA-UAT-004' THEN
    RAISE EXCEPTION 'QA_UAT_AUTHORIZATION_ID_MISMATCH' USING ERRCODE='42501';
  END IF;
  PERFORM wos_v1_qa_uat.assert_write_open(
    btrim(p_authorization_id),
    p_order_id
  );
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_actor
  FROM public.profiles profile
  WHERE profile.user_id=auth.uid()
    AND profile.is_active=true;
  SELECT * INTO STRICT v_order
  FROM public.wos_production_orders production_order
  WHERE production_order.id=p_order_id
    AND production_order.organization_id=v_actor.org_id
    AND production_order.order_number LIKE 'QA-NONPROD-%';
  PERFORM 1
  FROM wos_v1_qa_uat.write_gates gate
  WHERE gate.project_ref='xulmpqaknlwqqculbsek'
    AND gate.order_id=p_order_id
    AND gate.organization_id=v_actor.org_id
    AND gate.actor_profile_id=v_actor.id
    AND gate.authorization_id=p_authorization_id
    AND gate.state='OPEN'
    AND gate.opened_at<=clock_timestamp()
    AND gate.expires_at>clock_timestamp()
    AND 'START_RELEASE'=ANY(gate.allowed_actions)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_UAT_START_RELEASE_GATE_CLOSED' USING ERRCODE='42501';
  END IF;
  UPDATE wos_v1_qa_uat.write_gates
  SET last_used_at=clock_timestamp()
  WHERE order_id=p_order_id
    AND project_ref='xulmpqaknlwqqculbsek'
    AND authorization_id=p_authorization_id
    AND organization_id=v_actor.org_id
    AND actor_profile_id=v_actor.id
    AND state='OPEN'
    AND opened_at<=clock_timestamp()
    AND expires_at>clock_timestamp()
    AND 'START_RELEASE'=ANY(allowed_actions);
  RETURN public.wos_v1_authorize_production_start(
    p_order_id,p_expected_version,p_request_id,p_baseline_id,p_note
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
END;
$release$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_authorize_production_start(
  text,uuid,integer,uuid,uuid,text
) FROM PUBLIC,anon,authenticated;

COMMIT;

-- NOT_AUTHORIZED
