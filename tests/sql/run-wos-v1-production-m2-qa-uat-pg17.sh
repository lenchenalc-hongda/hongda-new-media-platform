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
[[ "$(qa_shape_history_fingerprint)" = "$QA_SHAPE_HISTORY_BEFORE" ]] \
  || fail 'QA_SHAPE_RECOVERY_CHANGED_HISTORICAL_ROWS'
echo 'WOS_V1_PRODUCTION_M2_QA_SHAPE_COMPAT=PASS'
echo 'WOS_V1_PRODUCTION_M2_QA_SHAPE_ACL_STORAGE_RETENTION=PASS'

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$DB\""
psql_db "$DB" -q < "$ROOT/tests/sql/wos-v1-production-m2-pg17-fixture.sql"
psql_db "$DB" -q -c "
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

UAT_INPUTS="$ROOT/docs/workshop-order-system/qa-fixture/production-m2-uat-20261126/inputs.json"
CREATE_PAYLOAD_JSON="$(jq -c '.createPayload' "$UAT_INPUTS")"
EXPECTED_CREATE_FP="$(jq -r '.createPayloadFingerprint' "$UAT_INPUTS")"
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
echo 'WOS_V1_QA_UAT_MANAGER_BINDING=PASS'

psql_db "$DB" -q -c "
  UPDATE public.wos_production_orders
  SET order_number='QA-NONPROD-WOS-M2-UAT-001'
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

psql_db "$DB" -q -c "
  INSERT INTO wos_v1_qa_uat.write_gates(
    authorization_id,project_ref,organization_id,order_id,actor_profile_id,
    allowed_actions,opened_at,expires_at
  ) VALUES(
    'WOS-V1-PRODUCTION-M2-QA-UAT-001-EXPIRED',
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
    'WOS-V1-PRODUCTION-M2-QA-UAT-001',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    ARRAY['BASELINE_SELECT','BASELINE_OFFICE_CONFIRM'],
    clock_timestamp()+interval '14 minutes'
  );
  SELECT public.wos_v1_qa_uat_open_gate(
    'WOS-V1-PRODUCTION-M2-QA-UAT-001',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    ARRAY['MATERIAL_RECORD','BASELINE_WORKSHOP_CONFIRM','FINAL_READINESS_CONFIRM'],
    clock_timestamp()+interval '14 minutes'
  );
  SELECT public.wos_v1_qa_uat_open_gate(
    'WOS-V1-PRODUCTION-M2-QA-UAT-001',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '$UAT_MANAGER_PROFILE',
    ARRAY['START_RELEASE'],
    clock_timestamp()+interval '14 minutes'
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
docker exec "$CONTAINER" rm -f "$LOCK_MARKER" >/dev/null 2>&1 || true
(
  psql_db "$DB" -qAt <<SQL >/dev/null
    BEGIN;
    SELECT 1 FROM wos_v1_qa_uat.write_gates
    WHERE state='OPEN'
    ORDER BY gate_id
    LIMIT 1
    FOR SHARE;
    \! touch '$LOCK_MARKER'
    SELECT pg_sleep(3);
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
psql_db "$DB" -qAt -c "
  UPDATE wos_v1_qa_uat.write_gates
  SET state='CLOSED',closed_at=clock_timestamp()
  WHERE project_ref='xulmpqaknlwqqculbsek'
    AND state='OPEN';
" >/dev/null
CLOSE_FINISHED_EPOCH="$(date +%s)"
wait "$CLOSE_HOLDER_PID"
CLOSE_ELAPSED_SECONDS="$((CLOSE_FINISHED_EPOCH-CLOSE_STARTED_EPOCH))"
[[ "$CLOSE_ELAPSED_SECONDS" -ge 1 ]] || fail 'INDEPENDENT_CLOSE_DID_NOT_WAIT_FOR_GATE_LOCK'

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-production-m2-qa-uat-closed-gate-assertion.sql"

{
  printf "SET wos_v1.qa_uat_close_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_DEACTIVATE_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

{
  printf "SET wos_v1.qa_uat_rollback_authorized='yes';\n"
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(psql_db "$DB" -qAt -c "
  SELECT (SELECT count(*) FROM wos_v1_qa_uat.write_gates)=4
    AND (SELECT count(*) FROM wos_v1_qa_uat.write_gates WHERE state='OPEN')=0
    AND to_regprocedure(
      'public.wos_v1_qa_uat_m2_action(text,uuid,integer,uuid,text,jsonb)'
    ) IS NULL
    AND to_regprocedure(
      'public.wos_v1_qa_uat_authorize_production_start(text,uuid,integer,uuid,uuid,text)'
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
