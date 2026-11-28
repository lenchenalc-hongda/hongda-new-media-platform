#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="${WOS_PG_QA_UAT_DATABASE:-wos_v1_production_m2_qa_uat_ci}"
QA_SHAPE_DB="wos_v1_rollback_ci"

fail() {
  printf 'WOS_V1_PRODUCTION_M2_QA_UAT_PG17_FAILED=%s\n' "$1" >&2
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
  if [[ -n "${DB_HEARTBEAT_LOOP_PID:-}" ]]; then
    kill "$DB_HEARTBEAT_LOOP_PID" >/dev/null 2>&1 || true
    wait "$DB_HEARTBEAT_LOOP_PID" 2>/dev/null || true
  fi
  if [[ -n "${LOCK_MARKER:-}" ]]; then
    docker exec "$CONTAINER" rm -f "$LOCK_MARKER" >/dev/null 2>&1 || true
  fi
  if [[ "$status" -eq 0 && "${WOS_PG_QA_UAT_KEEP_DB:-0}" = '1' ]]; then
    printf 'WOS_V1_PRODUCTION_M2_QA_UAT_DB_RETAINED=%s\n' "$DB"
    printf 'WOS_V1_PRODUCTION_M2_QA_SHAPE_DB_RETAINED=%s\n' "$QA_SHAPE_DB"
    exit "$status"
  fi
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$QA_SHAPE_DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  psql_db postgres -q -c \
    "DROP DATABASE IF EXISTS \"wos_v1_qa_storage_compat_ci\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  psql_db postgres -q -c \
    "DROP DATABASE IF EXISTS \"wos_v1_qa_storage_guard_ci\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  if [[ "${WOS_UAT006_CONTINUITY_KEEP_DB:-0}" != '1' ]]; then
    psql_db postgres -q -c \
      "DROP DATABASE IF EXISTS \"wos_v1_uat006_continuity_ci\" WITH (FORCE)" \
      >/dev/null 2>&1 || true
  fi
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

WOS_PG_DOCKER_CONTAINER="$CONTAINER" \
WOS_RC02_KEEP_ON_SUCCESS=1 \
  bash "$ROOT/tests/sql/run-wos-v1-rc02-gate-pg17.sh"
[[ "$(psql_db postgres -qAt -c "
  SELECT 1 FROM pg_database WHERE datname='$QA_SHAPE_DB'
")" = '1' ]] || fail 'QA_SHAPE_DATABASE_NOT_RETAINED'

qa_shape_counts() {
  psql_db "$QA_SHAPE_DB" -qAt -c "
    SELECT jsonb_build_object(
      'orders',(SELECT count(*) FROM public.wos_production_orders),
      'images',(SELECT count(*) FROM public.wos_reference_images),
      'proofs',(SELECT count(*) FROM public.wos_verified_image_proofs),
      'trusted',(SELECT count(*) FROM public.wos_qa_trusted_proof_receipts),
      'storage',(SELECT count(*) FROM storage.objects WHERE bucket_id='wos-private'),
      'baselines',(SELECT count(*) FROM public.wos_visual_baselines),
      'items',(SELECT count(*) FROM public.wos_visual_baseline_items)
    )::text
  "
}

qa_shape_acl() {
  psql_db "$QA_SHAPE_DB" -qAt -c "
    SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
      'name',class.relname,'acl',COALESCE(class.relacl::text,'')
    ) ORDER BY class.relname)::text,''))
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='public'
      AND class.relname IN (
        'wos_production_orders','wos_reference_images',
        'wos_verified_image_proofs','wos_visual_baselines',
        'wos_visual_baseline_items','wos_resource_readiness',
        'wos_status_history','wos_confirmations'
      )
  "
}

qa_shape_bucket_config() {
  psql_db "$QA_SHAPE_DB" -qAt -c "
    SELECT md5(jsonb_build_object(
      'public',public,
      'fileSizeLimit',file_size_limit,
      'allowedMimeTypes',allowed_mime_types
    )::text)
    FROM storage.buckets
    WHERE id='wos-private'
  "
}

qa_shape_storage_policies() {
  psql_db "$QA_SHAPE_DB" -qAt -c "
    SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
      'name',policyname,'roles',roles::text[],'cmd',cmd,
      'permissive',permissive,'qual',qual,'check',with_check
    ) ORDER BY policyname)::text,''))
    FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'wos\\_%' ESCAPE '\\'
  "
}

db_storage_policies() {
  local database="$1"
  psql_db "$database" -qAt -c "
    SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
      'name',policyname,'roles',roles::text[],'cmd',cmd,
      'permissive',permissive,'qual',qual,'check',with_check
    ) ORDER BY policyname)::text,''))
    FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'wos\\_%' ESCAPE '\\'
  "
}

db_policy_fingerprint() {
  local database="$1"
  local filter="$2"
  psql_db "$database" -qAt -c "
    SELECT md5(jsonb_build_object(
      'policies',(
        SELECT jsonb_agg(jsonb_build_object(
          'name',policyname,
          'permissive',permissive,
          'roles',roles::text[],
          'command',cmd,
          'qual',qual,
          'withCheck',with_check
        ) ORDER BY policyname)
        FROM pg_catalog.pg_policies
        WHERE schemaname='storage'
          AND tablename='objects'
          AND policyname $filter
      )
    )::text)
  "
}

qa_shape_history_fingerprint() {
  psql_db "$QA_SHAPE_DB" -qAt -c "
    SELECT md5(jsonb_build_object(
      'orders',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM public.wos_production_orders r
      ),
      'images',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM public.wos_reference_images r
      ),
      'proofs',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.image_id)
        FROM public.wos_verified_image_proofs r
      ),
      'trustedReceipts',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id)
        FROM public.wos_qa_trusted_proof_receipts r
      ),
      'storageObjects',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM storage.objects r
        WHERE r.bucket_id='wos-private'
      ),
      'baselines',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM public.wos_visual_baselines r
      ),
      'baselineItems',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.baseline_id,r.display_order)
        FROM public.wos_visual_baseline_items r
      ),
      'resources',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.entity_id,r.resource_type)
        FROM public.wos_resource_readiness r
      ),
      'statusHistory',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.reason_code)
        FROM public.wos_status_history r
      ),
      'confirmations',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.confirmed_at,r.confirmation_type)
        FROM public.wos_confirmations r
      )
    )::text)
  "
}

QA_SHAPE_COUNTS_BEFORE="$(qa_shape_counts)"
QA_SHAPE_ACL_BEFORE="$(qa_shape_acl)"
QA_SHAPE_BUCKET_BEFORE="$(qa_shape_bucket_config)"
QA_SHAPE_STORAGE_BEFORE="$(qa_shape_storage_policies)"
QA_SHAPE_HISTORY_BEFORE="$(qa_shape_history_fingerprint)"
psql_db "$QA_SHAPE_DB" -q -1 \
  < "$ROOT/supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql"
[[ "$(qa_shape_counts)" = "$QA_SHAPE_COUNTS_BEFORE" ]] \
  || fail 'QA_SHAPE_HISTORICAL_COUNTS_CHANGED'
[[ "$(qa_shape_acl)" = "$QA_SHAPE_ACL_BEFORE" ]] \
  || fail 'QA_SHAPE_ACL_CHANGED'
[[ "$(qa_shape_storage_policies)" = "$QA_SHAPE_STORAGE_BEFORE" ]] \
  || fail 'QA_SHAPE_STORAGE_POLICY_CHANGED'
[[ "$(qa_shape_history_fingerprint)" = "$QA_SHAPE_HISTORY_BEFORE" ]] \
  || fail 'QA_SHAPE_HISTORICAL_ROWS_CHANGED'
[[ "$(psql_db "$QA_SHAPE_DB" -qAt -c "
  SELECT count(*)=0
  FROM (
    SELECT organization_id,entity_type,entity_id
    FROM public.wos_visual_baselines
    WHERE status='CURRENT'
    GROUP BY organization_id,entity_type,entity_id
    HAVING count(*)>1
  ) duplicate
")" = 't' ]] || fail 'QA_SHAPE_CURRENT_BASELINE_NOT_UNIQUE'
[[ "$(psql_db "$QA_SHAPE_DB" -qAt -c "
  SELECT to_regclass('public.wos_v1_m2_receipts') IS NOT NULL
    AND to_regclass('public.wos_v1_start_releases') IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM pg_trigger
      WHERE tgname='wos_v1_m2_reference_image_guard'
    )
    AND EXISTS(
      SELECT 1 FROM pg_trigger
      WHERE tgname='wos_v1_m2_proof_change_guard'
    )
")" = 't' ]] || fail 'QA_SHAPE_M2_OBJECTS_MISSING'

