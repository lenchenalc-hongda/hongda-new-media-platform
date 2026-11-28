#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_v1_qa_closer_only_ci"
TICK_DB="wos_v1_qa_closer_only_tick_ci"
EXECUTION_ID="efddb60c-4a70-4b46-bf18-46629a4397d2"
ARM_TOKEN="94949494-9494-4494-8494-949494949494"
EDGE_NONCE="77ac7769-25a2-495a-8892-467d16abb00e"
CODE_SHA="$(printf 'a%.0s' {1..64})"
EDGE_RECEIPT_PATH="/tmp/wos-closer-only-edge-receipt-$$.json"

fail() {
  printf 'WOS_V1_QA_CLOSER_ONLY_PG17_FAILED=%s\n' "$1" >&2
  exit 1
}

[[ -n "$CONTAINER" ]] || fail 'CONTAINER_REQUIRED'
[[ "$CONTAINER" =~ ^codex-wos-prod-readiness-pg17-[A-Za-z0-9_.-]+$ ]] \
  || fail 'CONTAINER_NAME_NOT_OWNED'
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" = 'true' ]] \
  || fail 'CONTAINER_NOT_RUNNING'
[[ "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER")" = 'postgres:17-alpine' ]] \
  || fail 'POSTGRES17_ALPINE_REQUIRED'

psql_db() {
  local database="$1"
  shift
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$database" "$@"
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$TICK_DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

bootstrap_fixture() {
  local database="$1"
  psql_db "$database" -q <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$roles$;

CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.organizations(id)
VALUES('0ff53d93-2b9e-48b9-8113-a4768c39cdd2');
INSERT INTO public.profiles(id,user_id,org_id,role,is_active)
VALUES(
  '9164ac91-a50c-4023-836c-5c0887b619fb',
  'b55ccc94-6352-4cad-8600-fad32955d014',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'manager',
  true
);
CREATE TABLE public.wos_qa_trusted_proof_receipts(id uuid PRIMARY KEY);
CREATE FUNCTION public.wos_qa_p2_m2_action(
  uuid,integer,uuid,text,jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $qa_marker$
BEGIN
  RAISE EXCEPTION 'QA_MARKER_ONLY';
END;
$qa_marker$;

CREATE SCHEMA cron;
CREATE TABLE cron.job(
  jobid bigserial PRIMARY KEY,
  jobname text NOT NULL UNIQUE,
  schedule text NOT NULL,
  command text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION cron.schedule(text,text,text)
RETURNS bigint LANGUAGE plpgsql
AS $cron_schedule$
DECLARE
  v_job_id bigint;
BEGIN
  INSERT INTO cron.job(jobname,schedule,command)
  VALUES($1,$2,$3)
  RETURNING jobid INTO v_job_id;
  RETURN v_job_id;
END;
$cron_schedule$;
CREATE FUNCTION cron.unschedule(bigint)
RETURNS boolean LANGUAGE plpgsql
AS $cron_unschedule$
BEGIN
  DELETE FROM cron.job WHERE jobid=$1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cron job % does not exist',$1 USING ERRCODE='22023';
  END IF;
  RETURN true;
END;
$cron_unschedule$;
SQL
}

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$TICK_DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$DB\""
psql_db postgres -q -c "CREATE DATABASE \"$TICK_DB\""
bootstrap_fixture "$DB"
bootstrap_fixture "$TICK_DB"

psql_db "$DB" -q <<'SQL'
CREATE SCHEMA wos_v1_qa_closer;
CREATE TABLE wos_v1_qa_closer.controls (
  execution_id uuid PRIMARY KEY,
  authorization_id text NOT NULL UNIQUE CHECK (
    authorization_id='WOS-V1-PRODUCTION-M2-QA-UAT-002'
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
DO $historical$
DECLARE
  v_now timestamptz:=clock_timestamp()-interval '2 hours';
BEGIN
  INSERT INTO wos_v1_qa_closer.controls(
    execution_id,authorization_id,project_ref,code_sha256,arm_token,
    opened_at,write_deadline_at,db_cleanup_deadline_at,edge_cleanup_deadline_at,
    db_state,edge_state,db_closed_at,edge_closed_at,
    edge_process_nonce,edge_probe_verified_at,edge_probe_execution_id,close_reason
  ) VALUES(
    '92929292-9292-4292-8292-929292929292',
    'WOS-V1-PRODUCTION-M2-QA-UAT-002',
    'xulmpqaknlwqqculbsek',
    repeat('c',64),
    '93939393-9393-4393-8393-939393939393',
    v_now,
    v_now+interval '480 seconds',
    v_now+interval '540 seconds',
    v_now+interval '840 seconds',
    'CLOSED',
    'CLOSED',
    v_now+interval '100 minutes',
    v_now+interval '101 minutes',
    '95959595-9595-4595-8595-959595959595',
    v_now+interval '102 minutes',
    '92929292-9292-4292-8292-929292929292',
    'HISTORICAL_AUDIT_ONLY'
  );
END;
$historical$;
SQL

WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
WOS_QA_DATABASE="$DB" \
  node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
    install-closer-only

[[ "$(psql_db "$DB" -qAt -c "
  SELECT to_regclass('wos_v1_qa_closer.controls') IS NOT NULL
    AND to_regclass('wos_v1_qa_closer.arm_receipts') IS NOT NULL
    AND to_regclass('wos_v1_qa_closer.close_receipts') IS NOT NULL
    AND to_regclass('wos_v1_qa_uat.write_gates') IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)'
    ) IS NULL
")" = 't' ]] || fail 'CLOSER_ONLY_CREATED_BUSINESS_OBJECTS'
echo 'WOS_V1_QA_CLOSER_ONLY_INSTALL=PASS'
echo 'WOS_V1_QA_CLOSER_ONLY_NO_BUSINESS_OBJECTS=PASS'

psql_db "$DB" -q <<'SQL'
INSERT INTO wos_v1_qa_closer.close_receipts(
  execution_id,closer_kind,authorization_id,project_ref,code_sha256,
  request_id,closed_at,cleanup_deadline_at,timely,reason
) VALUES(
  '92929292-9292-4292-8292-929292929292',
  'DB',
  'WOS-V1-PRODUCTION-M2-QA-UAT-002',
  'xulmpqaknlwqqculbsek',
  repeat('c',64),
  '94949494-9494-4494-8494-949494949491',
  clock_timestamp()-interval '100 minutes',
  clock_timestamp()-interval '2 hours'+interval '540 seconds',
  true,
  'HISTORICAL_AUDIT_ONLY'
),(
  '92929292-9292-4292-8292-929292929292',
  'EDGE',
  'WOS-V1-PRODUCTION-M2-QA-UAT-002',
  'xulmpqaknlwqqculbsek',
  repeat('c',64),
  '94949494-9494-4494-8494-949494949492',
  clock_timestamp()-interval '99 minutes',
  clock_timestamp()-interval '2 hours'+interval '840 seconds',
  true,
  'HISTORICAL_AUDIT_ONLY'
);
SQL

[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*)=1
    AND min(authorization_id)='WOS-V1-PRODUCTION-M2-QA-UAT-002'
    AND min(db_state)='CLOSED'
    AND min(edge_state)='CLOSED'
  FROM wos_v1_qa_closer.controls
  WHERE execution_id='92929292-9292-4292-8292-929292929292'::uuid;
")" = 't' ]] || fail 'CLOSER_ONLY_HISTORICAL_AUDIT_ROW_CHANGED'
echo 'WOS_V1_QA_CLOSER_ONLY_HISTORICAL_AUDIT_RETAINED=PASS'

AUTH_CONSTRAINT_DEF="$(psql_db "$DB" -qAt -c "
  SELECT pg_get_constraintdef(constraint_row.oid)
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid=
      'wos_v1_qa_closer.controls'::regclass
    AND constraint_row.conname=
      'wos_v1_qa_closer_controls_authorization_id_check';
")"
[[ "$AUTH_CONSTRAINT_DEF" == *authorization_id*WOS-V1-PRODUCTION-M2-QA-UAT-* ]] \
  || fail 'CLOSER_ONLY_AUTHORIZATION_CONSTRAINT_MIGRATION_FAILED'
echo 'WOS_V1_QA_CLOSER_ONLY_AUTH_CONSTRAINT_MIGRATED=PASS'

[[ "$(psql_db "$DB" -qAt -c "
  SELECT NOT has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_edge_heartbeat(uuid,uuid,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.wos_v1_qa_uat_edge_control_status(text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)',
      'EXECUTE'
    )
")" = 't' ]] || fail 'CLOSER_ONLY_ACL_INVALID'
echo 'WOS_V1_QA_CLOSER_ONLY_NO_AUTHENTICATED_EXECUTE=PASS'

DB_ARM="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_ARM_TOKEN="$ARM_TOKEN" \
  WOS_V1_QA_CODE_SHA256="$CODE_SHA" \
  WOS_V1_QA_DB_CLOSER_MOCK_CRON='true' \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      arm-closer-only
)"
[[ "$(printf '%s' "$DB_ARM" | jq -r '.status')" = 'ARMED' ]] \
  || fail 'CLOSER_ONLY_DB_ARM_FAILED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT db_state='ARMED'
    AND db_last_heartbeat_at IS NOT NULL
    AND db_cron_job_id IS NOT NULL
    AND (SELECT count(*) FROM wos_v1_qa_closer.arm_receipts
      WHERE closer_kind='DB')=1
  FROM wos_v1_qa_closer.controls
  WHERE execution_id='$EXECUTION_ID'::uuid
")" = 't' ]] || fail 'CLOSER_ONLY_DB_ARM_RECEIPT_INVALID'
echo 'WOS_V1_QA_CLOSER_ONLY_DB_ARM=PASS'

