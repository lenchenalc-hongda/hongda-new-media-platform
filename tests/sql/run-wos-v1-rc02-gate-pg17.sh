#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_v1_rollback_ci"
PRE_RUNTIME_DB="wos_v1_rc03_pre_runtime_ci"

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
    "${RECOVERY_REFUSAL_LOG:-}" \
    "${RECOVERY_LEGACY_TAMPER_LOG:-}" \
    "${RECOVERY_HISTORY_TAMPER_LOG:-}" \
    "${PRE_RUNTIME_FAILURE_LOG:-}" \
    "${RC05_FRESH_REFUSAL_LOG:-}"
  if [[ "$status" -ne 0
    && "${WOS_RC02_KEEP_ON_FAILURE:-0}" = '1' ]]; then
    printf 'WOS_V1_RC02_GATE_DB_RETAINED=%s\n' "$DB"
    exit "$status"
  fi
  if [[ "$status" -eq 0
    && "${WOS_RC02_KEEP_ON_SUCCESS:-0}" = '1' ]]; then
    printf 'WOS_V1_RC02_GATE_DB_RETAINED_ON_SUCCESS=%s\n' "$DB"
    exit "$status"
  fi
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$PRE_RUNTIME_DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
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

psql_db "$DB" -q -c "
  INSERT INTO public.organizations(id,name)
  VALUES (
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    'RC03 QA Organization'
  )
"

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos_p8_p7_production_compatible_candidate.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos_p8_p7_service_proof_and_cleanup.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-rc03-qa-shape-transform.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-rc04-m2-proof-set-fixture.sql"

[[ "$(query_value "$DB" "
  SELECT encode(
    sha256(convert_to(
      pg_get_functiondef('public.wos_qa_proof_write_guard()'::regprocedure),
      'UTF8'
    )),
    'hex'
  )
")" = '9a91e8e6441e0beee2c4fa3d4d410582784d3d310939c99007ac65f06d7a63fd' ]] \
  || fail 'LIVE_PROOF_GUARD_DEFINITION_MISMATCH'

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-qa-legacy-safety-rc03-fixture.sql"
# This cloned QA baseline must carry all three pre-existing public INSERT
# policies. Test BOTH recovery states: RC03-only (Runtime preflight rejected)
# and the full Runtime/RC02 installation exercised below.
FOUNDATION_POLICY_SHA_BEFORE="$(query_value "$DB" "
  SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
    'table',tablename, 'name',policyname,
    'permissive',permissive,'roles',roles::text[],
    'cmd',cmd,'qual',qual,'check',with_check
  ) ORDER BY tablename,policyname)::text, ''))
  FROM pg_policies WHERE schemaname='public'
    AND policyname IN (
      'wos_production_orders_insert_draft_same_org',
      'wos_sampling_requests_insert_draft_same_org',
      'wos_reference_images_insert_same_org'
    )
