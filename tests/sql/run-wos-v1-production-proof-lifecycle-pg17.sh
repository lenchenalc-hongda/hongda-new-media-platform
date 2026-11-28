#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="${WOS_PG_PROOF_LIFECYCLE_DATABASE:-wos_v1_proof_lifecycle_ci}"

fail() {
  printf 'WOS_V1_PROOF_LIFECYCLE_PG17_FAILED=%s\n' "$1" >&2
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
  if [[ "$status" -eq 0 && "${WOS_PROOF_LIFECYCLE_KEEP_DB:-0}" = '1' ]]; then
    printf 'WOS_V1_PROOF_LIFECYCLE_DB_RETAINED=%s\n' "$DB"
    exit "$status"
  fi
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$DB\""
psql_db "$DB" -q < "$ROOT/tests/sql/wos-v1-production-m2-pg17-fixture.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-production-proof-renewal-test-prerequisites.sql"
psql_db "$DB" -q <<'SQL'
UPDATE public.wos_production_orders
SET version_label='V2'
WHERE id='33333333-3333-4333-8333-333333333333';
UPDATE public.wos_reference_images
SET version_label='V2'
WHERE entity_id='33333333-3333-4333-8333-333333333333';
SQL
psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql"
{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
{
  printf "SET wos_v1.production_m2_activation_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
psql_db "$DB" -q < "$ROOT/tests/sql/wos-v1-production-proof-lifecycle-pg17.sql"

psql_db "$DB" -q \
  < "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_DEACTIVATE_NOT_AUTHORIZED.sql"
{
  printf "SET wos_v1.production_m2_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
[[ "$(psql_db "$DB" -qAt -c "
  SELECT (SELECT count(*) FROM public.wos_v1_m2_receipts)>=4
    AND (SELECT count(*) FROM public.wos_v1_start_releases)>=1
")" = 't' ]] || fail 'DATA_RETAINING_RECOVERY_FAILED'

echo 'WOS_V1_PRODUCTION_PROOF_LIFECYCLE_PG17=PASS'
echo 'WOS_V1_PROOF_RENEWAL_TEN_MINUTE_BOUNDARY=PASS'
echo 'WOS_V1_PROOF_RENEWAL_TWENTY_FOUR_HOUR_BOUNDARY=PASS'
echo 'WOS_V1_PROOF_RENEWAL_PRESERVES_SIGNOFFS=PASS'
echo 'WOS_V1_PROOF_CONTENT_CHANGE_INVALIDATES=PASS'
echo 'WOS_V1_PROOF_LIFECYCLE_DATA_RETAINING_RECOVERY=PASS'