EDGE_PREFLIGHT="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_preflight(
    '$EXECUTION_ID'::uuid,
    '$ARM_TOKEN'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
")"
[[ "$(printf '%s' "$EDGE_PREFLIGHT" | jq -r '.status')" = 'PREFLIGHT' ]] \
  || fail 'CLOSER_ONLY_EDGE_PREFLIGHT_FAILED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT edge_process_nonce='$EDGE_NONCE'::uuid
    AND NOT EXISTS(
      SELECT 1
      FROM wos_v1_qa_closer.arm_receipts
      WHERE execution_id='$EXECUTION_ID'::uuid
        AND closer_kind='EDGE'
    )
  FROM wos_v1_qa_closer.controls
  WHERE execution_id='$EXECUTION_ID'::uuid
")" = 't' ]] || fail 'CLOSER_ONLY_EDGE_PREFLIGHT_CREATED_ARM_RECEIPT'
echo 'WOS_V1_QA_CLOSER_ONLY_EDGE_PREFLIGHT=PASS'

psql_db "$DB" -qAt -c "
  SELECT wos_v1_qa_closer.record_edge_heartbeat(
    '$EXECUTION_ID'::uuid,
    '$ARM_TOKEN'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
" >/dev/null
PROBE_OPEN="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
")"
[[ "$(printf '%s' "$PROBE_OPEN" | jq -r '.status')" = 'OPEN' ]] \
  || fail 'CLOSER_ONLY_PROBE_OPEN_INVALID'
[[ "$(printf '%s' "$PROBE_OPEN" | jq -r '.edgeProcessNonce')" = "$EDGE_NONCE" ]] \
  || fail 'CLOSER_ONLY_PROBE_OPEN_NONCE_MISMATCH'
EDGE_STALE_AT='2026-11-27T00:00:00Z'
psql_db "$DB" -q -c "
  UPDATE wos_v1_qa_closer.controls
  SET edge_last_heartbeat_at='$EDGE_STALE_AT'::timestamptz
  WHERE execution_id='$EXECUTION_ID'::uuid;
  UPDATE wos_v1_qa_closer.arm_receipts
  SET heartbeat_at='$EDGE_STALE_AT'::timestamptz
  WHERE execution_id='$EXECUTION_ID'::uuid
    AND closer_kind='EDGE';
" >/dev/null
psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_preflight(
    '$EXECUTION_ID'::uuid,
    '$ARM_TOKEN'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
" >/dev/null
[[ "$(psql_db "$DB" -qAt -c "
  SELECT edge_last_heartbeat_at='$EDGE_STALE_AT'::timestamptz
    AND (
      SELECT receipt.heartbeat_at='$EDGE_STALE_AT'::timestamptz
      FROM wos_v1_qa_closer.arm_receipts receipt
      WHERE receipt.execution_id='$EXECUTION_ID'::uuid
        AND receipt.closer_kind='EDGE'
    )
  FROM wos_v1_qa_closer.controls
  WHERE execution_id='$EXECUTION_ID'::uuid
")" = 't' ]] || fail 'CLOSER_ONLY_PREFLIGHT_REFRESHED_STALE_EDGE'
PROBE_STALE_AFTER_PREFLIGHT="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
")"
[[ "$(printf '%s' "$PROBE_STALE_AFTER_PREFLIGHT" | jq -r '.status')" = 'STALE' ]] \
  || fail 'CLOSER_ONLY_STALE_EDGE_PREFLIGHT_OPENED'
psql_db "$DB" -qAt -c "
  SELECT wos_v1_qa_closer.record_edge_heartbeat(
    '$EXECUTION_ID'::uuid,
    '$ARM_TOKEN'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
" >/dev/null
echo 'WOS_V1_QA_CLOSER_ONLY_STALE_EDGE_PREFLIGHT_DENIED=PASS'
psql_db "$DB" -q -c "
  UPDATE wos_v1_qa_closer.controls
  SET db_last_heartbeat_at=clock_timestamp()-interval '31 seconds'
  WHERE execution_id='$EXECUTION_ID'::uuid;
" >/dev/null
PROBE_STALE="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
")"
[[ "$(printf '%s' "$PROBE_STALE" | jq -r '.status')" = 'STALE' ]] \
  || fail 'CLOSER_ONLY_PROBE_STALE_INVALID'
[[ "$(printf '%s' "$PROBE_STALE" | jq -r '.edgeProcessNonce')" = "$EDGE_NONCE" ]] \
  || fail 'CLOSER_ONLY_PROBE_STALE_NONCE_MISMATCH'
psql_db "$DB" -q -c "
  UPDATE wos_v1_qa_closer.controls
  SET db_last_heartbeat_at=clock_timestamp(),
      edge_last_heartbeat_at=clock_timestamp()
  WHERE execution_id='$EXECUTION_ID'::uuid;
" >/dev/null
PROBE_NOT_ARMED="$(psql_db "$DB" -qAt -c "
  BEGIN;
  DELETE FROM wos_v1_qa_closer.arm_receipts
  WHERE execution_id='$EXECUTION_ID'::uuid
    AND closer_kind='EDGE';
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
  ROLLBACK;
")"
[[ "$(printf '%s' "$PROBE_NOT_ARMED" | jq -r '.status')" = 'NOT_ARMED' ]] \
  || fail 'CLOSER_ONLY_PROBE_NOT_ARMED_INVALID'
[[ "$(printf '%s' "$PROBE_NOT_ARMED" | jq -r '.edgeProcessNonce')" = "$EDGE_NONCE" ]] \
  || fail 'CLOSER_ONLY_PROBE_NOT_ARMED_NONCE_MISMATCH'
PROBE_RECEIPT_DRIFT="$(psql_db "$DB" -qAt -c "
  BEGIN;
  UPDATE wos_v1_qa_closer.arm_receipts
  SET cleanup_deadline_at=cleanup_deadline_at+interval '1 second'
  WHERE execution_id='$EXECUTION_ID'::uuid
    AND closer_kind='EDGE';
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
  ROLLBACK;
")"
[[ "$(printf '%s' "$PROBE_RECEIPT_DRIFT" | jq -r '.status')" = 'NOT_ARMED' ]] \
  || fail 'CLOSER_ONLY_PROBE_RECEIPT_DRIFT_INVALID'
echo 'WOS_V1_QA_CLOSER_ONLY_PROBE_OPEN_AND_STALE=PASS'
echo 'WOS_V1_QA_CLOSER_ONLY_PROBE_NOT_ARMED=PASS'
echo 'WOS_V1_QA_CLOSER_ONLY_PROBE_RECEIPT_DRIFT_DENIED=PASS'

WOS_QA_UAT_CLOSER_EXECUTION_ID="$EXECUTION_ID" \
WOS_QA_UAT_CLOSER_ARM_TOKEN="$ARM_TOKEN" \
WOS_QA_UAT_EDGE_PROCESS_NONCE="$EDGE_NONCE" \
WOS_QA_UAT_CLOSER_CODE_SHA="$CODE_SHA" \
WOS_QA_CLOSER_CONTROL_SCHEMA='wos_v1_qa_closer' \
WOS_QA_UAT_EDGE_CLOSE_RECEIPT_OUTPUT="$EDGE_RECEIPT_PATH" \
WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
WOS_QA_DATABASE="$DB" \
  node "$ROOT/tests/live/wos-v1-qa-edge-closer-process-kill.mjs" \
  || fail 'CLOSER_ONLY_EDGE_PROCESS_TEST_FAILED'
echo 'WOS_V1_QA_CLOSER_ONLY_EDGE_LOCAL=PASS'

DB_CLOSE="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_CLOSE_REQUEST_ID="96000000-0000-4000-8000-000000000001" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      close-closer-only
)"
[[ "$(printf '%s' "$DB_CLOSE" | jq -r '.status')" = 'CLOSED' ]] \
  || fail 'CLOSER_ONLY_DB_CLOSE_FAILED'
[[ "$(printf '%s' "$DB_CLOSE" | jq -r '.cronUnscheduled')" = 'true' ]] \
  || fail 'CLOSER_ONLY_DB_CRON_NOT_UNSCHEDULED'
DB_CLOSE_REPLAY="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_CLOSE_REQUEST_ID="96000000-0000-4000-8000-000000000002" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      close-closer-only
)"
[[ "$(printf '%s' "$DB_CLOSE_REPLAY" | jq -r '.status')" = 'REPLAYED' ]] \
  || fail 'CLOSER_ONLY_DB_CLOSE_REPLAY_STATUS_INVALID'
[[ "$(printf '%s' "$DB_CLOSE_REPLAY" | jq -r '.cronUnscheduled')" = 'true' ]] \
  || fail 'CLOSER_ONLY_DB_CLOSE_REPLAY_CRON_INVALID'
echo 'WOS_V1_QA_CLOSER_ONLY_DB_CLOSE_AND_CRON_DELETE=PASS'

if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      recover-closer-only >/tmp/wos-closer-only-unprobed-recovery-$$.log 2>&1
then
  fail 'CLOSER_ONLY_RECOVERY_ALLOWED_WITHOUT_EDGE_PROBE'
fi
grep -q 'WOS_V1_QA_CLOSER_ONLY_RECOVERY_REQUIRES_VERIFIED_CLOSE' \
  /tmp/wos-closer-only-unprobed-recovery-$$.log \
  || fail 'CLOSER_ONLY_UNPROBED_RECOVERY_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_UNPROBED_RECOVERY_DENIED=PASS'

psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  )::text;
" >/dev/null
[[ "$(psql_db "$DB" -qAt -c "
  SELECT edge_probe_verified_at IS NOT NULL
    AND edge_probe_execution_id='$EXECUTION_ID'::uuid
  FROM wos_v1_qa_closer.controls
  WHERE execution_id='$EXECUTION_ID'::uuid
")" = 't' ]] || fail 'CLOSER_ONLY_EDGE_PROBE_EVIDENCE_MISSING'
echo 'WOS_V1_QA_CLOSER_ONLY_EDGE_PROBE_EVIDENCE=PASS'