")"
[[ "$(query_value "$DB" "
  SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND policyname IN (
      'wos_production_orders_insert_draft_same_org',
      'wos_sampling_requests_insert_draft_same_org',
      'wos_reference_images_insert_same_org'
    )
")" = '3' ]] || fail 'QA_SHAPE_MISSING_THREE_LEGACY_INSERT_POLICIES'

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$PRE_RUNTIME_DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$PRE_RUNTIME_DB\" TEMPLATE \"$DB\""
{
  printf "SET wos_v1.rc03_compat_install_authorized='yes';\n"
  printf "SET wos_v1.rc03_expected_counts='{\"orders\":85,\"images\":90,\"proofs\":35,\"trusted_receipts\":8,\"storage_objects\":91,\"baselines\":2,\"baseline_items\":8}';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_COMPAT_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$PRE_RUNTIME_DB" -q
[[ "$(query_value "$PRE_RUNTIME_DB" "
  SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND policyname IN (
      'wos_production_orders_insert_draft_same_org',
      'wos_sampling_requests_insert_draft_same_org',
      'wos_reference_images_insert_same_org'
    )
")" = '0' ]] || fail 'COMPAT_FORWARD_LEFT_FOUNDATION_INSERT_POLICIES'

# Reintroduce one disposable, synthetic legacy Policy to reproduce the
# exact Runtime Forward containment failure seen on Hosted QA.
psql_db "$PRE_RUNTIME_DB" -q -c "
  CREATE POLICY wos_production_orders_insert_draft_same_org
  ON public.wos_production_orders FOR INSERT TO authenticated
  WITH CHECK (true)
"
PRE_RUNTIME_FAILURE_LOG="$(mktemp)"
set +e
{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$PRE_RUNTIME_DB" >"$PRE_RUNTIME_FAILURE_LOG" 2>&1
PRE_RUNTIME_FAILURE_STATUS=$?
set -e
[[ "$PRE_RUNTIME_FAILURE_STATUS" -ne 0 ]]   || fail 'RUNTIME_PREFLIGHT_ACCEPTED_INJECTED_LEGACY_POLICY'
grep -q 'WOS_V1_FOUNDATION_CONTAINMENT_REQUIRED' "$PRE_RUNTIME_FAILURE_LOG"   || fail 'RUNTIME_PREFLIGHT_FAILED_WRONG_REASON'
psql_db "$PRE_RUNTIME_DB" -q -c "
  DROP POLICY wos_production_orders_insert_draft_same_org
  ON public.wos_production_orders
"
[[ "$(query_value "$PRE_RUNTIME_DB" "
  SELECT to_regclass('public.wos_order_create_receipts') IS NULL
    AND to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
")" = 't' ]] || fail 'RUNTIME_FAILED_STAGE_CREATED_BACKUPS'
{
  printf "SET wos_v1.rc03_compat_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_COMPAT_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$PRE_RUNTIME_DB" -q
[[ "$(query_value "$PRE_RUNTIME_DB" "
  SELECT to_regnamespace('wos_v1_rc03_compat') IS NULL
    AND to_regclass('public.wos_verified_image_proofs') IS NULL
    AND to_regclass('public.wos_orphan_cleanup_claims') IS NULL
    AND to_regprocedure(
      'public.wos_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NOT NULL
")" = 't' ]] || fail 'PRE_RUNTIME_COMPAT_RECOVERY_INCOMPLETE'
[[ "$(query_value "$PRE_RUNTIME_DB" "
  SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
    'table',tablename,'name',policyname,
    'permissive',permissive,'roles',roles::text[],
    'cmd',cmd,'qual',qual,'check',with_check
  ) ORDER BY tablename,policyname)::text, ''))
  FROM pg_policies WHERE schemaname='public'
    AND policyname IN (
      'wos_production_orders_insert_draft_same_org',
      'wos_sampling_requests_insert_draft_same_org',
      'wos_reference_images_insert_same_org'
    )
")" = "$FOUNDATION_POLICY_SHA_BEFORE" ]]   || fail 'PRE_RUNTIME_FOUNDATION_POLICY_RESTORE_FINGERPRINT_MISMATCH'
psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$PRE_RUNTIME_DB\" WITH (FORCE)"
echo 'WOS_V1_RC05_PRE_RUNTIME_FAIL_CLOSED_RECOVERY=PASS'

LEGACY_SAFETY_BEFORE="$(psql_db "$DB" -qAt \
  < "$ROOT/tests/sql/wos-v1-qa-legacy-safety-fingerprint.sql")"
LEGACY_STORAGE_POLICY_FINGERPRINT_BEFORE="$(query_value "$DB" "
  SELECT md5(COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', policyname,
        'cmd', cmd,
        'permissive', permissive,
        'roles', roles::text[],
        'qual', qual,
        'check', with_check
      )
      ORDER BY policyname
    )::text,
    ''
  ))
  FROM pg_policies
  WHERE schemaname='storage'
    AND tablename='objects'
    AND policyname LIKE 'wos\\_%' ESCAPE '\\'
")"
COMMERCIAL_QUOTATION_POLICY_BEFORE="$(query_value "$DB" "
  SELECT md5(COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', policyname,
        'cmd', cmd,
        'permissive', permissive,
        'roles', roles::text[],
        'qual', qual,
        'check', with_check
      )
      ORDER BY policyname
    )::text,
    ''
  ))
  FROM pg_policies
  WHERE schemaname='storage'
    AND tablename='objects'
    AND policyname='commercial_quotation_item_images_select'
")"