{
  printf "SET wos_v1.qa_uat_install_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
{
  printf "SET wos_v1.qa_uat_activation_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ACTIVATE_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
STORAGE_GUARD_DB='wos_v1_qa_storage_guard_ci'
psql_db postgres -q -c \
  "DROP DATABASE IF EXISTS \"$STORAGE_GUARD_DB\" WITH (FORCE)"
psql_db postgres -q -c \
  "CREATE DATABASE \"$STORAGE_GUARD_DB\" TEMPLATE \"$QA_SHAPE_DB\""
psql_db "$STORAGE_GUARD_DB" -q -c "
  CREATE POLICY wos_guard_unknown_allow_all
  ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
"
if {
  printf "SET wos_v1.qa_storage_compat_install_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_STORAGE_COMPAT_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$STORAGE_GUARD_DB" -q >/tmp/wos-uat006-storage-guard-$$.log 2>&1
then
  fail 'QA_STORAGE_COMPAT_UNKNOWN_POLICY_ALLOWED'
fi
[[ "$(psql_db "$STORAGE_GUARD_DB" -qAt -c "
  SELECT to_regnamespace('wos_v1_qa_storage_compat') IS NULL;
")" = 't' ]] || fail 'QA_STORAGE_COMPAT_GUARD_PARTIAL_INSTALL'
psql_db postgres -q -c \
  "DROP DATABASE IF EXISTS \"$STORAGE_GUARD_DB\" WITH (FORCE)"
echo 'WOS_V1_QA_UAT_STORAGE_UNKNOWN_POLICY_DENIED=PASS'
STORAGE_LIVE_SNAPSHOT="$ROOT/docs/workshop-order-system/production-readiness/evidence/WOS_V1_QA_STORAGE_POLICY_LIVE_SNAPSHOT_20261128.json"
STORAGE_LIVE_FINGERPRINTS="$(
  psql_db postgres -qAt \
    -v snapshot="$(cat "$STORAGE_LIVE_SNAPSHOT")" <<'SQL'
WITH snapshot AS (
  SELECT :'snapshot'::jsonb AS value
), policies AS (
  SELECT policy
  FROM snapshot
  CROSS JOIN LATERAL jsonb_array_elements(snapshot.value->'policies') policy
)
SELECT concat_ws('|',
  md5(jsonb_build_object(
    'policies',
    (
      SELECT jsonb_agg(policy ORDER BY policy->>'name')
      FROM policies
      WHERE policy->>'name' LIKE 'wos\_%' ESCAPE '\'
    )
  )::text),
  md5(jsonb_build_object(
    'policies',
    (
      SELECT jsonb_agg(policy ORDER BY policy->>'name')
      FROM policies
      WHERE policy->>'name' NOT LIKE 'wos\_%' ESCAPE '\'
    )
  )::text)
);
SQL
)"
[[ "$STORAGE_LIVE_FINGERPRINTS" = \
  'f9759e0644e82ff4264efa42ac54e57c|f64fe08ac8669875ee9f7f3d4bbbc60f' ]] \
  || fail 'QA_STORAGE_COMPAT_LIVE_POLICY_FINGERPRINT_MISMATCH'
echo 'WOS_V1_QA_UAT_STORAGE_LIVE_POLICY_FINGERPRINTS=PASS'
QA_SHAPE_WOS_POLICY_FP="$(db_policy_fingerprint \
  "$QA_SHAPE_DB" "LIKE 'wos\\_%' ESCAPE '\\'")"
QA_SHAPE_NON_WOS_POLICY_FP="$(db_policy_fingerprint \
  "$QA_SHAPE_DB" "NOT LIKE 'wos\\_%' ESCAPE '\\'")"
{
  printf "SET wos_v1.qa_storage_compat_install_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_storage_local_test='yes';\n"
  printf "SET wos_v1.qa_storage_expected_wos_fingerprint='%s';\n" \
    "$QA_SHAPE_WOS_POLICY_FP"
  printf "SET wos_v1.qa_storage_expected_non_wos_fingerprint='%s';\n" \
    "$QA_SHAPE_NON_WOS_POLICY_FP"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_STORAGE_COMPAT_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
[[ "$(db_storage_policies "$QA_SHAPE_DB")" != "$QA_SHAPE_STORAGE_BEFORE" ]] \
  || fail 'QA_STORAGE_COMPAT_POLICY_NOT_INSTALLED'
[[ "$(psql_db "$QA_SHAPE_DB" -qAt -c "
  SELECT count(*)=4
    AND bool_and(policyname IN (
      'wos_qa_uat_private_insert',
      'wos_qa_uat_private_insert_guard',
      'wos_qa_uat_private_select',
      'wos_qa_uat_private_select_guard'
    ))
    AND NOT has_table_privilege(
      'authenticated','wos_v1_qa_uat.closeout_controls','SELECT'
    )
    AND NOT has_table_privilege(
      'authenticated','public.wos_qa_trusted_proof_receipts','SELECT'
    )
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname LIKE 'wos\\_%' ESCAPE '\\';
")" = 't' ]] || fail 'QA_STORAGE_COMPAT_POLICY_ACL_INVALID'
[[ "$(psql_db "$QA_SHAPE_DB" -qAt <<'SQL'
BEGIN;
CREATE POLICY wos_guard_after_install_allow_all
ON storage.objects AS PERMISSIVE FOR SELECT TO anon, authenticated
USING (true);
GRANT SELECT ON storage.objects TO anon;
SET LOCAL ROLE anon;
SELECT count(*)=0
FROM storage.objects
WHERE bucket_id='wos-private';
ROLLBACK;
SQL
)" = 't' ]] || fail 'QA_STORAGE_COMPAT_RESTRICTIVE_OR_GUARD_INVALID'
echo 'WOS_V1_QA_UAT_STORAGE_COMPAT_INSTALL=PASS'
echo 'WOS_V1_QA_UAT_STORAGE_RESTRICTIVE_OR_GUARD=PASS'

STORAGE_DB='wos_v1_qa_storage_compat_ci'
psql_db postgres -q -c \
  "DROP DATABASE IF EXISTS \"$STORAGE_DB\" WITH (FORCE)"
psql_db postgres -q -c \
  "CREATE DATABASE \"$STORAGE_DB\" TEMPLATE \"$QA_SHAPE_DB\""
WOS_PG_DOCKER_CONTAINER="$CONTAINER" \
WOS_RC04_STORAGE_DB="$STORAGE_DB" \
WOS_STORAGE_POLICY_MODE='qa_uat_compat' \
  node "$ROOT/tests/sql/wos-v1-rc04-storage-api-smoke.mjs"
{
  printf "SET wos_v1.qa_storage_compat_rollback_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_STORAGE_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$STORAGE_DB" -q
[[ "$(db_storage_policies "$STORAGE_DB")" = "$QA_SHAPE_STORAGE_BEFORE" ]] \
  || fail 'QA_STORAGE_COMPAT_ROLLBACK_POLICY_MISMATCH'
[[ "$(psql_db "$STORAGE_DB" -qAt -c "
  SELECT md5(jsonb_build_object(
    'public',public,
    'fileSizeLimit',file_size_limit,
    'allowedMimeTypes',allowed_mime_types
  )::text)
  FROM storage.buckets WHERE id='wos-private';
")" = "$QA_SHAPE_BUCKET_BEFORE" ]] \
  || fail 'QA_STORAGE_COMPAT_ROLLBACK_BUCKET_MISMATCH'
echo 'WOS_V1_QA_UAT_STORAGE_COMPAT_ROLLBACK=PASS'
if [[ "${WOS_STORAGE_COMPAT_KEEP_DB:-0}" != '1' ]]; then
  psql_db postgres -q -c \
    "DROP DATABASE IF EXISTS \"$STORAGE_DB\" WITH (FORCE)"
fi
{
  printf "SET wos_v1.qa_storage_compat_rollback_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_STORAGE_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
[[ "$(qa_shape_storage_policies)" = "$QA_SHAPE_STORAGE_BEFORE" ]] \
  || fail 'QA_STORAGE_COMPAT_SOURCE_POLICY_NOT_RESTORED'
[[ "$(qa_shape_bucket_config)" = "$QA_SHAPE_BUCKET_BEFORE" ]] \
  || fail 'QA_STORAGE_COMPAT_SOURCE_BUCKET_NOT_RESTORED'
UAT006_CONTINUITY_DB='wos_v1_uat006_continuity_ci'
psql_db postgres -q -c \
  "DROP DATABASE IF EXISTS \"$UAT006_CONTINUITY_DB\" WITH (FORCE)"
psql_db postgres -q -c \
  "CREATE DATABASE \"$UAT006_CONTINUITY_DB\" TEMPLATE \"$QA_SHAPE_DB\""
psql_db "$UAT006_CONTINUITY_DB" -q \
  -v authorization_id='WOS-V1-PRODUCTION-M2-QA-UAT-014' \
  -v execution_id='e646bb29-0fb2-47e5-ad4e-d59428d3ca22' \
  -v arm_token='92929292-9292-4292-8292-929292929292' \
  -v process_nonce='6a95f3bb-4513-4cae-84d9-10656b861589' \
  -v code_sha256="$(printf 'd%.0s' {1..64})" \
  -v manager_profile='11111111-1111-4111-8111-111111111112' \
  < "$ROOT/tests/sql/wos-v1-uat006-continuity-pg17.sql"
echo 'WOS_V1_UAT006_CONTINUITY_TO_READY=PASS'
if [[ "${WOS_UAT006_CONTINUITY_KEEP_DB:-0}" != '1' ]]; then
  psql_db postgres -q -c \
    "DROP DATABASE IF EXISTS \"$UAT006_CONTINUITY_DB\" WITH (FORCE)"
fi
{
  printf "SET wos_v1.qa_uat_close_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_DEACTIVATE_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
{
  printf "SET wos_v1.qa_uat_rollback_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
{
  printf "SET wos_v1.production_m2_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$QA_SHAPE_DB" -q
[[ "$(qa_shape_counts)" = "$QA_SHAPE_COUNTS_BEFORE" ]] \
  || fail 'QA_SHAPE_RECOVERY_LOST_HISTORY'
[[ "$(qa_shape_acl)" = "$QA_SHAPE_ACL_BEFORE" ]] \
  || fail 'QA_SHAPE_RECOVERY_CHANGED_ACL'
[[ "$(qa_shape_storage_policies)" = "$QA_SHAPE_STORAGE_BEFORE" ]] \
  || fail 'QA_SHAPE_RECOVERY_CHANGED_STORAGE_POLICY'
[[ "$(qa_shape_bucket_config)" = "$QA_SHAPE_BUCKET_BEFORE" ]] \
  || fail 'QA_SHAPE_RECOVERY_CHANGED_STORAGE_BUCKET'
[[ "$(qa_shape_history_fingerprint)" = "$QA_SHAPE_HISTORY_BEFORE" ]] \
  || fail 'QA_SHAPE_RECOVERY_CHANGED_HISTORICAL_ROWS'
echo 'WOS_V1_PRODUCTION_M2_QA_SHAPE_COMPAT=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_SHAPE_ACL_STORAGE_RETENTION=PASS'

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$DB\""
psql_db "$DB" -q < "$ROOT/tests/sql/wos-v1-production-m2-pg17-fixture.sql"
psql_db "$DB" -q -c "
  CREATE TABLE IF NOT EXISTS public.cpc_customer_references(
    id uuid PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS public.cpc_projects(
    id uuid PRIMARY KEY
  );
  INSERT INTO public.cpc_customer_references(id)
    VALUES('c1111111-1111-4111-8111-111111111111')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.cpc_projects(id)
    VALUES('d1111111-1111-4111-8111-111111111111')
    ON CONFLICT (id) DO NOTHING;
  ALTER TABLE public.wos_production_orders
    ADD COLUMN IF NOT EXISTS project_id uuid;
  UPDATE public.wos_production_orders
  SET customer_id='c1111111-1111-4111-8111-111111111111',
      project_id='d1111111-1111-4111-8111-111111111111'
  WHERE id='33333333-3333-4333-8333-333333333333';
  CREATE TABLE public.wos_order_create_receipts(
    request_id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id),
    order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
    actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
    payload_fingerprint text NOT NULL
      CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
    response_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE TABLE public.wos_qa_trusted_proof_receipts(id uuid PRIMARY KEY);
  CREATE FUNCTION public.wos_qa_p2_m2_action(
    uuid,integer,uuid,text,jsonb
  ) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$\$
  BEGIN
    RAISE EXCEPTION 'QA_LEGACY_M2_NOT_USED' USING ERRCODE='42501';
  END;
  \$\$;
"

UAT_INPUTS_005="$ROOT/docs/workshop-order-system/qa-fixture/production-m2-uat-20261126/inputs.json"
UAT_INPUTS="$ROOT/docs/workshop-order-system/qa-fixture/production-m2-uat-20261126/inputs-uat009.json"
CREATE_PAYLOAD_JSON="$(jq -c '.createPayload' "$UAT_INPUTS_005")"
EXPECTED_CREATE_FP="$(jq -r '.createPayloadFingerprint' "$UAT_INPUTS_005")"
UAT_REQUEST_ID="$(jq -r '.requestId' "$UAT_INPUTS")"
UAT_OFFICE_AUTH_USER="$(jq -r '.actors.office.authUserId' "$UAT_INPUTS")"
UAT_OFFICE_PROFILE="$(jq -r '.actors.office.profileId' "$UAT_INPUTS")"
UAT_WORKSHOP_PROFILE="$(jq -r '.actors.workshop.profileId' "$UAT_INPUTS")"
UAT_MANAGER_AUTH_USER="$(jq -r '.actors.independentRelease.authUserId' "$UAT_INPUTS")"
UAT_MANAGER_PROFILE="$(jq -r '.actors.independentRelease.profileId' "$UAT_INPUTS")"
UAT_MANAGER_ROLE="$(jq -r '.actors.independentRelease.role' "$UAT_INPUTS")"
UAT_MANAGER_ORGANIZATION="$(jq -r '.actors.independentRelease.organizationId' "$UAT_INPUTS")"
UAT_MANAGER_KEYCHAIN="$(jq -r '.actors.independentRelease.keychainService' "$UAT_INPUTS")"
UAT_VIEWER_PROFILE="$(jq -r '.negativeActors.viewer.profileId' "$UAT_INPUTS")"
UAT_VIEWER_AUTH_USER="$(jq -r '.negativeActors.viewer.authUserId' "$UAT_INPUTS")"
UAT_CROSS_ORG_PROFILE="$(jq -r '.negativeActors.crossOrganizationManager.profileId' "$UAT_INPUTS")"
UAT_CROSS_ORG_AUTH_USER="$(jq -r '.negativeActors.crossOrganizationManager.authUserId' "$UAT_INPUTS")"
UAT_ORGANIZATION_ID="$(jq -r '.qaOrganizationId' "$UAT_INPUTS")"
UAT_FIXTURE_ORGANIZATION_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
UAT_FIXTURE_OFFICE_PROFILE='11111111-1111-4111-8111-111111111111'
UAT_FIXTURE_OFFICE_AUTH_USER='10101010-1010-4010-8010-101010101010'
UAT_CLOSER_EXECUTION_ID="${WOS_QA_UAT_CLOSER_EXECUTION_ID:-91919191-9191-4191-8191-919191919191}"
UAT_CLOSER_ARM_TOKEN="${WOS_QA_UAT_CLOSER_ARM_TOKEN:-92929292-9292-4292-8292-929292929292}"
UAT_EDGE_PROCESS_NONCE="${WOS_QA_UAT_EDGE_PROCESS_NONCE:-93939393-9393-4393-8393-939393939393}"
UAT_CLOSER_CODE_SHA="${WOS_QA_UAT_CLOSER_CODE_SHA:-$(printf 'a%.0s' {1..64})}"
[[ "$UAT_MANAGER_AUTH_USER" = 'b55ccc94-6352-4cad-8600-fad32955d014' ]] \
  || fail 'UAT_MANAGER_AUTH_USER_MISMATCH'
[[ "$UAT_MANAGER_PROFILE" = '9164ac91-a50c-4023-836c-5c0887b619fb' ]] \
  || fail 'UAT_MANAGER_PROFILE_MISMATCH'
[[ "$UAT_MANAGER_ROLE" = 'manager' ]] \
  || fail 'UAT_MANAGER_ROLE_MISMATCH'
[[ "$UAT_MANAGER_ORGANIZATION" = "$UAT_ORGANIZATION_ID" ]] \
  || fail 'UAT_MANAGER_ORGANIZATION_MISMATCH'
[[ "$UAT_MANAGER_KEYCHAIN" = 'WOS_V1_QA_IDENTITY_INDEPENDENT_MANAGER' ]] \
  || fail 'UAT_MANAGER_KEYCHAIN_MISMATCH'
[[ "$UAT_MANAGER_PROFILE" != "$UAT_OFFICE_PROFILE" ]] \
  || fail 'UAT_MANAGER_OFFICE_PROFILE_COLLISION'
[[ "$UAT_MANAGER_PROFILE" != "$UAT_WORKSHOP_PROFILE" ]] \
  || fail 'UAT_MANAGER_WORKSHOP_PROFILE_COLLISION'
[[ "$UAT_MANAGER_AUTH_USER" != "$UAT_OFFICE_AUTH_USER" ]] \
  || fail 'UAT_MANAGER_OFFICE_AUTH_COLLISION'
[[ "$UAT_MANAGER_AUTH_USER" != "$(jq -r '.actors.workshop.authUserId' "$UAT_INPUTS")" ]] \
  || fail 'UAT_MANAGER_WORKSHOP_AUTH_COLLISION'
[[ "$UAT_MANAGER_PROFILE" != "$UAT_VIEWER_PROFILE" ]] \
  || fail 'UAT_MANAGER_VIEWER_PROFILE_COLLISION'
[[ "$UAT_MANAGER_AUTH_USER" != "$UAT_VIEWER_AUTH_USER" ]] \
  || fail 'UAT_MANAGER_VIEWER_AUTH_COLLISION'
[[ "$UAT_MANAGER_PROFILE" != "$UAT_CROSS_ORG_PROFILE" ]] \
  || fail 'UAT_MANAGER_CROSS_ORG_PROFILE_COLLISION'
[[ "$UAT_MANAGER_AUTH_USER" != "$UAT_CROSS_ORG_AUTH_USER" ]] \
  || fail 'UAT_MANAGER_CROSS_ORG_AUTH_COLLISION'

psql_db "$DB" -q -c "
  UPDATE public.profiles
  SET id='$UAT_MANAGER_PROFILE',user_id='$UAT_MANAGER_AUTH_USER'
  WHERE id='88888888-8888-4888-8888-888888888888';
" >/dev/null
ACTUAL_CREATE_FP="$(psql_db "$DB" -qAt \
  -v payload="$CREATE_PAYLOAD_JSON" \
  -v request_id="$UAT_REQUEST_ID" \
  -v actor_user_id="$UAT_OFFICE_AUTH_USER" \
  -v organization_id="$UAT_ORGANIZATION_ID" <<'SQL'
    SELECT encode(sha256(convert_to(jsonb_build_object(
      'requestId',:'request_id'::uuid,
      'actorUserId',:'actor_user_id'::uuid,
      'organizationId',:'organization_id'::uuid,
      'payload',:'payload'::jsonb - ARRAY[
        'customerNameSnapshot','projectNameSnapshot',
        'salesOwnerProfileId','projectOwnerProfileId'
      ]
    )::text,'UTF8')),'hex')
SQL
)"
[[ "$ACTUAL_CREATE_FP" = "$EXPECTED_CREATE_FP" ]] \
  || fail 'CREATE_PAYLOAD_FINGERPRINT_MISMATCH'
BIND_CREATE_FP="$(psql_db "$DB" -qAt \
  -v payload="$CREATE_PAYLOAD_JSON" \
  -v request_id="$UAT_REQUEST_ID" \
  -v actor_user_id="$UAT_FIXTURE_OFFICE_AUTH_USER" \
  -v organization_id="$UAT_FIXTURE_ORGANIZATION_ID" <<'SQL'
    SELECT encode(sha256(convert_to(jsonb_build_object(
      'requestId',:'request_id'::uuid,
      'actorUserId',:'actor_user_id'::uuid,
      'organizationId',:'organization_id'::uuid,
      'payload',:'payload'::jsonb - ARRAY[
        'customerNameSnapshot','projectNameSnapshot',
        'salesOwnerProfileId','projectOwnerProfileId'
      ]
    )::text,'UTF8')),'hex')
SQL
)"
echo 'WOS_V1_QA_UAT_MANAGER_BINDING=PASS'

psql_db "$DB" -q -c "
  UPDATE public.wos_production_orders
  SET order_number='QA-NONPROD-$UAT_REQUEST_ID'
  WHERE id='33333333-3333-4333-8333-333333333333';
  INSERT INTO public.wos_visual_baselines(
    id,organization_id,entity_type,entity_id,version_label,status
  ) VALUES(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'PRODUCTION_ORDER','33333333-3333-4333-8333-333333333333','V1','CURRENT'
  );
  INSERT INTO public.wos_visual_baseline_items(
    baseline_id,reference_image_id,display_order,is_required
  ) VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
     '41111111-1111-4111-8111-111111111111',0,true),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
     '42222222-2222-4222-8222-222222222222',1,true),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
     '43333333-3333-4333-8333-333333333333',2,true),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
     '44444444-4444-4444-8444-444444444444',3,true);
"

psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-uat006-resume-pg17.sql"
psql_db "$DB" -q -c "
  CREATE FUNCTION public.wos_create_production_order(uuid,jsonb)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_register_uploaded_reference_image(
    uuid,uuid,text,text
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_confirm_office_completeness(
    uuid,integer,text,text
  ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_submit_production_order(
    uuid,integer,text,uuid
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_operator_order_action(
    uuid,integer,uuid,text,text
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_office_save_correction(
    uuid,integer,uuid,jsonb,text
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_office_resubmit_order(
    uuid,integer,uuid,text
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
  CREATE FUNCTION public.wos_operator_review_correction(
    uuid,integer,uuid,text
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
  AS \$stub\$ BEGIN RAISE EXCEPTION 'PG17_APP_RPC_STUB'; END; \$stub\$;
" >/dev/null
psql_db "$DB" -q -c "
  INSERT INTO public.wos_order_create_receipts(
    request_id,organization_id,order_id,actor_profile_id,
    payload_fingerprint,response_json
  ) VALUES(
    '$UAT_REQUEST_ID',
    '$UAT_FIXTURE_ORGANIZATION_ID',
    '33333333-3333-4333-8333-333333333333',
    '$UAT_FIXTURE_OFFICE_PROFILE',
    '$BIND_CREATE_FP',
    jsonb_build_object(
      'status','CREATED',
      'orderId','33333333-3333-4333-8333-333333333333',
      'requestId','$UAT_REQUEST_ID',
      'version',1,
      'versionLabel','V1',
      'workflowStatus','DRAFT'
    )
  );
"

HISTORICAL_IMAGES_BEFORE="$(psql_db "$DB" -qAt -c "
  SELECT md5(jsonb_agg(jsonb_build_object(
    'id',id,'category',category,'status',image_status,'version',version_label,
    'path',storage_path,'supersededAt',superseded_at) ORDER BY id)::text)
  FROM public.wos_reference_images
")"
HISTORICAL_IMAGE_COUNT_BEFORE="$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_reference_images
")"
HISTORICAL_PROOFS_COUNT_BEFORE="$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_verified_image_proofs
")"
HISTORICAL_STORAGE_BEFORE="$(psql_db "$DB" -qAt -c "
  SELECT md5(jsonb_agg(jsonb_build_object(
    'id',id,'bucket',bucket_id,'name',name,'version',version,'updated',updated_at)
    ORDER BY id)::text)
  FROM storage.objects
")"

flow_business_fingerprint() {
  psql_db "$DB" -qAt -c "
    SELECT md5(jsonb_build_object(
      'order',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM public.wos_production_orders r
      ),
      'baselines',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
        FROM public.wos_visual_baselines r
      ),
      'baselineItems',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.baseline_id,r.display_order)
        FROM public.wos_visual_baseline_items r
      ),
      'resources',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.resource_type)
        FROM public.wos_resource_readiness r
      ),
      'history',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.reason_code)
        FROM public.wos_status_history r
      ),
      'confirmations',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.confirmed_at,r.confirmation_type)
        FROM public.wos_confirmations r
      ),
      'm2Receipts',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.request_id)
        FROM public.wos_v1_m2_receipts r
      ),
      'startReleases',(
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.request_id)
        FROM public.wos_v1_start_releases r
      )
    )::text)
  "
}

