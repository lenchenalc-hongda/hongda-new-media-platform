#!/usr/bin/env bash
set -euo pipefail

# Ephemeral PostgreSQL 17 only. Set WOS_PG_DOCKER_CONTAINER for a disposable
# container, or PG* variables for a local PostgreSQL instance.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${WOS_PG_DATABASE:-wos_gate_scope}"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"

psql_run() {
  if [[ -n "$CONTAINER" ]]; then
    docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
  else
    psql -X -v ON_ERROR_STOP=1 "$@"
  fi
}

if [[ -n "$CONTAINER" ]]; then
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "CREATE DATABASE \"$DB\"" >/dev/null
else
  psql -X -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null
  psql -X -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"$DB\"" >/dev/null
fi

psql_run -q -d "$DB" < "$ROOT/tests/sql/wos-p2-m2-pg17-fixture.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql"
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_p2_qa_unified_gate_scope_QA_ONLY_NOT_INSTALLED.sql"
psql_run -d "$DB" < "$ROOT/tests/sql/wos-p2-gate-scope-pg17-assertions.sql"

echo 'WOS_P2_GATE_SCOPE_PG17_SUITE=PASS'
echo 'WOS_P2_GATE_SCOPE_NO_CLOUD_QA_CONNECTION=PASS'
