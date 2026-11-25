#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_v1_rollback_ci"

fail() {
  printf 'WOS_V1_RC02_GATE_PG17_FAILED=%s\n' "$1" >&2
  exit 1
}

[[ -n "$CONTAINER" ]] || fail 'CONTAINER_REQUIRED'
[[ "$CONTAINER" =~ ^codex-wos-prod-readiness-pg17-[A-Za-z0-9_.-]+$ ]] \
  || fail 'CONTAINER_NAME_NOT_OWNED'

CONTAINER_ID="$(docker inspect --format '{{.Id}}' "$CONTAINER")" \
  || fail 'CONTAINER_NOT_FOUND'
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_ID")" = 'true' ]] \
  || fail 'CONTAINER_NOT_RUNNING'
[[ "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")" = 'postgres:17-alpine' ]] \
  || fail 'POSTGRES17_ALPINE_REQUIRED'

psql_db() {
  local database="$1"
  shift
  docker exec -i "$CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$database" "$@"
}

query_value() {
  psql_db "$1" -qAt -c "$2"
}

recreate_db() {
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
  psql_db postgres -q -c "CREATE DATABASE \"$DB\""
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  rm -f \
    "${AUTH_ONE_LOG:-}" \
    "${AUTH_TWO_LOG:-}" \
    "${CREATE_ONE_LOG:-}" \
    "${CREATE_TWO_LOG:-}" \
    "${RECOVERY_REFUSAL_LOG:-}"
  if [[ "$status" -ne 0
    && "${WOS_RC02_KEEP_ON_FAILURE:-0}" = '1' ]]; then
    printf 'WOS_V1_RC02_GATE_DB_RETAINED=%s\n' "$DB"
    exit "$status"
  fi
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

[[ "$(query_value postgres "
  SELECT current_setting('server_version_num')::integer
    BETWEEN 170000 AND 179999
")" = 't' ]] || fail 'POSTGRESQL17_REQUIRED'

recreate_db
psql_db "$DB" -q < "$ROOT/tests/sql/wos_production_bootstrap_fixture.sql"
psql_db "$DB" -q -1 < "$ROOT/supabase/production-bootstrap/20261123_app_schema.sql"

{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/supabase/migrations/20261014102000_workshop_order_system_foundation.sql"
  printf "\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_FOUNDATION_CONTAINMENT_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q -1

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos_p8_p7_production_compatible_candidate.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos_p8_p7_service_proof_and_cleanup.sql"
{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

psql_db "$DB" -q -c "
  INSERT INTO public.organizations(id,name)
  VALUES (
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'RC02 QA Organization'
  )
"

{
  printf "SET wos_v1.rc02_install_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-rc02-gate-pg17-assertions.sql"

AUTH_ONE_LOG="$(mktemp)"
AUTH_TWO_LOG="$(mktemp)"
CREATE_ONE_LOG="$(mktemp)"
CREATE_TWO_LOG="$(mktemp)"

docker exec -i "$CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DB" \
  -v authorization_id='WOS-V1-RC02-PG17-CONCURRENT-AUTHORIZE-ONE' \
  -v request_id='73000000-0000-4000-8000-000000000010' \
  -v order_number='QA-NONPROD-PG17-73000000-0000-4000-8000-000000000010' \
  < "$ROOT/tests/sql/wos-v1-rc02-concurrent-authorize.sql" \
  >"$AUTH_ONE_LOG" 2>&1 &
AUTH_ONE_PID=$!
docker exec -i "$CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DB" \
  -v authorization_id='WOS-V1-RC02-PG17-CONCURRENT-AUTHORIZE-TWO' \
  -v request_id='73000000-0000-4000-8000-000000000011' \
  -v order_number='QA-NONPROD-PG17-73000000-0000-4000-8000-000000000011' \
  < "$ROOT/tests/sql/wos-v1-rc02-concurrent-authorize.sql" \
  >"$AUTH_TWO_LOG" 2>&1 &
AUTH_TWO_PID=$!

set +e
wait "$AUTH_ONE_PID"
AUTH_ONE_STATUS=$?
wait "$AUTH_TWO_PID"
AUTH_TWO_STATUS=$?
set -e

[[ $((AUTH_ONE_STATUS + AUTH_TWO_STATUS)) -ne 0 ]] \
  || fail 'CONCURRENT_AUTHORIZATIONS_BOTH_SUCCEEDED'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM wos_qa_safety.rc02_business_grants
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
")" = '1' ]] || fail 'CONCURRENT_ACTIVE_AUTHORIZATION_COUNT'
if ! grep -Eq \
    'rc02_one_active_authorization|duplicate key value violates unique constraint' \
    "$AUTH_ONE_LOG" "$AUTH_TWO_LOG"; then
  fail 'CONCURRENT_AUTHORIZATION_WRONG_ERROR'
fi

psql_db "$DB" -q -c "
  UPDATE wos_qa_safety.rc02_business_grants
  SET state='CLOSED', enabled_until=NULL, closed_at=clock_timestamp()
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
"

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-rc02-concurrent-create-grant.sql"

docker exec -i "$CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DB" \
  < "$ROOT/tests/sql/wos-v1-rc02-concurrent-create.sql" \
  >"$CREATE_ONE_LOG" 2>&1 &
CREATE_ONE_PID=$!
docker exec -i "$CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DB" \
  < "$ROOT/tests/sql/wos-v1-rc02-concurrent-create.sql" \
  >"$CREATE_TWO_LOG" 2>&1 &
CREATE_TWO_PID=$!

set +e
wait "$CREATE_ONE_PID"
CREATE_ONE_STATUS=$?
wait "$CREATE_TWO_PID"
CREATE_TWO_STATUS=$?
set -e

[[ "$CREATE_ONE_STATUS" -eq 0 && "$CREATE_TWO_STATUS" -eq 0 ]] \
  || fail 'CONCURRENT_CREATE_DID_NOT_RESOLVE'
grep -q '"status": "CREATED"' "$CREATE_ONE_LOG" "$CREATE_TWO_LOG" \
  || fail 'CONCURRENT_CREATE_MISSING_CREATED'
grep -q '"status": "REPLAYED"' "$CREATE_ONE_LOG" "$CREATE_TWO_LOG" \
  || fail 'CONCURRENT_CREATE_MISSING_REPLAYED'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-73000000-0000-4000-8000-000000000001'
")" = '1' ]] || fail 'CONCURRENT_CREATE_ORDER_COUNT'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM public.wos_order_create_receipts
  WHERE request_id='73000000-0000-4000-8000-000000000001'
")" = '1' ]] || fail 'CONCURRENT_CREATE_RECEIPT_COUNT'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM wos_qa_safety.rc02_business_grants
  WHERE request_id='73000000-0000-4000-8000-000000000001'
    AND state='ORDER_BOUND'