{
  printf "SET wos_v1.rc03_compat_install_authorized='yes';\n"
  printf "SET wos_v1.rc03_expected_counts='{\"orders\":85,\"images\":90,\"proofs\":35,\"trusted_receipts\":8,\"storage_objects\":91,\"baselines\":2,\"baseline_items\":8}';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_COMPAT_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.rc02_install_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.rc03_activation_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_ACTIVATION_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-rc02-gate-pg17-assertions.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-rc04-proof-mirror-assertions.sql"

STORAGE_DB='wos_v1_rc04_storage_ci'
psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$STORAGE_DB\" WITH (FORCE)"
psql_db postgres -q -c \
  "CREATE DATABASE \"$STORAGE_DB\" TEMPLATE \"$DB\""
WOS_PG_DOCKER_CONTAINER="$CONTAINER_ID" \
  WOS_RC04_STORAGE_DB="$STORAGE_DB" \
  node "$ROOT/tests/sql/wos-v1-rc04-storage-api-smoke.mjs"
if [[ "${WOS_RC04_KEEP_STORAGE_DB:-0}" != '1' ]]; then
  psql_db postgres -q -c \
    "DROP DATABASE IF EXISTS \"$STORAGE_DB\" WITH (FORCE)"
fi

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
  SELECT count(*) FROM wos_v1_rc02_safety.rc02_business_grants
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
")" = '1' ]] || fail 'CONCURRENT_ACTIVE_AUTHORIZATION_COUNT'
if ! grep -Eq \
    'rc02_one_active_authorization|duplicate key value violates unique constraint' \
    "$AUTH_ONE_LOG" "$AUTH_TWO_LOG"; then
  fail 'CONCURRENT_AUTHORIZATION_WRONG_ERROR'
fi

psql_db "$DB" -q -c "
  UPDATE wos_v1_rc02_safety.rc02_business_grants
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
  SELECT count(*) FROM wos_v1_rc02_safety.rc02_business_grants
  WHERE request_id='73000000-0000-4000-8000-000000000001'
    AND state='ORDER_BOUND'
")" = '1' ]] || fail 'CONCURRENT_CREATE_NOT_BOUND'