flow_proof_fingerprint() {
  psql_db "$DB" -qAt -c "
    SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY r.image_id)::text)
    FROM public.wos_verified_image_proofs r
  "
}

{
  printf "SET wos_v1.qa_uat_install_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.qa_uat_activation_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ACTIVATE_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

psql_db "$DB" -q <<SQL
BEGIN;
WITH control AS (
  INSERT INTO wos_v1_qa_uat.closeout_controls(
    execution_id,authorization_id,project_ref,code_sha256,arm_token,opened_at,
    write_deadline_at,db_cleanup_deadline_at,edge_cleanup_deadline_at,
    authorized_order_id,authorized_organization_id,
    db_last_heartbeat_at,edge_last_heartbeat_at,edge_process_nonce
  ) VALUES(
    '93939393-9393-4393-8393-939393939393',
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    'xulmpqaknlwqqculbsek',
    repeat('b',64),
    '94949494-9494-4494-8494-949494949494',
    statement_timestamp()-interval '481 seconds',
    statement_timestamp()-interval '1 second',
    statement_timestamp()+interval '59 seconds',
    statement_timestamp()+interval '359 seconds',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    statement_timestamp(),
    statement_timestamp(),
    '95959595-9595-4595-8595-959595959595'
  ) RETURNING *
)
INSERT INTO wos_v1_qa_uat.closer_arm_receipts(
  execution_id,closer_kind,authorization_id,project_ref,code_sha256,
  arm_token,executor_kind,write_deadline_at,cleanup_deadline_at,heartbeat_at
)
SELECT control.execution_id,kind,
  control.authorization_id,control.project_ref,control.code_sha256,
  '94949494-9494-4494-8494-949494949494',
  CASE WHEN kind='DB' THEN 'PG_CRON' ELSE 'LAUNCHD' END,
  control.write_deadline_at,
  CASE WHEN kind='DB'
    THEN control.db_cleanup_deadline_at
    ELSE control.edge_cleanup_deadline_at
  END,
  statement_timestamp()
FROM control
CROSS JOIN (VALUES('DB'),('EDGE')) kinds(kind);
DO \$deadline\$
BEGIN
  BEGIN
    PERFORM wos_v1_qa_uat.assert_write_open(
      'WOS-V1-PRODUCTION-M2-QA-UAT-014',
      '33333333-3333-4333-8333-333333333333'
    );
    RAISE EXCEPTION 'QA_UAT_EXPIRED_WRITE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'QA_UAT_WRITE_DEADLINE_EXPIRED' THEN RAISE; END IF;
  END;
END;
\$deadline\$;
SET LOCAL ROLE service_role;
DO \$edge_deadline\$
BEGIN
  BEGIN
    PERFORM public.wos_v1_qa_uat_edge_write_allowed(
      'WOS-V1-PRODUCTION-M2-QA-UAT-014',
      'xulmpqaknlwqqculbsek',
      '93939393-9393-4393-8393-939393939393',
      '95959595-9595-4595-8595-959595959595',
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333'
    );
    RAISE EXCEPTION 'QA_UAT_EXPIRED_EDGE_WRITE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'QA_UAT_EDGE_GATE_CLOSED' THEN RAISE; END IF;
  END;
END;
\$edge_deadline\$;
RESET ROLE;
ROLLBACK;
SQL
echo 'WOS_V1_QA_UAT_HARD_WRITE_DEADLINE=PASS'
echo 'WOS_V1_QA_UAT_EDGE_HARD_WRITE_DEADLINE=PASS'

if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
  WOS_V1_QA_ARM_TOKEN="$UAT_CLOSER_ARM_TOKEN" \
  WOS_V1_QA_CODE_SHA256="$UAT_CLOSER_CODE_SHA" \
  node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" arm \
    >/tmp/wos-qa-uat-db-arm-without-cron-$$.log 2>&1
then
  fail 'DB_CLOSER_ARM_WITHOUT_CRON_SUCCEEDED'
fi
[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM wos_v1_qa_uat.closeout_controls;
")" = '0' ]] || fail 'FAILED_CRON_ARM_WAS_NOT_ROLLED_BACK'
echo 'WOS_V1_QA_UAT_DB_CLOSER_CRON_REQUIRED=PASS'

