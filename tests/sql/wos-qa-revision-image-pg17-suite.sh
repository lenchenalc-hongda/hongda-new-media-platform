#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${WOS_PG_DATABASE:-wos_qa_revision_image}"
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
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
psql_run -d "$DB" < "$ROOT/tests/sql/wos-qa-revision-image-pg17-assertions.sql"

echo 'WOS_QA_REVISION_IMAGE_PG17_SUITE=PASS'
echo 'WOS_QA_REVISION_IMAGE_NO_CLOUD_QA_CONNECTION=PASS'