if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_EDGE_CLOSER_STATE_PATH="/tmp/wos-missing-edge-receipt-$$.json" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      recover-closer-only >/tmp/wos-closer-only-missing-receipt-$$.log 2>&1
then
  fail 'CLOSER_ONLY_RECOVERY_ALLOWED_WITHOUT_EDGE_RECEIPT_FILE'
fi
grep -q 'WOS_V1_QA_EDGE_CLOSE_RECEIPT_MISSING' \
  /tmp/wos-closer-only-missing-receipt-$$.log \
  || fail 'CLOSER_ONLY_MISSING_RECEIPT_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_EDGE_RECEIPT_FILE_REQUIRED=PASS'

TAMPERED_SEMANTIC_PATH="/tmp/wos-tampered-edge-semantic-$$.json"
node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  source.closeReceipt.probe.status = 200;
  source.closeReceipt.receiptSha256 = crypto.createHash("sha256")
    .update(JSON.stringify({
      authorizationId: source.closeReceipt.authorizationId,
      projectRef: source.closeReceipt.projectRef,
      executionId: source.closeReceipt.executionId,
      codeSha256: source.closeReceipt.codeSha256,
      processNonce: source.closeReceipt.processNonce,
      launchAgentUnloaded: source.closeReceipt.launchAgentUnloaded,
      result: source.closeReceipt.result,
      probe: source.closeReceipt.probe,
    }))
    .digest("hex");
  fs.writeFileSync(process.argv[2], `${JSON.stringify(source, null, 2)}\n`);