psql_db "$DB" -q -c "
  UPDATE wos_v1_rc02_safety.rc02_business_grants
  SET state='CLOSED', enabled_until=NULL, closed_at=clock_timestamp()
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
"
[[ "$(query_value "$DB" "
  SELECT count(*) FROM wos_v1_rc02_safety.rc02_business_grants
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
LEGACY_PROOF_COUNT_BEFORE_RECOVERY="$(query_value "$DB" "
  SELECT count(*) FROM public.wos_qa_verified_image_proofs
")"

psql_db "$DB" -q -c "
  UPDATE wos_v1_rc02_safety.rc02_business_grants
  SET state='CLOSED', enabled_until=NULL, closed_at=clock_timestamp()
  WHERE state IN ('AUTHORIZED', 'ORDER_BOUND')
"

psql_db "$DB" -q -c "
  UPDATE wos_qa_safety.p2_gate_close_receipts
  SET reason='TAMPERED_RC03_TEST'
  WHERE gate_name='OPERATOR_WRITES'
    AND order_id='71000000-0000-4000-8000-000000000101'
"
RECOVERY_LEGACY_TAMPER_LOG="$(mktemp)"
set +e
{
  printf "SET wos_v1.rc02_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" >"$RECOVERY_LEGACY_TAMPER_LOG" 2>&1
RECOVERY_LEGACY_TAMPER_STATUS=$?
set -e
[[ "$RECOVERY_LEGACY_TAMPER_STATUS" -ne 0 ]] \
  || fail 'RECOVERY_ACCEPTED_TAMPERED_LEGACY_SAFETY'
grep -q 'RC02_LEGACY_SAFETY_SCHEMA_CHANGED' "$RECOVERY_LEGACY_TAMPER_LOG" \
  || fail 'RECOVERY_LEGACY_TAMPER_WRONG_ERROR'
psql_db "$DB" -q -c "
  UPDATE wos_qa_safety.p2_gate_close_receipts
  SET reason='NORMAL_CLOSE'
  WHERE gate_name='OPERATOR_WRITES'
    AND order_id='71000000-0000-4000-8000-000000000101'
"

{
  printf "SET wos_v1.rc02_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(query_value "$DB" "
  SELECT to_regclass('wos_v1_rc02_safety.rc02_business_grants') IS NULL
")" = 't' ]] || fail 'RECOVERY_LEFT_GATE_TABLE'
[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_v1_rc02_safety') IS NULL
")" = 't' ]] || fail 'RECOVERY_LEFT_SCHEMA'
[[ "$(query_value "$DB" "
  SELECT count(*)
  FROM pg_proc function_row
  JOIN pg_namespace namespace_row
    ON namespace_row.oid=function_row.pronamespace
  WHERE namespace_row.nspname='wos_v1_rc02_safety'
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

psql_db "$DB" -q -c "
  ALTER TABLE public.wos_qa_verified_image_proofs
  DISABLE TRIGGER wos_qa_trusted_proof_guard;
  UPDATE public.wos_qa_verified_image_proofs
  SET verified_sha256=repeat('9',64)
  WHERE image_id='70000000-0000-4000-8000-000000000012';
  ALTER TABLE public.wos_qa_verified_image_proofs
  ENABLE TRIGGER wos_qa_trusted_proof_guard
"
RECOVERY_HISTORY_TAMPER_LOG="$(mktemp)"
set +e
{
  printf "SET wos_v1.rc03_compat_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_COMPAT_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" >"$RECOVERY_HISTORY_TAMPER_LOG" 2>&1
RECOVERY_HISTORY_TAMPER_STATUS=$?
set -e
[[ "$RECOVERY_HISTORY_TAMPER_STATUS" -ne 0 ]] \
  || fail 'COMPAT_RECOVERY_ACCEPTED_TAMPERED_HISTORY'
grep -q 'RC03_COMPAT_HISTORICAL_ROW_CHANGED' "$RECOVERY_HISTORY_TAMPER_LOG" \
  || fail 'COMPAT_RECOVERY_TAMPER_WRONG_ERROR'
psql_db "$DB" -q -c "
  ALTER TABLE public.wos_qa_verified_image_proofs
  DISABLE TRIGGER wos_qa_trusted_proof_guard;
  UPDATE public.wos_qa_verified_image_proofs
  SET verified_sha256=repeat('7',64)
  WHERE image_id='70000000-0000-4000-8000-000000000012';
  ALTER TABLE public.wos_qa_verified_image_proofs
  ENABLE TRIGGER wos_qa_trusted_proof_guard
"

{
  printf "SET wos_v1.rc03_compat_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_COMPAT_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_v1_rc03_compat') IS NULL
")" = 't' ]] || fail 'COMPAT_RECOVERY_LEFT_SCHEMA'
[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_qa_safety') IS NOT NULL
")" = 't' ]] || fail 'RECOVERY_DELETED_LEGACY_SCHEMA'
[[ "$(psql_db "$DB" -qAt \
  < "$ROOT/tests/sql/wos-v1-qa-legacy-safety-fingerprint.sql")" \
  = "$LEGACY_SAFETY_BEFORE" ]] || fail 'LEGACY_SAFETY_FINGERPRINT_CHANGED'
[[ "$(query_value "$DB" "
  SELECT md5(COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', policyname,
        'cmd', cmd,
        'permissive', permissive,
        'roles', roles::text[],
        'qual', qual,
        'check', with_check
      )
      ORDER BY policyname
    )::text,
    ''
  ))
  FROM pg_policies
  WHERE schemaname='storage'
    AND tablename='objects'
    AND policyname LIKE 'wos\\_%' ESCAPE '\\'
")" = "$LEGACY_STORAGE_POLICY_FINGERPRINT_BEFORE" ]] \
  || fail 'COMPAT_RECOVERY_POLICY_FINGERPRINT_CHANGED'
[[ "$(query_value "$DB" "
  SELECT md5(COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', policyname,
        'cmd', cmd,
        'permissive', permissive,
        'roles', roles::text[],
        'qual', qual,
        'check', with_check
      )
      ORDER BY policyname
    )::text,
    ''
  ))
  FROM pg_policies
  WHERE schemaname='storage'
    AND tablename='objects'
    AND policyname='commercial_quotation_item_images_select'
")" = "$COMMERCIAL_QUOTATION_POLICY_BEFORE" ]] \
  || fail 'COMPAT_RECOVERY_CHANGED_COMMERCIAL_QUOTATION_POLICY'