psql_db "$DB" -q -c "
  CREATE SCHEMA cron;
  CREATE TABLE cron.job(
    jobid bigserial PRIMARY KEY,
    jobname text NOT NULL UNIQUE,
    schedule text NOT NULL,
    command text NOT NULL,
    active boolean NOT NULL DEFAULT true
  );
  CREATE FUNCTION cron.schedule(text,text,text)
  RETURNS bigint LANGUAGE plpgsql
  AS \$cron_schedule\$
  DECLARE
    v_job_id bigint;
  BEGIN
    INSERT INTO cron.job(jobname,schedule,command)
    VALUES(\$1,\$2,\$3)
    RETURNING jobid INTO v_job_id;
    RETURN v_job_id;
  END;
  \$cron_schedule\$;
  CREATE FUNCTION cron.unschedule(bigint)
  RETURNS boolean LANGUAGE plpgsql
  AS \$cron_unschedule\$
  BEGIN
    DELETE FROM cron.job WHERE jobid=\$1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cron job % does not exist',\$1 USING ERRCODE='22023';
    END IF;
    RETURN true;
  END;
  \$cron_unschedule\$;
"
DB_ARM_OUTPUT="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
  WOS_V1_QA_ARM_TOKEN="$UAT_CLOSER_ARM_TOKEN" \
  WOS_V1_QA_CODE_SHA256="$UAT_CLOSER_CODE_SHA" \
  WOS_V1_QA_DB_CLOSER_MOCK_CRON='true' \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" arm
)"
[[ "$(printf '%s' "$DB_ARM_OUTPUT" | jq -r '.status')" = 'ARMED' ]] \
  || fail 'DB_CLOSER_ARM_FAILED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT db_cron_job_id IS NOT NULL
  FROM wos_v1_qa_uat.closeout_controls
  WHERE execution_id='$UAT_CLOSER_EXECUTION_ID';
