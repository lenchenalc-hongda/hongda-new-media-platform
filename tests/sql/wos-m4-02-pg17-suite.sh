#!/usr/bin/env bash
set -euo pipefail

# This suite refuses any non-disposable PostgreSQL 17 container and unsets all
# cloud/PostgREST connection variables before running.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_m4_02_pg17_${$}"
DB_OWNER="WOS_M4_02_PG17:${DB}"

guard_fail() {
  printf 'WOS_M4_02_PG17_GUARD_FAILED=%s\n' "$1" >&2
  exit 78
}

[[ -n "$CONTAINER" ]] || guard_fail 'WOS_PG_DOCKER_CONTAINER_REQUIRED'
[[ "$CONTAINER" =~ ^codex-wos-m4-02-pg17-[A-Za-z0-9_.-]+$ ]] \
  || guard_fail 'CONTAINER_NAME_NOT_OWNED'
[[ -S /var/run/docker.sock ]] || guard_fail 'LOCAL_DOCKER_SOCKET_REQUIRED'

export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGOPTIONS
unset DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SERVICE_ROLE_KEY

command -v docker >/dev/null 2>&1 || guard_fail 'DOCKER_CLI_REQUIRED'
CONTAINER_ID="$(docker inspect --format '{{.Id}}' "$CONTAINER" 2>/dev/null)" \
  || guard_fail 'CONTAINER_NOT_FOUND'
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_ID")" = 'true' ]] \
  || guard_fail 'CONTAINER_NOT_RUNNING'
[[ "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")" = 'postgres:17-alpine' ]] \
  || guard_fail 'CONTAINER_IMAGE_NOT_POSTGRES17_ALPINE'
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$CONTAINER_ID")" = 'none' ]] \
  || guard_fail 'CONTAINER_NETWORK_NOT_DISABLED'
[[ "$(docker inspect --format '{{index .Config.Labels "com.hongda.wos.disposable-pg17"}}' "$CONTAINER_ID")" = 'true' ]] \
  || guard_fail 'DISPOSABLE_CONTAINER_LABEL_REQUIRED'
[[ "$(docker inspect --format '{{index .Config.Labels "com.hongda.wos.test-purpose"}}' "$CONTAINER_ID")" = 'm4-02-proof-verifier' ]] \
  || guard_fail 'TEST_PURPOSE_LABEL_REQUIRED'

psql_run() {
  docker exec -i "$CONTAINER_ID" env -u PGHOST -u PGPORT -u PGUSER \
    -u PGPASSWORD -u PGDATABASE -u PGOPTIONS -u DATABASE_URL \
    -u DIRECT_URL -u SUPABASE_URL -u SUPABASE_DB_URL -u SERVICE_ROLE_KEY \
    psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
}

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  psql_run -q -d postgres -c \
    "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null 2>&1 || true
  psql_run -q -d postgres -c "
    DO \$cleanup\$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles role
        WHERE role.rolname = 'wos_m4_proof_verifier_owner'
          AND pg_catalog.shobj_description(role.oid, 'pg_authid')
            = 'WOS_M4_02_READONLY_PROOF_VERIFIER_OWNER_V1'
      ) THEN
        DROP ROLE wos_m4_proof_verifier_owner;
      END IF;
    END;
    \$cleanup\$;
  " >/dev/null 2>&1 || true
  exit "$rc"
}
trap cleanup EXIT INT TERM

SCOPE="$(psql_run -qAt -d postgres -c "
  SELECT pg_catalog.inet_server_addr() IS NULL
    AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
" )"
[[ "$SCOPE" = 't' ]] || guard_fail 'POSTGRES_SCOPE_INVALID'

ROLE_STATE="$(psql_run -qAt -d postgres -c "
  SELECT pg_catalog.shobj_description(role.oid, 'pg_authid')
  FROM pg_catalog.pg_roles role
  WHERE role.rolname = 'wos_m4_proof_verifier_owner'
")"
[[ -z "$ROLE_STATE" ]] || guard_fail 'M4_OWNER_ROLE_ALREADY_EXISTS'

psql_run -q -d postgres -c "CREATE DATABASE \"$DB\"" >/dev/null
psql_run -q -d postgres -c "COMMENT ON DATABASE \"$DB\" IS '$DB_OWNER'" >/dev/null

psql_run -q -d "$DB" < "$ROOT/tests/sql/wos-p2-m2-pg17-fixture.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql"
psql_run -q -d "$DB" < "$ROOT/tests/sql/wos-m4-02-pg17-seed.sql"
psql_run -q -d "$DB" < "$ROOT/tests/sql/wos-m4-02-pg17-preinstall-baseline.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_NOT_INSTALLED.sql"
psql_run -d "$DB" < "$ROOT/tests/sql/wos-m4-02-pg17-assertions.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql"
psql_run -d "$DB" < "$ROOT/tests/sql/wos-m4-02-pg17-post-rollback.sql"

echo 'WOS_M4_02_PG17_SUITE=PASS'
echo 'WOS_M4_02_PG17_NO_CLOUD_CONNECTION=PASS'
