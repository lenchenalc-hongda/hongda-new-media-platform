#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
[[ -n "$CONTAINER" ]] || {
  echo 'WOS_V1_CONCURRENCY_FAILED=CONTAINER_REQUIRED' >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

psql_db() {
  docker exec -i "$CONTAINER" env -u PGHOST -u PGPORT -u PGUSER \
    -u PGPASSWORD -u PGDATABASE -u PGOPTIONS -u DATABASE_URL \
    -u DIRECT_URL -u SUPABASE_URL -u SUPABASE_DB_URL -u SERVICE_ROLE_KEY \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d wos_prod_bootstrap_ci "$@"
}

psql_db -q < "$ROOT/tests/sql/wos_v1_production_concurrency_setup.sql"

run_action() {
  local request_id="$1"
  local reason="$2"
  local output="$3"
  psql_db -qAt -c "
    SET request.jwt.claim.sub='90909090-9090-4090-8090-909090909090';
    SET request.jwt.claim.role='authenticated';
    SET ROLE authenticated;
    SELECT public.wos_operator_order_action(
      '88888888-8888-4888-8888-888888888888',
      2,
      '$request_id',
      'ACCEPT',
      '$reason'
    );
  " >"$output" 2>&1
}

run_action \
  '81818181-8181-4181-8181-818181818181' \
  'Synthetic concurrent accept request one' \
  "$tmp/action-one.log" &
first_pid=$!
run_action \
  '82828282-8282-4282-8282-828282828282' \
  'Synthetic concurrent accept request two' \
  "$tmp/action-two.log" &
second_pid=$!

set +e
wait "$first_pid"
first_status=$?
wait "$second_pid"
second_status=$?
set -e

success_count=0
conflict_count=0
for status in "$first_status" "$second_status"; do
  if [[ "$status" -eq 0 ]]; then
    success_count=$((success_count + 1))
  fi
done
for log in "$tmp/action-one.log" "$tmp/action-two.log"; do
  if grep -q 'VERSION_CONFLICT' "$log"; then
    conflict_count=$((conflict_count + 1))
  fi
done

if [[ "$success_count" -ne 1 || "$conflict_count" -ne 1 ]]; then
  echo 'WOS_V1_CONCURRENCY_FAILED=EXPECTED_ONE_SUCCESS_ONE_CONFLICT' >&2
  cat "$tmp/action-one.log" "$tmp/action-two.log" >&2
  exit 1
fi

state="$(psql_db -qAt -F '|' -c "
  SELECT
    version,
    workflow_status,
    (
      SELECT count(*) FROM public.wos_operator_action_receipts
      WHERE order_id = production_order.id
    ),
    (
      SELECT count(*) FROM public.wos_status_history
      WHERE entity_id = production_order.id
        AND reason_code = 'P2_OPERATOR_ACCEPT'
    )
  FROM public.wos_production_orders production_order
  WHERE id = '88888888-8888-4888-8888-888888888888';
")"
[[ "$state" == '3|WORKSHOP_REVIEW|1|1' ]] || {
  echo "WOS_V1_CONCURRENCY_FAILED=STATE_${state}" >&2
  exit 1
}

echo 'WOS_V1_PG17_CONCURRENT_VERSION_CAS=PASS'