")" = 't' ]] || fail 'DB_CLOSER_CRON_JOB_NOT_RECORDED'
DB_STATUS_OUTPUT="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" status
)"
[[ "$(printf '%s' "$DB_STATUS_OUTPUT" | jq -r '.dbState')" = 'ARMED' ]] \
  || fail 'DB_CLOSER_STATUS_FAILED'
nohup bash -c "
  while true; do
    docker exec -i '$CONTAINER' psql -X -v ON_ERROR_STOP=1 \
      -U postgres -d '$DB' -At \
      -c \"SELECT wos_v1_qa_uat.db_close_tick(
        '$UAT_CLOSER_EXECUTION_ID'::uuid,
        '97000000-0000-4000-8000-000000000001'::uuid
      );\" >/dev/null 2>&1 || true
    sleep 5
  done
" >/tmp/wos-qa-uat-db-heartbeat-$$.log 2>&1 &
DB_HEARTBEAT_LOOP_PID=$!
echo 'WOS_V1_QA_UAT_DB_CLOSER_ARM=PASS'
psql_db "$DB" -q -c "
  SET wos_v1.qa_uat_gate_open_authorized='yes';
  SET wos_v1.qa_project='xulmpqaknlwqqculbsek';
  DO \$one_arm\$
  BEGIN
    BEGIN
      PERFORM public.wos_v1_qa_uat_open_gate(
        'WOS-V1-PRODUCTION-M2-QA-UAT-014',
        '33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111',
        ARRAY['BASELINE_SELECT','BASELINE_OFFICE_CONFIRM'],
        clock_timestamp()+interval '7 minutes'
      );
      RAISE EXCEPTION 'QA_UAT_ONE_ARM_GATE_ALLOWED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM NOT IN (
        'QA_UAT_CLOSERS_NOT_ARMED',
        'QA_UAT_CLOSER_HEARTBEAT_STALE',
        'QA_UAT_ORDER_NOT_BOUND'
      ) THEN RAISE; END IF;
    END;
  END;
  \$one_arm\$;
" >/dev/null
echo 'WOS_V1_QA_UAT_DUAL_ARM_REQUIRED=PASS'
psql_db "$DB" -qAt -c "
  SELECT wos_v1_qa_uat.record_edge_heartbeat(
    '$UAT_CLOSER_EXECUTION_ID'::uuid,
    '$UAT_CLOSER_ARM_TOKEN'::uuid,
    '$UAT_EDGE_PROCESS_NONCE'::uuid
  )::text;
" >/dev/null
EDGE_STATUS_OPEN="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_control_status(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    'xulmpqaknlwqqculbsek'
  )::text;
")"
[[ "$(printf '%s' "$EDGE_STATUS_OPEN" | jq -r '.status')" = 'OPEN' ]] \
  || fail 'QA_UAT_EDGE_CONTROL_OPEN_INVALID'
[[ "$(printf '%s' "$EDGE_STATUS_OPEN" | jq -r '.edgeProcessNonce')" \
  = "$UAT_EDGE_PROCESS_NONCE" ]] \
  || fail 'QA_UAT_EDGE_CONTROL_OPEN_NONCE_MISMATCH'
EDGE_STATUS_STALE="$(psql_db "$DB" -qAt -c "
  BEGIN;
  UPDATE wos_v1_qa_uat.closeout_controls
  SET db_last_heartbeat_at=clock_timestamp()-interval '31 seconds'
  WHERE execution_id='$UAT_CLOSER_EXECUTION_ID'::uuid;
  SELECT public.wos_v1_qa_uat_edge_control_status(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    'xulmpqaknlwqqculbsek'
  )::text;
  ROLLBACK;
")"
[[ "$(printf '%s' "$EDGE_STATUS_STALE" | jq -r '.status')" = 'STALE' ]] \
  || fail 'QA_UAT_EDGE_CONTROL_STALE_INVALID'
[[ "$(printf '%s' "$EDGE_STATUS_STALE" | jq -r '.edgeProcessNonce')" \
  = "$UAT_EDGE_PROCESS_NONCE" ]] \
  || fail 'QA_UAT_EDGE_CONTROL_STALE_NONCE_MISMATCH'
echo 'WOS_V1_QA_UAT_EDGE_OPEN_AND_STALE_STATUS=PASS'
psql_db "$DB" -qAt -c "
  DO \$binding_negative\$
  BEGIN
    BEGIN
      PERFORM wos_v1_qa_uat.bind_qa_uat_order(
        '$UAT_CLOSER_EXECUTION_ID'::uuid,
        '$UAT_REQUEST_ID'::uuid,
        '33333333-3333-4333-8333-333333333333'::uuid,
        '$UAT_FIXTURE_ORGANIZATION_ID'::uuid,
        '$UAT_FIXTURE_OFFICE_PROFILE'::uuid,
        repeat('f',64)
      );
      RAISE EXCEPTION 'QA_UAT_BIND_WITH_WRONG_FINGERPRINT_ALLOWED';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM<>'QA_UAT_ORDER_BIND_SCOPE_DENIED' THEN RAISE; END IF;
    END;
  END;
  \$binding_negative\$;
  SELECT wos_v1_qa_uat.bind_qa_uat_order(
    '$UAT_CLOSER_EXECUTION_ID'::uuid,
    '$UAT_REQUEST_ID'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    '$UAT_FIXTURE_ORGANIZATION_ID'::uuid,
    '$UAT_FIXTURE_OFFICE_PROFILE'::uuid,
    '$BIND_CREATE_FP'
  )::text;