[[ "$(query_value "$DB" "
  SELECT allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
  FROM storage.buckets WHERE id='wos-private'
")" = 't' ]] || fail 'COMPAT_RECOVERY_BUCKET_NOT_RESTORED'
[[ "$(query_value "$DB" "
  SELECT has_table_privilege(
    'authenticated','public.wos_production_orders','INSERT'
  )
")" = 't' ]] || fail 'COMPAT_RECOVERY_ACL_NOT_RESTORED'
[[ "$(query_value "$DB" "
  SELECT to_regclass('public.wos_verified_image_proofs') IS NOT NULL
    AND to_regclass('public.wos_orphan_cleanup_claims') IS NOT NULL
")" = 't' ]] || fail 'COMPAT_RECOVERY_DELETED_RUNTIME_DATA'
[[ "$(query_value "$DB" "
  SELECT NOT has_function_privilege(
    'authenticated',
    'public.wos_create_production_order(uuid,jsonb)',
    'EXECUTE'
  )
")" = 't' ]] || fail 'COMPAT_RECOVERY_RPC_STILL_ACTIVE'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM public.wos_qa_verified_image_proofs
")" = "$LEGACY_PROOF_COUNT_BEFORE_RECOVERY" ]] \
  || fail 'COMPAT_RECOVERY_CHANGED_PROOF_HISTORY'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM storage.objects
")" = "$OBJECT_COUNT_BEFORE_RECOVERY" ]] || fail 'RECOVERY_CHANGED_STORAGE'
[[ "$(query_value "$DB" "
  SELECT count(*) FROM public.wos_production_orders
")" = "$ORDER_COUNT_BEFORE_RECOVERY" ]] || fail 'RECOVERY_CHANGED_ORDERS'

psql_db "$DB" -q -c "
  SET request.jwt.claim.sub = '10101010-1010-4010-8010-101010101010';
  SET request.jwt.claim.role = 'authenticated';
  SET ROLE authenticated;
  DO \$restored_register\$
  BEGIN
    BEGIN
      PERFORM public.wos_register_uploaded_reference_image(
        NULL, NULL, NULL, NULL
      );
      RAISE EXCEPTION 'RESTORED_REGISTER_ACCEPTED_INVALID_INPUT';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'INVALID_INPUT' THEN RAISE; END IF;
    END;
  END;
  \$restored_register\$;
  RESET ROLE;
  SET request.jwt.claim.role = 'service_role';
  SET ROLE service_role;
  DO \$restored_proof\$
  BEGIN
    BEGIN
      PERFORM public.wos_p7_record_trusted_image_proof(
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
      );
      RAISE EXCEPTION 'RESTORED_PROOF_ACCEPTED_INVALID_INPUT';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'INVALID_PROOF_INPUT' THEN RAISE; END IF;
    END;
  END;
  \$restored_proof\$;
  RESET ROLE;
"


# RC05: true post-recovery state on the SAME disposable PG17 database.
# All V1 runtime tables already contain retained QA data, while the original
# P7 interfaces/Foundation/Storage policies were restored by RC03 recovery.
RC05_RETAINED_PUBLIC_COUNTS="$(query_value "$DB" "
  SELECT jsonb_build_object(
    'orders',(SELECT count(*) FROM public.wos_production_orders),
    'images',(SELECT count(*) FROM public.wos_reference_images),
    'proofs',(SELECT count(*) FROM public.wos_qa_verified_image_proofs),
    'trusted_receipts',(SELECT count(*) FROM public.wos_qa_trusted_proof_receipts),
    'storage_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private'),
    'baselines',(SELECT count(*) FROM public.wos_visual_baselines),
    'baseline_items',(SELECT count(*) FROM public.wos_visual_baseline_items)
  )::text
")"
RC05_RETAINED_RUNTIME_COUNTS="$(query_value "$DB" "
  SELECT pg_catalog.jsonb_build_object(
    'runtime_proofs',(SELECT count(*) FROM public.wos_verified_image_proofs),
    'orphan_claims',(SELECT count(*) FROM public.wos_orphan_cleanup_claims),
    'create_receipts',(SELECT count(*) FROM public.wos_order_create_receipts),
    'operator_action_receipts',(SELECT count(*) FROM public.wos_operator_action_receipts),
    'operator_review_receipts',(SELECT count(*) FROM public.wos_operator_review_receipts),
    'office_revisions',(SELECT count(*) FROM public.wos_office_revisions)
  )::text