' "$EDGE_RECEIPT_PATH" "$TAMPERED_SEMANTIC_PATH"
if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_EDGE_CLOSER_STATE_PATH="$TAMPERED_SEMANTIC_PATH" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      recover-closer-only >/tmp/wos-closer-only-tampered-semantic-$$.log 2>&1
then
  fail 'CLOSER_ONLY_RECOVERY_ALLOWED_TAMPERED_PROBE_SEMANTICS'
fi
grep -q 'WOS_V1_QA_EDGE_CLOSE_RECEIPT_INVALID' \
  /tmp/wos-closer-only-tampered-semantic-$$.log \
  || fail 'CLOSER_ONLY_TAMPERED_SEMANTIC_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_TAMPERED_PROBE_SEMANTICS_DENIED=PASS'

TAMPERED_TIMESTAMP_PATH="/tmp/wos-tampered-edge-timestamp-$$.json"
node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  source.closeReceipt.probe.closedAt = "2099-01-01T00:00:00.000Z";
  source.closeReceipt.receiptSha256 = crypto.createHash("sha256")
    .update(JSON.stringify({
      authorizationId: source.closeReceipt.authorizationId,
      projectRef: source.closeReceipt.projectRef,
      executionId: source.closeReceipt.executionId,
      codeSha256: source.closeReceipt.codeSha256,
      processNonce: source.closeReceipt.processNonce,
      launchAgentUnloaded: source.closeReceipt.launchAgentUnloaded,
      result: source.closeReceipt.result,
      probe: source.closeReceipt.probe,
    }))
    .digest("hex");
  fs.writeFileSync(process.argv[2], `${JSON.stringify(source, null, 2)}\n`);