" >/dev/null
echo 'WOS_V1_QA_UAT_DUAL_CLOSERS_ARMED=PASS'
psql_db "$DB" -q -c "
  REVOKE ALL ON FUNCTION
    public.wos_create_production_order(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_confirm_office_completeness(uuid,integer,text,text)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_submit_production_order(uuid,integer,text,uuid)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_operator_order_action(uuid,integer,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_office_resubmit_order(uuid,integer,uuid,text)
  FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION
    public.wos_operator_review_correction(uuid,integer,uuid,text)
  FROM PUBLIC, anon, authenticated;
  DO \$private_acl\$
  BEGIN
    IF to_regprocedure(
      'public.wos_v1_assert_current_image_set(uuid,uuid,text)'
    ) IS NOT NULL THEN
      EXECUTE 'REVOKE ALL ON FUNCTION '
        'public.wos_v1_assert_current_image_set(uuid,uuid,text) '
        'FROM PUBLIC, anon, authenticated';
    END IF;
  END;
  \$private_acl\$;
  CREATE TABLE IF NOT EXISTS
    public.wos_office_revisions(id uuid PRIMARY KEY);
  GRANT EXECUTE ON FUNCTION public.wos_create_production_order(uuid,jsonb)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_register_uploaded_reference_image(uuid,uuid,text,text)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_confirm_office_completeness(uuid,integer,text,text)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_submit_production_order(uuid,integer,text,uuid)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_operator_order_action(uuid,integer,uuid,text,text)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_office_resubmit_order(uuid,integer,uuid,text)
  TO anon;
  GRANT EXECUTE ON FUNCTION
    public.wos_operator_review_correction(uuid,integer,uuid,text)
  TO anon;
  GRANT INSERT,UPDATE,DELETE ON public.wos_production_orders
  TO authenticated;
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.wos_office_revisions
  TO authenticated;
" >/dev/null
APP_ACTIVATE_OUTPUT="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" \
      activate-qa-app
)"
[[ "$(printf '%s' "$APP_ACTIVATE_OUTPUT" | tail -n 1)" \
  = 'WOS_V1_QA_DB_CLOSER_APP_ACTIVATE=PASS' ]] \
  || fail 'QA_APP_ACTIVATION_FAILED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure),
        ('public.wos_confirm_office_completeness(uuid,integer,text,text)'::regprocedure),
        ('public.wos_submit_production_order(uuid,integer,text,uuid)'::regprocedure),
        ('public.wos_operator_order_action(uuid,integer,uuid,text,text)'::regprocedure),
        ('public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)'::regprocedure),
        ('public.wos_office_resubmit_order(uuid,integer,uuid,text)'::regprocedure),
        ('public.wos_operator_review_correction(uuid,integer,uuid,text)'::regprocedure)
      ) functions(procedure)
      WHERE has_function_privilege('anon',procedure,'EXECUTE')
        OR NOT has_function_privilege(
          'authenticated',procedure,'EXECUTE'
        )
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.wos_create_production_order(uuid,jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.wos_create_production_order(uuid,jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
    AND (
      to_regprocedure(
        'public.wos_v1_assert_current_image_set(uuid,uuid,text)'
      ) IS NULL
      OR NOT has_function_privilege(
        'authenticated',
        'public.wos_v1_assert_current_image_set(uuid,uuid,text)',
        'EXECUTE'
      )
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'INSERT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'UPDATE'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_production_orders', 'DELETE'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'SELECT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'INSERT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'UPDATE'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'DELETE'
    );
")" = 't' ]] || fail 'QA_APP_ACTIVATION_ACL_INVALID'
echo 'WOS_V1_QA_UAT_APP_ACTIVATION=PASS'
psql_db "$DB" -q -c "
  UPDATE public.wos_production_orders
  SET customer_id=NULL
  WHERE id='33333333-3333-4333-8333-333333333333';
  SET ROLE service_role;
  DO \$binding_drift\$
  BEGIN
    BEGIN
      PERFORM public.wos_v1_qa_uat_edge_write_allowed(
        'WOS-V1-PRODUCTION-M2-QA-UAT-014',
        'xulmpqaknlwqqculbsek',
        '$UAT_CLOSER_EXECUTION_ID',
        '$UAT_EDGE_PROCESS_NONCE',
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '33333333-3333-4333-8333-333333333333'
      );
      RAISE EXCEPTION 'QA_UAT_ORDER_BINDING_DRIFT_ALLOWED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM<>'QA_UAT_EDGE_ORDER_BINDING_DRIFT' THEN RAISE; END IF;
    END;
  END;
  \$binding_drift\$;
  RESET ROLE;
  UPDATE public.wos_production_orders
  SET customer_id='c1111111-1111-4111-8111-111111111111'
  WHERE id='33333333-3333-4333-8333-333333333333';
" >/dev/null
echo 'WOS_V1_QA_UAT_CREATE_RECEIPT_BINDING_DRIFT_DENIED=PASS'
psql_db "$DB" -q -c "
  SET ROLE service_role;
  SELECT public.wos_v1_qa_uat_edge_write_allowed(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    'xulmpqaknlwqqculbsek',
    '$UAT_CLOSER_EXECUTION_ID',
    '$UAT_EDGE_PROCESS_NONCE',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333'
  );
  DO \$viewer\$
  BEGIN
    BEGIN
      PERFORM public.wos_v1_qa_uat_edge_write_allowed(
        'WOS-V1-PRODUCTION-M2-QA-UAT-014',
        'xulmpqaknlwqqculbsek',
        '$UAT_CLOSER_EXECUTION_ID',
        '$UAT_EDGE_PROCESS_NONCE',
        '44444444-4444-4444-8444-444444444444',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '33333333-3333-4333-8333-333333333333'
      );
      RAISE EXCEPTION 'EDGE_VIEWER_ALLOWED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM<>'QA_UAT_EDGE_ACTOR_SCOPE_DENIED' THEN RAISE; END IF;
    END;
  END;
  \$viewer\$;
  DO \$foreign\$
  BEGIN
    BEGIN
      PERFORM public.wos_v1_qa_uat_edge_write_allowed(
        'WOS-V1-PRODUCTION-M2-QA-UAT-014',
        'xulmpqaknlwqqculbsek',
        '$UAT_CLOSER_EXECUTION_ID',
        '$UAT_EDGE_PROCESS_NONCE',
        '55555555-5555-4555-8555-555555555555',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '33333333-3333-4333-8333-333333333333'
      );
      RAISE EXCEPTION 'EDGE_CROSS_ORG_ALLOWED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM<>'QA_UAT_EDGE_ACTOR_SCOPE_DENIED' THEN RAISE; END IF;
    END;
  END;
  \$foreign\$;
  RESET ROLE;
" >/dev/null
echo 'WOS_V1_QA_UAT_EDGE_POSITIVE_AND_NEGATIVE_GATE=PASS'

psql_db "$DB" -q -c "
  INSERT INTO wos_v1_qa_uat.write_gates(
    authorization_id,project_ref,organization_id,order_id,actor_profile_id,
    allowed_actions,opened_at,expires_at
  ) VALUES(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014-EXPIRED',
    'xulmpqaknlwqqculbsek',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    ARRAY['MATERIAL_RECORD'],
    clock_timestamp()-interval '10 minutes',
    clock_timestamp()-interval '1 minute'
  );
  SET wos_v1.qa_uat_gate_open_authorized='yes';
  SET wos_v1.qa_project='xulmpqaknlwqqculbsek';
  SELECT public.wos_v1_qa_uat_open_gate(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    ARRAY['BASELINE_SELECT','BASELINE_OFFICE_CONFIRM'],
    clock_timestamp()+interval '7 minutes'
  );
  SELECT public.wos_v1_qa_uat_open_gate(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    ARRAY['MATERIAL_RECORD','BASELINE_WORKSHOP_CONFIRM','FINAL_READINESS_CONFIRM'],
    clock_timestamp()+interval '7 minutes'
  );
  SELECT public.wos_v1_qa_uat_open_gate(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '$UAT_MANAGER_PROFILE',
    ARRAY['START_RELEASE'],
    clock_timestamp()+interval '7 minutes'
  );
" >/dev/null

{
  printf "SET wos.qa_uat.manager_auth_user='%s';\n" "$UAT_MANAGER_AUTH_USER"
  cat "$ROOT/tests/sql/wos-v1-production-m2-qa-uat-pg17-assertions.sql"
} | psql_db "$DB" -q

[[ "$(psql_db "$DB" -qAt -c "
  SELECT md5(jsonb_agg(jsonb_build_object(
    'id',id,'category',category,'status',image_status,'version',version_label,
    'path',storage_path,'supersededAt',superseded_at) ORDER BY id)::text)
  FROM public.wos_reference_images
")" = "$HISTORICAL_IMAGES_BEFORE" ]] || fail 'IMAGE_FINGERPRINT_CHANGED_DURING_FLOW'

FLOW_BUSINESS_AFTER="$(flow_business_fingerprint)"
FLOW_PROOFS_AFTER="$(flow_proof_fingerprint)"