")"
RC05_RETAINED_ROW_FINGERPRINT="$(query_value "$DB" "
  SELECT md5(
    (SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_verified_image_proofs x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_orphan_cleanup_claims x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_order_create_receipts x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_operator_action_receipts x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_operator_review_receipts x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_office_revisions x)
  )
")"

# The old fresh-install compatibility SQL must remain fail-closed on retained Runtime.
RC05_FRESH_REFUSAL_LOG="$(mktemp)"
set +e
{
  printf "SET wos_v1.rc03_compat_install_authorized='yes';\n"
  printf "SET wos_v1.rc03_expected_counts='%s';\n" "$RC05_RETAINED_PUBLIC_COUNTS"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_COMPAT_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q >"$RC05_FRESH_REFUSAL_LOG" 2>&1
RC05_FRESH_REINSTALL_STATUS=$?
set -e
[[ "$RC05_FRESH_REINSTALL_STATUS" -ne 0 ]] ||
  fail 'RC05_FRESH_COMPAT_ACCEPTED_RETAINED_RUNTIME'
grep -q 'RC03_COMPAT_ALREADY_PARTIALLY_INSTALLED' "$RC05_FRESH_REFUSAL_LOG" ||
  fail 'RC05_FRESH_COMPAT_WRONG_REFUSAL'
rm -f "$RC05_FRESH_REFUSAL_LOG"

# Branch A: Reactivation compatibility installed, Runtime NOT yet reactivated.
{
  printf "SET wos_v1.rc05_post_recovery_compat_authorized='yes';\n"
  printf "SET wos_v1.rc03_expected_counts='%s';\n" "$RC05_RETAINED_PUBLIC_COUNTS"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_COMPAT_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_v1_rc03_compat') IS NOT NULL
    AND to_regclass('public.wos_verified_image_proofs') IS NOT NULL
    AND to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
")" = 't' ]] || fail 'RC05_COMPAT_ONLY_STATE_INVALID'
{
  printf "SET wos_v1.rc05_post_recovery_compat_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_COMPAT_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_v1_rc03_compat') IS NULL
    AND to_regclass('public.wos_verified_image_proofs') IS NOT NULL
    AND to_regclass('public.wos_order_create_receipts') IS NOT NULL
")" = 't' ]] || fail 'RC05_PRE_RUNTIME_RECOVERY_DELETED_DATA'
echo 'WOS_V1_RC05_POST_RECOVERY_PRE_RUNTIME_ROLLBACK=PASS'