")" = '1' ]] || fail 'CONCURRENT_CREATE_NOT_BOUND'

psql_db "$DB" -q -c "
  UPDATE wos_qa_safety.rc02_business_grants
  SET state='CLOSED', enabled_until=NULL, closed_at=clock_timestamp()
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
"
[[ "$(query_value "$DB" "
  SELECT count(*) FROM wos_qa_safety.rc02_business_grants
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
")" = '0' ]] || fail 'RC02_FINAL_ACTIVE_GRANTS'

WOS_PG_DOCKER_CONTAINER="$CONTAINER_ID" \
  node "$ROOT/tests/sql/wos-v1-rc02-postgrest-smoke.mjs"

psql_db "$DB" -q \
  -v authorization_id='WOS-V1-RC02-PG17-RECOVERY-REFUSAL' \
  -v request_id='73000000-0000-4000-8000-000000000020' \
  -v order_number='QA-NONPROD-PG17-73000000-0000-4000-8000-000000000020' \
  < "$ROOT/tests/sql/wos-v1-rc02-concurrent-authorize.sql"

RECOVERY_REFUSAL_LOG="$(mktemp)"
set +e
{
  printf "SET wos_v1.rc02_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" >"$RECOVERY_REFUSAL_LOG" 2>&1
RECOVERY_REFUSAL_STATUS=$?
set -e
[[ "$RECOVERY_REFUSAL_STATUS" -ne 0 ]] \
  || fail 'RECOVERY_ACCEPTED_ACTIVE_GRANT'
grep -q 'RC02_ACTIVE_GRANT_MUST_BE_CLOSED' "$RECOVERY_REFUSAL_LOG" \
  || fail 'RECOVERY_ACTIVE_GRANT_WRONG_ERROR'

OBJECT_COUNT_BEFORE_RECOVERY="$(query_value "$DB" "
  SELECT count(*) FROM storage.objects
")"
ORDER_COUNT_BEFORE_RECOVERY="$(query_value "$DB" "
  SELECT count(*) FROM public.wos_production_orders
")"

psql_db "$DB" -q -c "
  UPDATE wos_qa_safety.rc02_business_grants
  SET state='CLOSED', enabled_until=NULL, closed_at=clock_timestamp()
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
"
{
  printf "SET wos_v1.rc02_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(query_value "$DB" "
  SELECT to_regclass('wos_qa_safety.rc02_business_grants') IS NULL
")" = 't' ]] || fail 'RECOVERY_LEFT_GATE_TABLE'
[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_qa_safety') IS NULL
")" = 't' ]] || fail 'RECOVERY_LEFT_SCHEMA'
[[ "$(query_value "$DB" "
  SELECT count(*)
  FROM pg_proc function_row
  JOIN pg_namespace namespace_row
    ON namespace_row.oid=function_row.pronamespace
  WHERE namespace_row.nspname='wos_qa_safety'
")" = '0' ]] || fail 'RECOVERY_LEFT_FUNCTIONS'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM pg_trigger
  WHERE NOT tgisinternal AND tgname LIKE 'rc02_%'
")" = '0' ]] || fail 'RECOVERY_LEFT_TRIGGERS'
[[ "$(query_value "$DB" "
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND policyname='wos_p8_private_insert'
  )
")" = 't' ]] || fail 'RECOVERY_DID_NOT_RESTORE_POLICY'
[[ "$(query_value "$DB" "
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND policyname='wos_qa_rc02_private_insert'
  )
")" = 't' ]] || fail 'RECOVERY_LEFT_RC02_POLICY'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM storage.objects
")" = "$OBJECT_COUNT_BEFORE_RECOVERY" ]] || fail 'RECOVERY_CHANGED_STORAGE'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM public.wos_production_orders
")" = "$ORDER_COUNT_BEFORE_RECOVERY" ]] || fail 'RECOVERY_CHANGED_ORDERS'

echo 'WOS_V1_RC02_GATE_PG17=PASS'
echo 'WOS_V1_RC02_CONCURRENT_AUTHORIZE=PASS'
echo 'WOS_V1_RC02_CONCURRENT_CREATE_REPLAY=PASS'
echo 'WOS_V1_RC02_RECOVERY_ACTIVE_REFUSAL=PASS'
echo 'WOS_V1_RC02_RECOVERY_RESTORES_POLICY=PASS'
echo 'WOS_V1_RC02_NO_CLOUD_QA_CONNECTION=PASS'