' "$EDGE_RECEIPT_PATH" "$TAMPERED_TIMESTAMP_PATH"
if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_EDGE_CLOSER_STATE_PATH="$TAMPERED_TIMESTAMP_PATH" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      recover-closer-only >/tmp/wos-closer-only-tampered-timestamp-$$.log 2>&1
then
  fail 'CLOSER_ONLY_RECOVERY_ALLOWED_MISMATCHED_CLOSED_AT'
fi
grep -q 'WOS_V1_QA_EDGE_CLOSE_RECEIPT_INVALID' \
  /tmp/wos-closer-only-tampered-timestamp-$$.log \
  || fail 'CLOSER_ONLY_TAMPERED_TIMESTAMP_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_MISMATCHED_CLOSED_AT_DENIED=PASS'

TAMPERED_HASH_PATH="/tmp/wos-tampered-edge-hash-$$.json"
node -e '
  const fs = require("node:fs");
  const source = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  source.closeReceipt.result.deadlineAt =
    "2099-01-01T00:00:00.000Z";
  fs.writeFileSync(process.argv[2], `${JSON.stringify(source, null, 2)}\n`);
' "$EDGE_RECEIPT_PATH" "$TAMPERED_HASH_PATH"
if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
  WOS_V1_QA_EDGE_CLOSER_STATE_PATH="$TAMPERED_HASH_PATH" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      recover-closer-only >/tmp/wos-closer-only-tampered-hash-$$.log 2>&1