# Branch B: Reactivation compatibility + exactly four retained-data P7 RPCs.
{
  printf "SET wos_v1.rc05_post_recovery_compat_authorized='yes';\n"
  printf "SET wos_v1.rc03_expected_counts='%s';\n" "$RC05_RETAINED_PUBLIC_COUNTS"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_COMPAT_FORWARD_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.rc05_post_recovery_runtime_authorized='yes';\n"
  printf "SET wos_v1.rc05_qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.rc05_expected_runtime_counts='%s';\n" "$RC05_RETAINED_RUNTIME_COUNTS"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_RUNTIME_REACTIVATE_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
[[ "$(query_value "$DB" "
  SELECT to_regprocedure('public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)') IS NOT NULL
    AND to_regclass('public.wos_order_create_receipts') IS NOT NULL
")" = 't' ]] || fail 'RC05_RUNTIME_REACTIVATION_BACKUPS_MISSING'
{
  printf "SET wos_v1.rc02_install_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
{
  printf "SET wos_v1.rc03_activation_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC03_QA_RUNTIME_ACTIVATION_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
[[ "$(query_value "$DB" "
  SELECT has_function_privilege('authenticated','public.wos_create_production_order(uuid,jsonb)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)','EXECUTE')
    AND (SELECT count(*) FROM wos_v1_rc02_safety.rc02_business_grants)=0
")" = 't' ]] || fail 'RC05_REACTIVATION_SCOPE_ACL_DRIFT'
{
  printf "SET wos_v1.rc02_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
{
  printf "SET wos_v1.rc05_post_recovery_compat_recovery_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/qa-fixture/WOS_V1_RC05_POST_RECOVERY_COMPAT_RECOVERY_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(query_value "$DB" "
  SELECT to_regnamespace('wos_v1_rc03_compat') IS NULL
    AND to_regnamespace('wos_v1_rc02_safety') IS NULL
    AND to_regclass('public.wos_verified_image_proofs') IS NOT NULL
    AND to_regprocedure('public.wos_confirm_office_completeness(uuid,integer,text,text)') IS NOT NULL
    AND NOT has_function_privilege('authenticated','public.wos_create_production_order(uuid,jsonb)','EXECUTE')
")" = 't' ]] || fail 'RC05_POST_RECOVERY_FULL_ROLLBACK_INCOMPLETE'
[[ "$(query_value "$DB" "
  SELECT md5(
    (SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_verified_image_proofs x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_orphan_cleanup_claims x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_order_create_receipts x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_operator_action_receipts x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_operator_review_receipts x)
    ||'|'||(SELECT COALESCE(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),'') FROM public.wos_office_revisions x)
  )
")" = "$RC05_RETAINED_ROW_FINGERPRINT" ]] ||
  fail 'RC05_POST_RECOVERY_REACTIVATION_CHANGED_RETAINED_ROWS'
[[ "$(query_value "$DB" "
  SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
    'table',tablename,'name',policyname,
    'permissive',permissive,'roles',roles::text[],
    'cmd',cmd,'qual',qual,'check',with_check
  ) ORDER BY tablename,policyname)::text, ''))
  FROM pg_policies WHERE schemaname='public'
    AND policyname IN (
      'wos_production_orders_insert_draft_same_org',
      'wos_sampling_requests_insert_draft_same_org',
      'wos_reference_images_insert_same_org'
    )
")" = "$FOUNDATION_POLICY_SHA_BEFORE" ]] ||
  fail 'RC05_POST_RECOVERY_FOUNDATION_POLICY_RESTORE_MISMATCH'
RC05_LEGACY_SAFETY_AFTER="$(psql_db "$DB" -qAt < "$ROOT/tests/sql/wos-v1-qa-legacy-safety-fingerprint.sql")"
[[ "$RC05_LEGACY_SAFETY_AFTER" = "$LEGACY_SAFETY_BEFORE" ]] ||
  fail 'RC05_POST_RECOVERY_OLD_P2_SCHEMA_CHANGED'
echo 'WOS_V1_RC05_POST_RECOVERY_REACTIVATION_RECOVERY=PASS'

echo 'WOS_V1_RC04_P7_RECOVERY_INTERFACES=PASS'
echo 'WOS_V1_RC02_GATE_PG17=PASS'
echo 'WOS_V1_RC02_CONCURRENT_AUTHORIZE=PASS'
echo 'WOS_V1_RC02_CONCURRENT_CREATE_REPLAY=PASS'
echo 'WOS_V1_RC02_RECOVERY_ACTIVE_REFUSAL=PASS'
echo 'WOS_V1_RC02_RECOVERY_RESTORES_POLICY=PASS'
[[ "$(query_value "$DB" "
  SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
    'table',tablename,'name',policyname,
    'permissive',permissive,'roles',roles::text[],
    'cmd',cmd,'qual',qual,'check',with_check
  ) ORDER BY tablename,policyname)::text, ''))
  FROM pg_policies WHERE schemaname='public'
    AND policyname IN (
      'wos_production_orders_insert_draft_same_org',
      'wos_sampling_requests_insert_draft_same_org',
      'wos_reference_images_insert_same_org'
    )
")" = "$FOUNDATION_POLICY_SHA_BEFORE" ]] \
  || fail 'FULL_RUNTIME_FOUNDATION_POLICY_RESTORE_FINGERPRINT_MISMATCH'
echo 'WOS_V1_RC05_FOUNDATION_PUBLIC_POLICIES_RESTORED=PASS'
echo 'WOS_V1_RC03_COMPAT_FORWARD_AND_RECOVERY=PASS'
echo 'WOS_V1_RC03_LEGACY_SAFETY_FINGERPRINT=PASS'
echo 'WOS_V1_RC03_COMPAT_RECOVERY_DEACTIVATED_RUNTIME=PASS'
echo 'WOS_V1_RC02_NO_CLOUD_QA_CONNECTION=PASS'
