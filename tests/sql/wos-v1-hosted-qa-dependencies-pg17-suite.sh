#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${WOS_PG_DATABASE:-wos_v1_hosted_qa_dependencies}"
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
psql_run -q -d "$DB" < \
  "$ROOT/tests/sql/wos-v1-hosted-qa-existing-prerequisites.sql"

{
  printf "SET wos_v1.qa_hosted_install_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_HOSTED_QA_DEPENDENCIES_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

psql_run -q -d "$DB" < \
  "$ROOT/tests/sql/wos-v1-hosted-qa-dependencies-pg17-assertions.sql"

{
  printf "SET wos_v1.qa_hosted_rollback_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_HOSTED_QA_DEPENDENCIES_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

psql_run -qAt -d "$DB" -c "
  SELECT CASE
    WHEN to_regprocedure('public.wos_p7_service_storage_snapshot(text)') IS NULL
      AND to_regprocedure(
        'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
      ) IS NULL
      AND to_regprocedure(
        'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
      ) IS NULL
      AND EXISTS (
        SELECT 1 FROM public.wos_qa_verified_image_proofs
        WHERE image_id='72000000-0000-4000-8000-000000000021'
      )
    THEN 'PASS'
    ELSE 'FAIL'
  END
" | grep -qx 'PASS'

echo 'WOS_V1_HOSTED_QA_DEPENDENCIES_PG17=PASS'
echo 'WOS_V1_HOSTED_QA_ROLLBACK_PRESERVES_PROOF_HISTORY=PASS'
echo 'WOS_V1_HOSTED_QA_BROWSER_ACCESS=DENIED'
