#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="${WOS_PG_DATABASE:-wos_v1_production_m2_ci}"

fail() {
  printf 'WOS_V1_PRODUCTION_M2_PG17_FAILED=%s\n' "$1" >&2
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
  if [[ "$status" -eq 0 && "${WOS_PRODUCTION_M2_KEEP_DB:-0}" = '1' ]]; then
    printf 'WOS_V1_PRODUCTION_M2_DB_RETAINED=%s\n' "$DB"
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
psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql"
[[ "$(docker exec -i "$CONTAINER" psql -X -qAt -U postgres -d "$DB" -c "
  SELECT has_function_privilege(
    'authenticated',
    'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  )
")" = 'f' ]] || fail 'M2_EXECUTE_GRANTED_BEFORE_ACTIVATION'
{
  printf "SET wos_v1.production_m2_activation_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-production-m2-pg17-assertions.sql"
psql_db "$DB" -q \
  < "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_DEACTIVATE_NOT_AUTHORIZED.sql"
[[ "$(docker exec -i "$CONTAINER" psql -X -qAt -U postgres -d "$DB" -c "
  SELECT has_function_privilege(
    'authenticated',
    'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)',
    'EXECUTE'
  )
")" = 'f' ]] || fail 'M2_EXECUTE_NOT_REVOKED'
{
  printf "SET wos_v1.production_m2_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
[[ "$(docker exec -i "$CONTAINER" psql -X -qAt -U postgres -d "$DB" -c "
  SELECT to_regprocedure(
    'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)'
  ) IS NULL
  AND to_regprocedure(
    'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)'
  ) IS NULL
  AND (SELECT count(*) FROM public.wos_v1_m2_receipts)=4
  AND (SELECT count(*) FROM public.wos_v1_start_releases)=1
  AND (SELECT count(*) FROM public.wos_resource_readiness
       WHERE entity_id='33333333-3333-4333-8333-333333333333')=4
")" = 't' ]] || fail 'M2_DATA_RETAINING_ROLLBACK_FAILED'

echo 'WOS_V1_PRODUCTION_M2_PG17=PASS'
echo 'WOS_V1_PRODUCTION_M2_NO_CLOUD_CONNECTION=PASS'
