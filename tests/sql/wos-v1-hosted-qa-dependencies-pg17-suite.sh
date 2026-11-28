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
  "$ROOT/tests/sql/wos-proof-service-guard-pg17-old-definitions.sql"

{
  printf "SET wos_v1.qa_project = 'xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_v2_proof_guard_install_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_V2_PROOF_GUARD_COMPAT_INSTALL_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

psql_run -q -d "$DB" < \
  "$ROOT/tests/sql/wos-v1-hosted-qa-dependencies-pg17-assertions.sql"

{
  printf "SET wos_v1.qa_project = 'xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_v2_proof_guard_rollback_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_V2_PROOF_GUARD_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

psql_run -q -d "$DB" < \
  "$ROOT/tests/sql/wos-qa-live-p7-proof-definition-20261128.sql"
psql_run -q -d "$DB" < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"

{
  printf "SET wos_v1.qa_project = 'xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_v2_proof_guard_install_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_V2_PROOF_GUARD_COMPAT_INSTALL_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

live_post_state=$(psql_run -qAt -d "$DB" -c "
  SELECT encode(sha256(convert_to(
    pg_get_functiondef(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
    ),
    'UTF8'
  )), 'hex') || ':' || encode(sha256(convert_to(
    pg_get_functiondef('public.wos_qa_proof_write_guard()'::regprocedure),
    'UTF8'
  )), 'hex')
")
[[ "$live_post_state" = \
  '0f1dcb8da6ae26da22150e0bed35e025e9618824d64993d0af5eec0a92cb7216:f0944a6afc0ebc0017849274aa3e88b27f81cab6d5fee3e0aa7b0dc5d964c0db' ]]

{
  printf "SET wos_v1.qa_project = 'xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_v2_proof_guard_rollback_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_V2_PROOF_GUARD_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

live_restore_state=$(psql_run -qAt -d "$DB" -c "
  SELECT encode(sha256(convert_to(
    pg_get_functiondef(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
    ),
    'UTF8'
  )), 'hex') || ':' || encode(sha256(convert_to(
    pg_get_functiondef('public.wos_qa_proof_write_guard()'::regprocedure),
    'UTF8'
  )), 'hex')
")
[[ "$live_restore_state" = \
  '1433bdd5244077b1a34a2e7e58b37e5b665c7b5b59a1605544bb5e6854d87772:9a91e8e6441e0beee2c4fa3d4d410582784d3d310939c99007ac65f06d7a63fd' ]]

before_proofs=$(psql_run -qAt -d "$DB" \
  -c "select count(*) from public.wos_qa_verified_image_proofs")
before_receipts=$(psql_run -qAt -d "$DB" \
  -c "select count(*) from public.wos_qa_trusted_proof_receipts")
before_enabled_gates=$(psql_run -qAt -d "$DB" \
  -c "select count(*) from public.wos_qa_p2_m2_gate where enabled")
[[ "$before_enabled_gates" = '0' ]]

{
  printf "SET wos_v1.qa_hosted_rollback_authorized = 'yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_HOSTED_QA_DEPENDENCIES_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_run -q -d "$DB"

after_state=$(psql_run -qAt -d "$DB" -c "
  SELECT CASE
    WHEN to_regprocedure('public.wos_p7_service_storage_snapshot(text)') IS NULL
      AND to_regprocedure(
        'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
      ) IS NULL
      AND to_regprocedure(
        'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
      ) IS NULL
      AND (SELECT count(*) FROM public.wos_qa_verified_image_proofs)=$before_proofs
      AND (SELECT count(*) FROM public.wos_qa_trusted_proof_receipts)=$before_receipts
      AND NOT EXISTS (
        SELECT 1 FROM public.wos_qa_p2_m2_gate WHERE enabled
      )
    THEN 'PASS'
    ELSE 'FAIL'
  END
")
[[ "$after_state" = 'PASS' ]]

echo 'WOS_V1_HOSTED_QA_DEPENDENCIES_PG17=PASS'
echo 'WOS_V1_HOSTED_QA_V2_PROOF_GUARD_COMPAT=PASS'
echo 'WOS_V1_HOSTED_QA_V2_PROOF_GUARD_ROLLBACK=PASS'
echo 'WOS_V1_HOSTED_QA_V2_PROOF_GUARD_LIVE_UPGRADE=PASS'
echo 'WOS_V1_HOSTED_QA_V2_PROOF_GUARD_LIVE_ROLLBACK=PASS'
echo 'WOS_V1_HOSTED_QA_ROLLBACK_PRESERVES_PROOF_HISTORY=PASS'
echo 'WOS_V1_HOSTED_QA_BROWSER_ACCESS=DENIED'
