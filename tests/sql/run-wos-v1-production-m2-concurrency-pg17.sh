#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="${WOS_PG_DATABASE:-wos_v1_production_m2_concurrency}"
ORDER='33333333-3333-4333-8333-333333333333'

fail() {
  printf 'WOS_V1_PRODUCTION_M2_CONCURRENCY_FAILED=%s\n' "$1" >&2
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
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$1" "${@:2}"
}

ONE_LOG="$(mktemp)"
TWO_LOG="$(mktemp)"
cleanup() {
  status=$?
  trap - EXIT INT TERM
  rm -f "$ONE_LOG" "$TWO_LOG"
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$DB\""
psql_db "$DB" -q < "$ROOT/tests/sql/wos-v1-production-m2-pg17-fixture.sql"
psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql"
{
  printf "SET wos_v1.production_m2_activation_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

psql_db "$DB" -q <<'SQL'
SELECT set_config(
  'request.jwt.claim.sub',
  '10101010-1010-4010-8010-101010101010',
  false
);
SET ROLE authenticated;
SELECT public.wos_v1_m2_action(
  '33333333-3333-4333-8333-333333333333',
  7,
  '71111111-1111-4111-8111-111111111111',
  'BASELINE_SELECT',
  jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Concurrency baseline selection.',
    'imageIds',jsonb_build_array(
      '41111111-1111-4111-8111-111111111111',
      '42222222-2222-4222-8222-222222222222',
      '43333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444'
    )
  )
);
SELECT public.wos_v1_m2_action(
  '33333333-3333-4333-8333-333333333333',
  8,
  '72222222-2222-4222-8222-222222222222',
  'BASELINE_OFFICE_CONFIRM',
  jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Concurrency office confirmation.',
    'baselineId',(
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND status='DRAFT'
    )
  )
);
SQL

run_workshop() {
  local request_id="$1"
  local log_file="$2"
  docker exec -e PGAPPNAME="wos-production-m2-concurrency-$request_id" \
    -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" \
    >"$log_file" 2>&1 <<SQL &
SELECT set_config(
  'request.jwt.claim.sub',
  '20202020-2020-4020-8020-202020202020',
  false
);
SET ROLE authenticated;
BEGIN;
SELECT public.wos_v1_m2_action(
  '$ORDER',
  9,
  '$request_id'::uuid,
  'BASELINE_WORKSHOP_CONFIRM',
  jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Concurrent workshop confirmation transaction.',
    'baselineId',(
      SELECT id FROM public.wos_visual_baselines
      WHERE entity_id='$ORDER' AND status='CURRENT'
    )
  )
);
SELECT pg_catalog.pg_sleep(1);
COMMIT;
SQL
}

run_workshop '73333333-3333-4333-8333-333333333333' "$ONE_LOG"
FIRST_PID=$!
sleep 0.2
run_workshop '74444444-4444-4444-8444-444444444444' "$TWO_LOG"
SECOND_PID=$!

set +e
wait "$FIRST_PID"
FIRST_STATUS=$?
wait "$SECOND_PID"
SECOND_STATUS=$?
set -e

[[ "$FIRST_STATUS" -eq 0 || "$SECOND_STATUS" -eq 0 ]] \
  || fail 'NO_WORKSHOP_CONFIRM_SUCCEEDED'
[[ "$FIRST_STATUS" -ne 0 || "$SECOND_STATUS" -ne 0 ]] \
  || fail 'BOTH_WORKSHOP_CONFIRMS_SUCCEEDED'
grep -q 'VERSION_CONFLICT' "$ONE_LOG" "$TWO_LOG" \
  || fail 'CAS_CONFLICT_NOT_OBSERVED'

STATE="$(psql_db "$DB" -qAt -c "
  SELECT workflow_status||':'||version
  FROM public.wos_production_orders WHERE id='$ORDER'
")"
RECEIPTS="$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_v1_m2_receipts
  WHERE action='BASELINE_WORKSHOP_CONFIRM'
")"
[[ "$STATE" = 'WAITING_MATERIAL:10' ]] || fail 'ORDER_CAS_STATE_INVALID'
[[ "$RECEIPTS" = '1' ]] || fail 'DUPLICATE_WORKSHOP_RECEIPT'

echo 'WOS_V1_PRODUCTION_M2_CONCURRENCY=PASS'
echo 'WOS_V1_PRODUCTION_M2_CONCURRENCY_NO_CLOUD_CONNECTION=PASS'