then
  fail 'CLOSER_ONLY_RECOVERY_ALLOWED_TAMPERED_RECEIPT_HASH'
fi
grep -q 'WOS_V1_QA_EDGE_CLOSE_RECEIPT_HASH_MISMATCH' \
  /tmp/wos-closer-only-tampered-hash-$$.log \
  || fail 'CLOSER_ONLY_TAMPERED_HASH_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_TAMPERED_RECEIPT_HASH_DENIED=PASS'

WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
WOS_QA_DATABASE="$DB" \
WOS_V1_QA_EXECUTION_ID="$EXECUTION_ID" \
WOS_V1_QA_EDGE_CLOSER_STATE_PATH="$EDGE_RECEIPT_PATH" \
  node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
    recover-closer-only

[[ "$(psql_db "$DB" -qAt -c "
  SELECT (SELECT count(*) FROM wos_v1_qa_closer.controls)=2
    AND (SELECT count(*) FROM wos_v1_qa_closer.close_receipts)=4
    AND EXISTS(
      SELECT 1
      FROM wos_v1_qa_closer.controls
      WHERE execution_id='92929292-9292-4292-8292-929292929292'::uuid
        AND authorization_id='WOS-V1-PRODUCTION-M2-QA-UAT-002'
        AND db_state='CLOSED'
        AND edge_state='CLOSED'
    )
    AND to_regprocedure(
      'public.wos_v1_qa_uat_edge_probe(uuid,uuid)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_close_edge(uuid,uuid,text)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'
    ) IS NULL
    AND to_regclass('wos_v1_qa_uat.write_gates') IS NULL
")" = 't' ]] || fail 'CLOSER_ONLY_RECOVERY_INVALID'
echo 'WOS_V1_QA_CLOSER_ONLY_RECOVERY=PASS'

WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
WOS_QA_DATABASE="$TICK_DB" \
  node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
    install-closer-only

psql_db "$TICK_DB" -q -c "
  CREATE FUNCTION public.wos_v1_m2_action(
    uuid,integer,uuid,text,jsonb
  ) RETURNS jsonb LANGUAGE plpgsql
  AS \$dummy\$
  BEGIN
    RAISE EXCEPTION 'DUMMY_ONLY';
  END;
  \$dummy\$;
  CREATE FUNCTION public.wos_v1_authorize_production_start(
    uuid,integer,uuid,uuid,text
  ) RETURNS jsonb LANGUAGE plpgsql
  AS \$dummy\$
  BEGIN
    RAISE EXCEPTION 'DUMMY_ONLY';
  END;
  \$dummy\$;
"
if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$TICK_DB" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      install-full-m2 >/tmp/wos-closer-only-full-conflict-$$.log 2>&1
then
  fail 'FULL_M2_INSTALL_REPLACED_CLOSER_ONLY_PUBLIC_API'
fi
grep -q 'WOS_V1_QA_CLOSER_ONLY_PUBLIC_API_OWNED' \
  /tmp/wos-closer-only-full-conflict-$$.log \
  || fail 'FULL_M2_CLOSER_CONFLICT_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_FULL_M2_CONFLICT_DENIED=PASS'

TICK_EXECUTION_ID="91919191-9191-4191-8191-919191919191"
psql_db "$TICK_DB" -q <<SQL
DO \$fixture\$
DECLARE
  v_now timestamptz:=clock_timestamp();
  v_job_id bigint;