LOCK_MARKER="/tmp/wos-qa-uat-lock-$$-$RANDOM"
MAIN_DB_APPLICATION="wos_qa_uat_main_executor_$$"
docker exec "$CONTAINER" rm -f "$LOCK_MARKER" >/dev/null 2>&1 || true
(
  docker exec -i -e PGAPPNAME="$MAIN_DB_APPLICATION" "$CONTAINER" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" -qAt <<SQL >/dev/null
    BEGIN;
    SELECT 1 FROM wos_v1_qa_uat.write_gates
    WHERE state='OPEN'
    ORDER BY gate_id
    LIMIT 1
    FOR SHARE;
    \! touch '$LOCK_MARKER'
    SELECT pg_sleep(60);
    COMMIT;
SQL
) &
CLOSE_HOLDER_PID=$!
LOCK_OBSERVED=0
for _ in {1..100}; do
  if docker exec "$CONTAINER" test -f "$LOCK_MARKER"; then
    LOCK_OBSERVED=1
    break
  fi
  sleep 0.1
done
[[ "$LOCK_OBSERVED" -eq 1 ]] || fail 'INDEPENDENT_CLOSE_LOCK_NOT_ACQUIRED'
CLOSE_STARTED_EPOCH="$(date +%s)"
CLOSE_RUNNER_MARKER_A="/tmp/wos-qa-uat-closer-a-$$"
CLOSE_RUNNER_MARKER_B="/tmp/wos-qa-uat-closer-b-$$"
CLOSE_RUNNER_RESULT_A="/tmp/wos-qa-uat-closer-a-$$.json"
CLOSE_RUNNER_RESULT_B="/tmp/wos-qa-uat-closer-b-$$.json"
CLOSE_SQL_A="/tmp/wos-qa-uat-close-a-$$.sql"
CLOSE_SQL_B="/tmp/wos-qa-uat-close-b-$$.sql"
printf "SELECT wos_v1_qa_uat.close_db_closer('%s'::uuid,'95000000-0000-4000-8000-000000000001'::uuid,'DETACHED_CLOSE_A');\n" \
  "$UAT_CLOSER_EXECUTION_ID" > "$CLOSE_SQL_A"
printf "SELECT wos_v1_qa_uat.close_db_closer('%s'::uuid,'95000000-0000-4000-8000-000000000002'::uuid,'DETACHED_CLOSE_B');\n" \
  "$UAT_CLOSER_EXECUTION_ID" > "$CLOSE_SQL_B"
nohup bash -c "
  touch '$CLOSE_RUNNER_MARKER_A'
  docker exec -i '$CONTAINER' psql -X -v ON_ERROR_STOP=1 -U postgres -d '$DB' -At -f - \
    < '$CLOSE_SQL_A' > '$CLOSE_RUNNER_RESULT_A'
" >/tmp/wos-qa-uat-closer-a-$$.log 2>&1 &
CLOSER_A_PID=$!
nohup bash -c "
  touch '$CLOSE_RUNNER_MARKER_B'
  docker exec -i '$CONTAINER' psql -X -v ON_ERROR_STOP=1 -U postgres -d '$DB' -At -f - \
    < '$CLOSE_SQL_B' > '$CLOSE_RUNNER_RESULT_B'
" >/tmp/wos-qa-uat-closer-b-$$.log 2>&1 &
CLOSER_B_PID=$!
for _ in {1..100}; do
  if [[ -f "$CLOSE_RUNNER_MARKER_A" && -f "$CLOSE_RUNNER_MARKER_B" ]]; then
    break
  fi
  sleep 0.1
done
[[ -f "$CLOSE_RUNNER_MARKER_A" && -f "$CLOSE_RUNNER_MARKER_B" ]] \
  || fail 'DETACHED_CLOSERS_DID_NOT_START'
MAIN_DB_PID="$(psql_db "$DB" -qAt -c "
  SELECT pid FROM pg_stat_activity
  WHERE application_name='$MAIN_DB_APPLICATION'
    AND state='active'
  LIMIT 1;
")"
[[ "$MAIN_DB_PID" =~ ^[0-9]+$ ]] || fail 'MAIN_EXECUTOR_DB_PID_NOT_FOUND'
sleep 1
[[ "$(psql_db "$DB" -qAt -c "
  SELECT pg_terminate_backend($MAIN_DB_PID);
")" = 't' ]] || fail 'MAIN_EXECUTOR_DB_TERMINATION_FAILED'
wait "$CLOSER_A_PID" || fail 'DETACHED_DB_CLOSER_A_FAILED'
wait "$CLOSER_B_PID" || fail 'DETACHED_DB_CLOSER_B_FAILED'
CLOSE_FINISHED_EPOCH="$(date +%s)"
wait "$CLOSE_HOLDER_PID" 2>/dev/null || true
CLOSE_ELAPSED_SECONDS="$((CLOSE_FINISHED_EPOCH-CLOSE_STARTED_EPOCH))"
[[ "$CLOSE_ELAPSED_SECONDS" -ge 1 ]] || fail 'INDEPENDENT_CLOSE_DID_NOT_WAIT_FOR_GATE_LOCK'
[[ "$(jq -r '.status' "$CLOSE_RUNNER_RESULT_A" 2>/dev/null || true)" =~ ^(CLOSED|REPLAYED)$ ]] \
  || fail 'DETACHED_DB_CLOSER_A_RESULT_INVALID'
[[ "$(jq -r '.status' "$CLOSE_RUNNER_RESULT_B" 2>/dev/null || true)" =~ ^(CLOSED|REPLAYED)$ ]] \
  || fail 'DETACHED_DB_CLOSER_B_RESULT_INVALID'
[[ "$(printf '%s\n%s\n' \
  "$(jq -r '.status' "$CLOSE_RUNNER_RESULT_A")" \
  "$(jq -r '.status' "$CLOSE_RUNNER_RESULT_B")" | sort | tr '\n' ',')" \
  = 'CLOSED,REPLAYED,' ]] || fail 'CONCURRENT_DB_CLOSE_NOT_IDEMPOTENT'
echo 'WOS_V1_QA_UAT_MAIN_PROCESS_KILL_DB_CLOSER=PASS'
echo 'WOS_V1_QA_UAT_CONCURRENT_DB_CLOSE_IDEMPOTENT=PASS'
DB_CLOSE_REPLAY="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
  WOS_V1_QA_CLOSE_REQUEST_ID='95000000-0000-4000-8000-000000000003' \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" close
)"
[[ "$(printf '%s' "$DB_CLOSE_REPLAY" | jq -r '.status')" = 'REPLAYED' ]] \
  || fail 'DB_CLOSER_CLI_REPLAY_FAILED'
if WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
  WOS_V1_QA_ARM_TOKEN="$UAT_CLOSER_ARM_TOKEN" \
  WOS_V1_QA_CODE_SHA256="$UAT_CLOSER_CODE_SHA" \
  WOS_V1_QA_DB_CLOSER_MOCK_CRON='true' \
  node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" arm \
    >/tmp/wos-qa-uat-rearm-closed-$$.log 2>&1
then
  fail 'CLOSED_DB_CONTROL_REARM_SUCCEEDED'
fi
[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM cron.job
  WHERE jobname='wos_v1_qa_uat_db_closer_$(printf '%s' "$UAT_CLOSER_EXECUTION_ID" | tr -d '-')';
")" = '0' ]] || fail 'DB_CLOSER_CRON_JOB_NOT_UNSCHEDULED'
echo 'WOS_V1_QA_UAT_CLOSED_GATE_REARM_DENIED=PASS'
echo 'WOS_V1_QA_UAT_DB_CRON_UNSCHEDULED=PASS'
DB_REVOKE_REPLAY="$(
  WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
  WOS_QA_DATABASE="$DB" \
  WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
  WOS_V1_QA_CLOSE_REQUEST_ID='95000000-0000-4000-8000-000000000004' \
    node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" revoke
)"
[[ "$(printf '%s' "$DB_REVOKE_REPLAY" | jq -r '.status')" = 'REPLAYED' ]] \
  || fail 'DB_CLOSER_CLI_REVOKE_REPLAY_FAILED'
echo 'WOS_V1_QA_UAT_DB_CLOSER_CLI_CLOSE_AND_REVOKE=PASS'

WOS_QA_UAT_CLOSER_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
WOS_QA_UAT_CLOSER_ARM_TOKEN="$UAT_CLOSER_ARM_TOKEN" \
WOS_QA_UAT_EDGE_PROCESS_NONCE="$UAT_EDGE_PROCESS_NONCE" \
WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
WOS_QA_DATABASE="$DB" \
  node "$ROOT/tests/live/wos-v1-qa-edge-closer-process-kill.mjs" \
  || fail 'DETACHED_EDGE_CLOSER_TEST_FAILED'

EDGE_CLOSE_OUTPUT="$(psql_db "$DB" -qAt -c "
  SELECT wos_v1_qa_uat.close_edge_closer(
    '$UAT_CLOSER_EXECUTION_ID'::uuid,
    '96000000-0000-4000-8000-000000000001'::uuid,
    'INDEPENDENT_EDGE_CLOSE'
  )::text;
")"
[[ "$(printf '%s' "$EDGE_CLOSE_OUTPUT" | jq -r '.status')" = 'REPLAYED' ]] \
  || fail 'INDEPENDENT_EDGE_CLOSE_REPLAY_FAILED'
