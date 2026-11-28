-- QA-only independent closer installation.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- This file intentionally has no dependency on Production M2, QA business
-- wrappers, write_gates or order-binding tables. It installs only control,
-- heartbeat, timer, close and Edge probe objects.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('wos_v1.qa_closer_install_authorized',true)
    IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project',true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_PROJECT_MISMATCH';
  END IF;
  IF to_regprocedure(
    'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
  ) IS NOT NULL OR to_regprocedure(
    'public.wos_v1_qa_uat_edge_write_allowed(text,text,uuid,uuid,uuid,uuid,uuid)'
  ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_FULL_ADAPTER_CONFLICT';
  END IF;
  IF to_regprocedure(
      'public.wos_v1_qa_uat_edge_control_status(text,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_PUBLIC_API_EXISTS';
  END IF;
  IF to_regprocedure(
    'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
  ) IS NULL OR to_regclass('public.wos_qa_trusted_proof_receipts') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_DATABASE_NOT_IDENTIFIED';
  END IF;
  IF to_regclass('public.organizations') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR NOT EXISTS(
      SELECT 1
      FROM public.organizations organization
      JOIN public.profiles profile
        ON profile.org_id=organization.id
      WHERE organization.id='0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
        AND profile.id='9164ac91-a50c-4023-836c-5c0887b619fb'
        AND profile.user_id='b55ccc94-6352-4cad-8600-fad32955d014'
        AND profile.role='manager'
        AND profile.is_active=true
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_IDENTITY_MARKER_MISMATCH';
  END IF;
END;
$guard$;

CREATE SCHEMA IF NOT EXISTS wos_v1_qa_closer;
REVOKE ALL ON SCHEMA wos_v1_qa_closer FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS wos_v1_qa_closer.lifecycle (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  public_api_owner text NOT NULL
    CHECK (public_api_owner IN ('CLOSER_ONLY','NONE')),
  edge_probe_oid oid,
  close_edge_oid oid,
  edge_heartbeat_oid oid,
  edge_preflight_oid oid,
  edge_status_oid oid,
  edge_probe_definition_md5 text,
  close_edge_definition_md5 text,
  edge_heartbeat_definition_md5 text,
  edge_preflight_definition_md5 text,
  edge_status_definition_md5 text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE wos_v1_qa_closer.lifecycle
  ADD COLUMN IF NOT EXISTS edge_preflight_oid oid,
  ADD COLUMN IF NOT EXISTS edge_preflight_definition_md5 text;
ALTER TABLE wos_v1_qa_closer.lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_closer.lifecycle
  FROM PUBLIC,anon,authenticated;
INSERT INTO wos_v1_qa_closer.lifecycle(singleton,public_api_owner)
VALUES(true,'CLOSER_ONLY')
ON CONFLICT (singleton) DO UPDATE
SET public_api_owner='CLOSER_ONLY',updated_at=clock_timestamp();

CREATE TABLE IF NOT EXISTS wos_v1_qa_closer.controls (
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
  db_last_heartbeat_at timestamptz,
  edge_last_heartbeat_at timestamptz,
  edge_process_nonce uuid,
  edge_probe_verified_at timestamptz,
  edge_probe_execution_id uuid,
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
ALTER TABLE wos_v1_qa_closer.controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_closer.controls
  FROM PUBLIC,anon,authenticated;

DO $migrate_authorization_check$
DECLARE
  v_constraint text;
BEGIN
  IF EXISTS(
    SELECT 1
    FROM wos_v1_qa_closer.controls control
    WHERE control.authorization_id
      !~ '^WOS-V1-PRODUCTION-M2-QA-UAT-[0-9]{3}$'
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_CLOSER_AUTHORIZATION_AUDIT_INVALID';
  END IF;
  FOR v_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid=
        'wos_v1_qa_closer.controls'::regclass
      AND constraint_row.contype='c'
      AND pg_get_constraintdef(constraint_row.oid)
        LIKE '%authorization_id%'
      AND constraint_row.conkey=ARRAY[
        (
          SELECT attribute_row.attnum
          FROM pg_attribute attribute_row
          WHERE attribute_row.attrelid=
              'wos_v1_qa_closer.controls'::regclass
            AND attribute_row.attname='authorization_id'
        )
      ]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE wos_v1_qa_closer.controls DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
  ALTER TABLE wos_v1_qa_closer.controls
    ADD CONSTRAINT wos_v1_qa_closer_controls_authorization_id_check
    CHECK (
      authorization_id ~ '^WOS-V1-PRODUCTION-M2-QA-UAT-[0-9]{3}$'
    );
END;
$migrate_authorization_check$;

CREATE TABLE IF NOT EXISTS wos_v1_qa_closer.arm_receipts (
  execution_id uuid NOT NULL
    REFERENCES wos_v1_qa_closer.controls(execution_id),
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
ALTER TABLE wos_v1_qa_closer.arm_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_closer.arm_receipts
  FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS wos_v1_qa_closer.close_receipts (
  execution_id uuid NOT NULL
    REFERENCES wos_v1_qa_closer.controls(execution_id),
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
ALTER TABLE wos_v1_qa_closer.close_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wos_v1_qa_closer.close_receipts
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.guard_control_identity()
RETURNS trigger
LANGUAGE plpgsql SET search_path=''
AS $guard_control$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'QA_CLOSER_AUDIT_DELETE_FORBIDDEN';
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
    RAISE EXCEPTION 'QA_CLOSER_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD.db_state='CLOSED' AND NEW.db_state<>'CLOSED' THEN
    RAISE EXCEPTION 'QA_CLOSER_DB_REOPEN_FORBIDDEN';
  END IF;
  IF OLD.edge_state='CLOSED' AND NEW.edge_state<>'CLOSED' THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_REOPEN_FORBIDDEN';
  END IF;
  IF OLD.edge_process_nonce IS NOT NULL
    AND NEW.edge_process_nonce IS DISTINCT FROM OLD.edge_process_nonce
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_PROCESS_NONCE_IMMUTABLE';
  END IF;
  IF OLD.edge_probe_verified_at IS NOT NULL
    AND (
      NEW.edge_probe_verified_at
        IS DISTINCT FROM OLD.edge_probe_verified_at
      OR NEW.edge_probe_execution_id
        IS DISTINCT FROM OLD.edge_probe_execution_id
    )
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_PROBE_EVIDENCE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$guard_control$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.guard_control_identity()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS wos_v1_qa_closer_control_guard
  ON wos_v1_qa_closer.controls;
CREATE TRIGGER wos_v1_qa_closer_control_guard
BEFORE UPDATE OR DELETE ON wos_v1_qa_closer.controls
FOR EACH ROW EXECUTE FUNCTION wos_v1_qa_closer.guard_control_identity();

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.arm_db_closer(
  p_execution_id uuid,
  p_arm_token uuid,
  p_authorization_id text,
  p_project_ref text,
  p_code_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $arm_db$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-009'
    OR p_project_ref<>'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'QA_CLOSER_SCOPE_MISMATCH';
  END IF;
  IF p_code_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'QA_CLOSER_CODE_SHA_INVALID';
  END IF;
  INSERT INTO wos_v1_qa_closer.controls(
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
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.authorization_id<>p_authorization_id
    OR v_control.project_ref<>p_project_ref
    OR v_control.code_sha256<>p_code_sha256
    OR v_control.arm_token<>p_arm_token
  THEN
    RAISE EXCEPTION 'QA_CLOSER_DB_ARM_CONFLICT';
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    RAISE EXCEPTION 'QA_CLOSER_DB_ALREADY_CLOSED';
  END IF;
  RETURN jsonb_build_object(
    'status','PENDING_HEARTBEAT',
    'scope','CLOSER_ONLY',
    'executionId',p_execution_id,
    'authorizationId',p_authorization_id,
    'projectRef',p_project_ref,
    'codeSha256',p_code_sha256,
    'writeDeadlineAt',v_control.write_deadline_at,
    'dbCleanupDeadlineAt',v_control.db_cleanup_deadline_at,
    'edgeCleanupDeadlineAt',v_control.edge_cleanup_deadline_at
  );
END;
$arm_db$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.arm_db_closer(
  uuid,uuid,text,text,text
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.record_db_heartbeat(
  p_execution_id uuid,
  p_arm_token uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $db_heartbeat$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.arm_token<>p_arm_token
    OR v_control.db_state<>'ARMED'
    OR v_control.edge_state<>'ARMED'
  THEN
    RAISE EXCEPTION 'QA_CLOSER_DB_HEARTBEAT_SCOPE_DENIED';
  END IF;
  IF v_now>=v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_CLOSER_WRITE_DEADLINE_EXPIRED';
  END IF;
  UPDATE wos_v1_qa_closer.controls
  SET db_last_heartbeat_at=v_now
  WHERE execution_id=p_execution_id;
  INSERT INTO wos_v1_qa_closer.arm_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    arm_token,executor_kind,write_deadline_at,cleanup_deadline_at,heartbeat_at
  ) VALUES(
    p_execution_id,'DB',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_arm_token,'PG_CRON',v_control.write_deadline_at,
    v_control.db_cleanup_deadline_at,v_now
  )
  ON CONFLICT (execution_id,closer_kind) DO UPDATE
  SET heartbeat_at=EXCLUDED.heartbeat_at
  WHERE wos_v1_qa_closer.arm_receipts.executor_kind='PG_CRON'
    AND wos_v1_qa_closer.arm_receipts.arm_token=EXCLUDED.arm_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_CLOSER_DB_HEARTBEAT_CONFLICT';
  END IF;
  RETURN jsonb_build_object(
    'status','ARMED',
    'executionId',p_execution_id,
    'executorKind','PG_CRON',
    'heartbeatAt',v_now
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$db_heartbeat$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.record_db_heartbeat(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.record_edge_heartbeat(
  p_execution_id uuid,
  p_arm_token uuid,
  p_process_nonce uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_heartbeat$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.arm_token<>p_arm_token
    OR v_control.code_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_HEARTBEAT_SCOPE_DENIED';
  END IF;
  IF v_now>=v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_CLOSER_WRITE_DEADLINE_EXPIRED';
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_ALREADY_CLOSED';
  END IF;
  IF v_control.edge_process_nonce IS NOT NULL
    AND v_control.edge_process_nonce<>p_process_nonce
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_PROCESS_NONCE_CONFLICT';
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<v_now-interval '30 seconds'
    OR NOT EXISTS(
      SELECT 1 FROM wos_v1_qa_closer.arm_receipts receipt
      WHERE receipt.execution_id=p_execution_id
        AND receipt.closer_kind='DB'
        AND receipt.executor_kind='PG_CRON'
    )
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_DB_HEARTBEAT_REQUIRED';
  END IF;
  UPDATE wos_v1_qa_closer.controls
  SET edge_process_nonce=coalesce(edge_process_nonce,p_process_nonce),
      edge_last_heartbeat_at=v_now
  WHERE execution_id=p_execution_id;
  INSERT INTO wos_v1_qa_closer.arm_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    arm_token,executor_kind,write_deadline_at,cleanup_deadline_at,heartbeat_at
  ) VALUES(
    p_execution_id,'EDGE',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_arm_token,'LAUNCHD',v_control.write_deadline_at,
    v_control.edge_cleanup_deadline_at,v_now
  )
  ON CONFLICT (execution_id,closer_kind) DO UPDATE
  SET heartbeat_at=EXCLUDED.heartbeat_at
  WHERE wos_v1_qa_closer.arm_receipts.executor_kind='LAUNCHD'
    AND wos_v1_qa_closer.arm_receipts.arm_token=EXCLUDED.arm_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_HEARTBEAT_CONFLICT';
  END IF;
  RETURN jsonb_build_object(
    'status','ARMED',
    'executionId',p_execution_id,
    'executorKind','LAUNCHD',
    'processNonce',p_process_nonce,
    'heartbeatAt',v_now
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$edge_heartbeat$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.record_edge_heartbeat(
  uuid,uuid,uuid
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.preflight_edge_nonce(
  p_execution_id uuid,
  p_arm_token uuid,
  p_process_nonce uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_preflight$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.arm_token<>p_arm_token
    OR v_control.code_sha256 IS NULL
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_PREFLIGHT_SCOPE_DENIED';
  END IF;
  IF v_now>=v_control.write_deadline_at THEN
    RAISE EXCEPTION 'QA_CLOSER_WRITE_DEADLINE_EXPIRED';
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_ALREADY_CLOSED';
  END IF;
  IF v_control.edge_process_nonce IS NOT NULL
    AND v_control.edge_process_nonce<>p_process_nonce
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_PROCESS_NONCE_CONFLICT';
  END IF;
  IF v_control.db_last_heartbeat_at IS NULL
    OR v_control.db_last_heartbeat_at<v_now-interval '30 seconds'
    OR NOT EXISTS(
      SELECT 1 FROM wos_v1_qa_closer.arm_receipts receipt
      WHERE receipt.execution_id=p_execution_id
        AND receipt.closer_kind='DB'
        AND receipt.executor_kind='PG_CRON'
    )
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_DB_HEARTBEAT_REQUIRED';
  END IF;
  UPDATE wos_v1_qa_closer.controls
  SET edge_process_nonce=coalesce(edge_process_nonce,p_process_nonce)
  WHERE execution_id=p_execution_id;
  RETURN jsonb_build_object(
    'status','PREFLIGHT',
    'executionId',p_execution_id,
    'processNonce',p_process_nonce,
    'previousHeartbeatAt',v_control.edge_last_heartbeat_at,
    'preflightAt',v_now
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$edge_preflight$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.preflight_edge_nonce(
  uuid,uuid,uuid
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.unschedule_db_cron(
  p_execution_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $unschedule_cron$
DECLARE
  v_job_id bigint;
  v_removed boolean;
BEGIN
  SELECT control.db_cron_job_id INTO v_job_id
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
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
REVOKE ALL ON FUNCTION wos_v1_qa_closer.unschedule_db_cron(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.close_db_closer(
  p_execution_id uuid,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $close_db$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_existing wos_v1_qa_closer.close_receipts%ROWTYPE;
  v_closed_at timestamptz;
  v_timely boolean;
  v_cron_unscheduled boolean;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.db_state='CLOSED' THEN
    SELECT * INTO STRICT v_existing
    FROM wos_v1_qa_closer.close_receipts receipt
    WHERE receipt.execution_id=p_execution_id
      AND receipt.closer_kind='DB';
    v_cron_unscheduled:=wos_v1_qa_closer.unschedule_db_cron(p_execution_id);
    RETURN jsonb_build_object(
      'status','REPLAYED','executionId',p_execution_id,
      'closedAt',v_existing.closed_at,'timely',v_existing.timely,
      'deadlineAt',v_existing.cleanup_deadline_at,
      'cronUnscheduled',v_cron_unscheduled
    );
  END IF;
  v_closed_at:=clock_timestamp();
  v_timely:=v_closed_at<=v_control.db_cleanup_deadline_at;
  INSERT INTO wos_v1_qa_closer.close_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    request_id,closed_at,cleanup_deadline_at,timely,reason
  ) VALUES(
    p_execution_id,'DB',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_request_id,v_closed_at,
    v_control.db_cleanup_deadline_at,v_timely,left(p_reason,200)
  );
  UPDATE wos_v1_qa_closer.controls
  SET db_state='CLOSED',db_closed_at=v_closed_at,close_reason=left(p_reason,200)
  WHERE execution_id=p_execution_id;
  v_cron_unscheduled:=wos_v1_qa_closer.unschedule_db_cron(p_execution_id);
  RETURN jsonb_build_object(
    'status','CLOSED','executionId',p_execution_id,
    'closedAt',v_closed_at,'timely',v_timely,
    'deadlineAt',v_control.db_cleanup_deadline_at,
    'cronUnscheduled',v_cron_unscheduled
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$close_db$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.close_db_closer(
  uuid,uuid,text
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.close_edge_closer(
  p_execution_id uuid,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $close_edge$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_existing wos_v1_qa_closer.close_receipts%ROWTYPE;
  v_closed_at timestamptz;
  v_timely boolean;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
  FOR UPDATE;
  IF v_control.edge_state='CLOSED' THEN
    SELECT * INTO STRICT v_existing
    FROM wos_v1_qa_closer.close_receipts receipt
    WHERE receipt.execution_id=p_execution_id
      AND receipt.closer_kind='EDGE';
    RETURN jsonb_build_object(
      'status','REPLAYED','executionId',p_execution_id,
      'closedAt',v_existing.closed_at,'timely',v_existing.timely,
      'deadlineAt',v_existing.cleanup_deadline_at
    );
  END IF;
  v_closed_at:=clock_timestamp();
  v_timely:=v_closed_at<=v_control.edge_cleanup_deadline_at;
  INSERT INTO wos_v1_qa_closer.close_receipts(
    execution_id,closer_kind,authorization_id,project_ref,code_sha256,
    request_id,closed_at,cleanup_deadline_at,timely,reason
  ) VALUES(
    p_execution_id,'EDGE',v_control.authorization_id,v_control.project_ref,
    v_control.code_sha256,p_request_id,v_closed_at,
    v_control.edge_cleanup_deadline_at,v_timely,left(p_reason,200)
  );
  UPDATE wos_v1_qa_closer.controls
  SET edge_state='CLOSED',edge_closed_at=v_closed_at,close_reason=left(p_reason,200)
  WHERE execution_id=p_execution_id;
  RETURN jsonb_build_object(
    'status','CLOSED','executionId',p_execution_id,
    'closedAt',v_closed_at,'timely',v_timely,
    'deadlineAt',v_control.edge_cleanup_deadline_at
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$close_edge$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.close_edge_closer(
  uuid,uuid,text
) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.db_close_tick(
  p_execution_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $db_tick$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id;
  IF v_control.db_state='CLOSED' THEN
    RETURN wos_v1_qa_closer.close_db_closer(
      p_execution_id,p_request_id,'SCHEDULED_DB_CLOSE'
    );
  END IF;
  IF clock_timestamp()<v_control.write_deadline_at THEN
    PERFORM wos_v1_qa_closer.record_db_heartbeat(
      p_execution_id,v_control.arm_token
    );
    RETURN jsonb_build_object(
      'status','WAITING','executionId',p_execution_id,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  RETURN wos_v1_qa_closer.close_db_closer(
    p_execution_id,p_request_id,'SCHEDULED_DB_CLOSE'
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$db_tick$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.db_close_tick(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.edge_close_tick(
  p_execution_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_tick$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id;
  IF v_control.edge_state='CLOSED' THEN
    RETURN wos_v1_qa_closer.close_edge_closer(
      p_execution_id,p_request_id,'SCHEDULED_EDGE_CLOSE'
    );
  END IF;
  IF clock_timestamp()<v_control.write_deadline_at THEN
    RETURN jsonb_build_object(
      'status','WAITING','executionId',p_execution_id,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  RETURN wos_v1_qa_closer.close_edge_closer(
    p_execution_id,p_request_id,'SCHEDULED_EDGE_CLOSE'
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RAISE EXCEPTION 'QA_CLOSER_CONTROL_MISSING';
END;
$edge_tick$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.edge_close_tick(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wos_v1_qa_closer.closer_status(
  p_execution_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $status$
  SELECT jsonb_build_object(
    'status','FOUND',
    'scope','CLOSER_ONLY',
    'executionId',control.execution_id,
    'authorizationId',control.authorization_id,
    'projectRef',control.project_ref,
    'codeSha256',control.code_sha256,
    'openedAt',control.opened_at,
    'writeDeadlineAt',control.write_deadline_at,
    'dbCleanupDeadlineAt',control.db_cleanup_deadline_at,
    'edgeCleanupDeadlineAt',control.edge_cleanup_deadline_at,
    'dbCronJobId',control.db_cron_job_id,
    'dbLastHeartbeatAt',control.db_last_heartbeat_at,
    'edgeLastHeartbeatAt',control.edge_last_heartbeat_at,
    'edgeProcessNonce',control.edge_process_nonce,
    'dbClosedAt',control.db_closed_at,
    'edgeClosedAt',control.edge_closed_at,
    'edgeProbeVerifiedAt',control.edge_probe_verified_at,
    'edgeProbeExecutionId',control.edge_probe_execution_id,
    'dbCloseTimely',(
      SELECT receipt.timely
      FROM wos_v1_qa_closer.close_receipts receipt
      WHERE receipt.execution_id=control.execution_id
        AND receipt.closer_kind='DB'
    ),
    'edgeCloseTimely',(
      SELECT receipt.timely
      FROM wos_v1_qa_closer.close_receipts receipt
      WHERE receipt.execution_id=control.execution_id
        AND receipt.closer_kind='EDGE'
    ),
    'dbState',control.db_state,
    'edgeState',control.edge_state,
    'armedKinds',(
      SELECT jsonb_agg(receipt.closer_kind ORDER BY receipt.closer_kind)
      FROM wos_v1_qa_closer.arm_receipts receipt
      WHERE receipt.execution_id=control.execution_id
    ),
    'executorKinds',(
      SELECT jsonb_agg(receipt.executor_kind ORDER BY receipt.closer_kind)
      FROM wos_v1_qa_closer.arm_receipts receipt
      WHERE receipt.execution_id=control.execution_id
    ),
    'openGateCount',0,
    'm2AuthenticatedExecute',false,
    'releaseAuthenticatedExecute',false
  )
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id
$status$;
REVOKE ALL ON FUNCTION wos_v1_qa_closer.closer_status(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_control_status(
  p_authorization_id text,
  p_project_ref text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_status$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_status text;
BEGIN
  IF p_authorization_id<>'WOS-V1-PRODUCTION-M2-QA-UAT-009'
    OR p_project_ref<>'xulmpqaknlwqqculbsek'
  THEN
    RAISE EXCEPTION 'QA_CLOSER_EDGE_SCOPE_MISMATCH' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.authorization_id=p_authorization_id
    AND control.project_ref=p_project_ref;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED' THEN
    v_status:='CLOSED';
  ELSIF clock_timestamp()>=v_control.write_deadline_at THEN
    v_status:='EXPIRED';
  ELSIF (
    SELECT count(*)
    FROM wos_v1_qa_closer.arm_receipts receipt
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
    'scope','CLOSER_ONLY',
    'executionId',v_control.execution_id,
    'codeSha256',v_control.code_sha256,
    'writeDeadlineAt',v_control.write_deadline_at,
    'edgeCleanupDeadlineAt',v_control.edge_cleanup_deadline_at,
    'edgeProcessNonce',v_control.edge_process_nonce,
    'dbLastHeartbeatAt',v_control.db_last_heartbeat_at,
    'edgeLastHeartbeatAt',v_control.edge_last_heartbeat_at
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RETURN jsonb_build_object('status','NOT_ARMED','scope','CLOSER_ONLY');
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
  SELECT wos_v1_qa_closer.record_edge_heartbeat(
    p_execution_id,p_arm_token,p_process_nonce
  )
$edge_heartbeat_public$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_preflight(
  p_execution_id uuid,
  p_arm_token uuid,
  p_process_nonce uuid
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $edge_preflight_public$
  SELECT wos_v1_qa_closer.preflight_edge_nonce(
    p_execution_id,p_arm_token,p_process_nonce
  )
$edge_preflight_public$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_preflight(
  uuid,uuid,uuid
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_preflight(
  uuid,uuid,uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_close_edge(
  p_execution_id uuid,
  p_request_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $close_edge_public$
  SELECT wos_v1_qa_closer.close_edge_closer(
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $edge_probe$
DECLARE
  v_control wos_v1_qa_closer.controls%ROWTYPE;
  v_receipt wos_v1_qa_closer.close_receipts%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_control
  FROM wos_v1_qa_closer.controls control
  WHERE control.execution_id=p_execution_id;
  IF v_control.edge_process_nonce IS DISTINCT FROM p_process_nonce THEN
    RETURN jsonb_build_object(
      'status','DENIED','executionId',p_execution_id
    );
  END IF;
  IF v_control.db_state='CLOSED' OR v_control.edge_state='CLOSED' THEN
    IF v_control.edge_state='CLOSED' THEN
      SELECT * INTO STRICT v_receipt
      FROM wos_v1_qa_closer.close_receipts receipt
      WHERE receipt.execution_id=p_execution_id
        AND receipt.closer_kind='EDGE';
      UPDATE wos_v1_qa_closer.controls
      SET edge_probe_verified_at=coalesce(
            edge_probe_verified_at,
            clock_timestamp()
          ),
          edge_probe_execution_id=coalesce(
            edge_probe_execution_id,
            p_execution_id
          )
      WHERE execution_id=p_execution_id;
    END IF;
    RETURN jsonb_build_object(
      'status','CLOSED',
      'executionId',p_execution_id,
      'scope','CLOSER_ONLY',
      'edgeProcessNonce',v_control.edge_process_nonce,
      'closedAt',CASE
        WHEN v_control.edge_state='CLOSED' THEN v_receipt.closed_at
        ELSE NULL
      END,
      'timely',CASE
        WHEN v_control.edge_state='CLOSED' THEN v_receipt.timely
        ELSE NULL
      END,
      'probeVerifiedAt',clock_timestamp()
    );
  END IF;
  IF v_control.db_state<>'ARMED' OR v_control.edge_state<>'ARMED' THEN
    RETURN jsonb_build_object(
      'status','NOT_ARMED',
      'executionId',p_execution_id,
      'scope','CLOSER_ONLY',
      'edgeProcessNonce',v_control.edge_process_nonce,
      'dbState',v_control.db_state,
      'edgeState',v_control.edge_state
    );
  END IF;
  IF clock_timestamp()>=v_control.write_deadline_at THEN
    RETURN jsonb_build_object(
      'status','EXPIRED',
      'executionId',p_execution_id,
      'scope','CLOSER_ONLY',
      'edgeProcessNonce',v_control.edge_process_nonce,
      'writeDeadlineAt',v_control.write_deadline_at
    );
  END IF;
  IF (
    SELECT count(*)
    FROM wos_v1_qa_closer.arm_receipts receipt
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
      'scope','CLOSER_ONLY',
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
      'scope','CLOSER_ONLY',
      'edgeProcessNonce',v_control.edge_process_nonce,
      'writeDeadlineAt',v_control.write_deadline_at,
      'dbLastHeartbeatAt',v_control.db_last_heartbeat_at,
      'edgeLastHeartbeatAt',v_control.edge_last_heartbeat_at
    );
  END IF;
  RETURN jsonb_build_object(
    'status','OPEN',
    'executionId',p_execution_id,
    'scope','CLOSER_ONLY',
    'edgeProcessNonce',v_control.edge_process_nonce,
    'writeDeadlineAt',v_control.write_deadline_at,
    'dbLastHeartbeatAt',v_control.db_last_heartbeat_at,
    'edgeLastHeartbeatAt',v_control.edge_last_heartbeat_at
  );
EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
  RETURN jsonb_build_object(
    'status','NOT_ARMED',
    'executionId',p_execution_id,
    'scope','CLOSER_ONLY',
    'edgeProcessNonce',NULL
  );
END;
$edge_probe$;
REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_edge_probe(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wos_v1_qa_uat_edge_probe(uuid,uuid)
  TO service_role;

UPDATE wos_v1_qa_closer.lifecycle
SET edge_status_oid=
      'public.wos_v1_qa_uat_edge_control_status(text,text)'::regprocedure::oid,
    edge_heartbeat_oid=
      'public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)'::regprocedure::oid,
    edge_preflight_oid=
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'
        ::regprocedure::oid,
    close_edge_oid=
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)'::regprocedure::oid,
    edge_probe_oid=
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)'::regprocedure::oid,
    edge_status_definition_md5=md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_control_status(text,text)'::regprocedure
    )),
    edge_heartbeat_definition_md5=md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)'::regprocedure
    )),
    edge_preflight_definition_md5=md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'::regprocedure
    )),
    close_edge_definition_md5=md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)'::regprocedure
    )),
    edge_probe_definition_md5=md5(pg_get_functiondef(
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)'::regprocedure
    )),
    updated_at=clock_timestamp()
WHERE singleton=true;

COMMIT;

-- CLOSER_ONLY