BEGIN
  v_job_id:=cron.schedule(
    'wos_v1_qa_closer_tick_test',
    '10 seconds',
    'SELECT wos_v1_qa_closer.db_close_tick(
      ''$TICK_EXECUTION_ID''::uuid,
      ''97000000-0000-4000-8000-000000000001''::uuid
    );'
  );
  INSERT INTO wos_v1_qa_closer.controls(
    execution_id,authorization_id,project_ref,code_sha256,arm_token,opened_at,
    write_deadline_at,db_cleanup_deadline_at,edge_cleanup_deadline_at,
    edge_process_nonce,db_cron_job_id
  ) VALUES(
    '$TICK_EXECUTION_ID',
    'WOS-V1-PRODUCTION-M2-QA-UAT-017',
    'xulmpqaknlwqqculbsek',
    repeat('b',64),
    '$ARM_TOKEN',
    v_now-interval '481 seconds',
    v_now-interval '1 second',
    v_now+interval '59 seconds',
    v_now+interval '359 seconds',
    '$EDGE_NONCE',
    v_job_id
  );
END;
\$fixture\$;
SELECT wos_v1_qa_closer.db_close_tick(
  '$TICK_EXECUTION_ID'::uuid,
  '97000000-0000-4000-8000-000000000002'::uuid
)::text;
SQL

[[ "$(psql_db "$TICK_DB" -qAt -c "
  SELECT db_state='CLOSED'
    AND EXISTS(
      SELECT 1 FROM wos_v1_qa_closer.close_receipts receipt
      WHERE receipt.execution_id='$TICK_EXECUTION_ID'::uuid
        AND receipt.closer_kind='DB'
        AND receipt.timely=true
    )
    AND NOT EXISTS(
      SELECT 1 FROM cron.job
      WHERE jobname='wos_v1_qa_closer_tick_test'
    )
  FROM wos_v1_qa_closer.controls
  WHERE execution_id='$TICK_EXECUTION_ID'::uuid
")" = 't' ]] || fail 'CLOSER_ONLY_CRON_TICK_CLOSE_INVALID'
echo 'WOS_V1_QA_CLOSER_ONLY_DB_CRON_TICK_CLOSE=PASS'

psql_db "$TICK_DB" -q -c "
  SELECT wos_v1_qa_closer.close_edge_closer(
    '$TICK_EXECUTION_ID'::uuid,
    '97000000-0000-4000-8000-000000000003'::uuid,
    'TICK_TEST_EDGE_CLOSE'
  );
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$TICK_EXECUTION_ID'::uuid,
    '$EDGE_NONCE'::uuid
  );
  CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_edge_probe(
    p_execution_id uuid,
    p_process_nonce uuid
  ) RETURNS jsonb LANGUAGE sql
  AS \$foreign_probe\$
    SELECT jsonb_build_object('status','FOREIGN');
  \$foreign_probe\$;
" >/dev/null
if {
  printf "SET wos_v1.qa_closer_rollback_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$TICK_DB" -q \
  >/tmp/wos-closer-ownership-negative-$$.log 2>&1
then
  fail 'CLOSER_ONLY_ROLLBACK_DROPPED_FOREIGN_PUBLIC_API'
fi
grep -q 'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH' \
  /tmp/wos-closer-ownership-negative-$$.log \
  || fail 'CLOSER_ONLY_OWNERSHIP_ERROR_MISMATCH'
echo 'WOS_V1_QA_CLOSER_ONLY_FOREIGN_API_DROP_DENIED=PASS'

[[ "$(psql_db "$DB" -qAt -c "
  SELECT to_regclass('public.wos_production_orders') IS NULL
    AND to_regclass('public.wos_resource_readiness') IS NULL
    AND to_regclass('public.wos_confirmations') IS NULL
")" = 't' ]] || fail 'CLOSER_ONLY_FIXTURE_GAINED_BUSINESS_TABLES'
echo 'WOS_V1_QA_CLOSER_ONLY_NO_ORDER_OR_MATERIAL_WRITES=PASS'
echo 'WOS_V1_QA_CLOSER_ONLY_PG17=PASS'