EDGE_CLOSE_REPLAY="$(psql_db "$DB" -qAt -c "
  SELECT wos_v1_qa_uat.close_edge_closer(
    '$UAT_CLOSER_EXECUTION_ID'::uuid,
    '96000000-0000-4000-8000-000000000002'::uuid,
    'INDEPENDENT_EDGE_CLOSE_REPLAY'
  )::text;
")"
[[ "$(printf '%s' "$EDGE_CLOSE_REPLAY" | jq -r '.status')" = 'REPLAYED' ]] \
  || fail 'INDEPENDENT_EDGE_CLOSE_NOT_IDEMPOTENT'
EDGE_PROBE_CLOSED="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_probe(
    '$UAT_CLOSER_EXECUTION_ID'::uuid,
    '$UAT_EDGE_PROCESS_NONCE'::uuid
  )::text;
")"
[[ "$(printf '%s' "$EDGE_PROBE_CLOSED" | jq -r '.status')" = 'CLOSED' ]] \
  || fail 'FULL_M2_EDGE_PROBE_CLOSED_INVALID'
[[ "$(printf '%s' "$EDGE_PROBE_CLOSED" | jq -r '.edgeProcessNonce')" \
  = "$UAT_EDGE_PROCESS_NONCE" ]] \
  || fail 'FULL_M2_EDGE_PROBE_CLOSED_NONCE_MISMATCH'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT public.wos_v1_qa_uat_edge_control_status(
    'WOS-V1-PRODUCTION-M2-QA-UAT-014',
    'xulmpqaknlwqqculbsek'
  )->>'status';
")" = 'CLOSED' ]] || fail 'EDGE_CONTROL_NOT_CLOSED'
psql_db "$DB" -q -c "
  SET ROLE service_role;
  DO \$edge_closed\$
  BEGIN
    BEGIN
      PERFORM public.wos_v1_qa_uat_edge_write_allowed(
        'WOS-V1-PRODUCTION-M2-QA-UAT-014',
        'xulmpqaknlwqqculbsek',
        '$UAT_CLOSER_EXECUTION_ID',
        '$UAT_EDGE_PROCESS_NONCE',
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '33333333-3333-4333-8333-333333333333'
      );
      RAISE EXCEPTION 'EDGE_WRITE_ALLOWED_AFTER_CLOSE';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM<>'QA_UAT_EDGE_GATE_CLOSED' THEN RAISE; END IF;
    END;
  END;
  \$edge_closed\$;
  RESET ROLE;
" >/dev/null
echo 'WOS_V1_QA_UAT_INDEPENDENT_EDGE_CLOSE=PASS'
echo 'WOS_V1_QA_UAT_EDGE_SERVER_SIDE_HARD_STOP=PASS'

[[ "$(psql_db "$DB" -qAt -c "
  SELECT (wos_v1_qa_uat.closer_status(
    '$UAT_CLOSER_EXECUTION_ID'::uuid
  )->>'openGateCount')='0'
    AND (wos_v1_qa_uat.closer_status(
      '$UAT_CLOSER_EXECUTION_ID'::uuid
    )->>'m2AuthenticatedExecute')='false'
    AND (wos_v1_qa_uat.closer_status(
      '$UAT_CLOSER_EXECUTION_ID'::uuid
    )->>'releaseAuthenticatedExecute')='false';
")" = 't' ]] || fail 'CLOSER_ACL_OR_GATE_CLOSE_INCOMPLETE'
echo 'WOS_V1_QA_UAT_CLOSER_ACL_AND_GATE_CLOSE=PASS'

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-production-m2-qa-uat-closed-gate-assertion.sql"

WOS_QA_PSQL_DOCKER_CONTAINER="$CONTAINER" \
WOS_QA_DATABASE="$DB" \
WOS_V1_QA_EXECUTION_ID="$UAT_CLOSER_EXECUTION_ID" \
  node "$ROOT/scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs" recover \
  || fail 'DB_CLOSER_DATA_RETAINING_RECOVERY_FAILED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT NOT EXISTS (
      SELECT 1
      FROM (VALUES
        ('public.wos_create_production_order(uuid,jsonb)'::regprocedure),
        ('public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure),
        ('public.wos_confirm_office_completeness(uuid,integer,text,text)'::regprocedure),
        ('public.wos_submit_production_order(uuid,integer,text,uuid)'::regprocedure),
        ('public.wos_operator_order_action(uuid,integer,uuid,text,text)'::regprocedure),
        ('public.wos_office_save_correction(uuid,integer,uuid,jsonb,text)'::regprocedure),
        ('public.wos_office_resubmit_order(uuid,integer,uuid,text)'::regprocedure),
        ('public.wos_operator_review_correction(uuid,integer,uuid,text)'::regprocedure)
      ) functions(procedure)
      WHERE has_function_privilege('anon',procedure,'EXECUTE')
        OR has_function_privilege('authenticated',procedure,'EXECUTE')
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'SELECT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'INSERT'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'UPDATE'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.wos_office_revisions', 'DELETE'
    );
")" = 't' ]] || fail 'QA_APP_PERMISSIONS_NOT_REVOKED'
echo 'WOS_V1_QA_UAT_APP_DEACTIVATION=PASS'

[[ "$(psql_db "$DB" -qAt -c "
  SELECT (SELECT count(*) FROM wos_v1_qa_uat.write_gates)=4
    AND (SELECT count(*) FROM wos_v1_qa_uat.write_gates WHERE state='OPEN')=0
    AND (SELECT count(*) FROM wos_v1_qa_uat.closeout_controls)=1
    AND (SELECT count(*) FROM wos_v1_qa_uat.closer_arm_receipts)=2
    AND (SELECT count(*) FROM wos_v1_qa_uat.closer_close_receipts)=2
    AND to_regprocedure(
      'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_edge_write_allowed(text,text,uuid,uuid,uuid,uuid,uuid)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_edge_record_proof(uuid,uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_bind_order(uuid,uuid,uuid,uuid,uuid,text)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_edge_preflight(uuid,uuid,uuid)'
    ) IS NULL
    AND (SELECT count(*) FROM public.wos_v1_m2_receipts)=12
    AND (SELECT count(*) FROM public.wos_v1_start_releases)=2
")" = 't' ]] || fail 'QA_UAT_CLOSE_OR_DATA_RETENTION_FAILED'

[[ "$(psql_db "$DB" -qAt -c "
  SELECT md5(jsonb_agg(jsonb_build_object(
    'id',id,'bucket',bucket_id,'name',name,'version',version,'updated',updated_at)
    ORDER BY id)::text)
  FROM storage.objects
")" = "$HISTORICAL_STORAGE_BEFORE" ]] || fail 'STORAGE_OBJECT_FINGERPRINT_CHANGED'
[[ "$(flow_proof_fingerprint)" = "$FLOW_PROOFS_AFTER" ]] \
  || fail 'PROOF_FINGERPRINT_CHANGED_DURING_RECOVERY'
[[ "$(flow_business_fingerprint)" = "$FLOW_BUSINESS_AFTER" ]] \
  || fail 'BUSINESS_FINGERPRINT_CHANGED_DURING_RECOVERY'

[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_reference_images
")" = "$HISTORICAL_IMAGE_COUNT_BEFORE" ]] || fail 'HISTORICAL_IMAGE_COUNT_CHANGED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_verified_image_proofs
")" = "$HISTORICAL_PROOFS_COUNT_BEFORE" ]] || fail 'HISTORICAL_PROOF_COUNT_CHANGED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_visual_baseline_items
  WHERE baseline_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
")" = '4' ]] || fail 'HISTORICAL_BASELINE_ITEMS_LOST'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT image_status FROM public.wos_reference_images
  WHERE id='41111111-1111-4111-8111-111111111111'
")" = 'READY' ]] || fail 'IMAGE_STATUS_NOT_RESTORED'

{
  printf "SET wos_v1.production_m2_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(psql_db "$DB" -qAt -c "
  SELECT to_regprocedure(
      'public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)'
    ) IS NULL
    AND (SELECT count(*) FROM public.wos_v1_m2_receipts)=12
    AND (SELECT count(*) FROM public.wos_v1_start_releases)=2
    AND (SELECT count(*) FROM wos_v1_qa_uat.write_gates)=4
")" = 't' ]] || fail 'PRODUCTION_M2_ROLLBACK_DID_NOT_RETAIN_DATA'
[[ "$(flow_business_fingerprint)" = "$FLOW_BUSINESS_AFTER" ]] \
  || fail 'BUSINESS_FINGERPRINT_CHANGED_AFTER_PRODUCTION_M2_ROLLBACK'

echo 'WOS_V1_PRODUCTION_M2_QA_UAT_WRAPPER=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_UAT_NEGATIVE_GATES=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_UAT_FULL_FLOW=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_UAT_INVALIDATION=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_UAT_INDEPENDENT_CLOSE_LOCK=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_UAT_DATA_RETAINING_RECOVERY=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_UAT_NO_CLOUD_CONNECTION=PASS'
