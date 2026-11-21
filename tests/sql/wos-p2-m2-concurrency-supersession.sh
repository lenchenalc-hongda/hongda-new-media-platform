#!/usr/bin/env bash
set -euo pipefail

# Ephemeral PostgreSQL 17 only. Set WOS_PG_DOCKER_CONTAINER for a disposable
# container, or PG* variables for a local PostgreSQL instance.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${WOS_PG_DATABASE:-wos_m2_concurrency}"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
ORDER='33333333-3333-4333-8333-333333333333'
ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OFFICE_USER='10101010-1010-4010-8010-101010101010'
OPERATOR_USER='20202020-2020-4020-8020-202020202020'

psql_run() {
  if [[ -n "$CONTAINER" ]]; then
    docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
  else
    psql -X -v ON_ERROR_STOP=1 "$@"
  fi
}

psql_app() {
  local app="$1"
  shift
  if [[ -n "$CONTAINER" ]]; then
    docker exec -e PGAPPNAME="$app" -i "$CONTAINER" \
      psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
  else
    PGAPPNAME="$app" psql -X -v ON_ERROR_STOP=1 "$@"
  fi
}

db_scalar() {
  psql_run -qAt -d "$DB" -c "$1"
}

wait_for_application_lock() {
  local app="$1"
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if [[ "$(db_scalar "SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a USING(pid) WHERE a.application_name='$app' AND l.locktype='advisory' AND l.granted")" != "0" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

wait_for_application_block() {
  local app="$1"
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if [[ "$(db_scalar "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='$app' AND wait_event_type='Lock'")" != "0" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

seed_state() {
  local state="$1"
  psql_run -q -d "$DB" <<SQL
TRUNCATE public.wos_visual_baseline_items,
  public.wos_visual_baselines,
  public.wos_qa_p2_m2_receipts,
  public.wos_qa_p2_action_receipts,
  public.wos_status_history,
  public.wos_resource_readiness,
  public.wos_reference_images,
  public.wos_qa_verified_image_proofs,
  public.wos_blockers,
  public.wos_confirmations,
  storage.objects;

UPDATE public.wos_production_orders
SET workflow_status='WAITING_MATERIAL',
    version=CASE '$state'
      WHEN 'OFFICE_SIGNING' THEN 7
      WHEN 'WORKSHOP_SIGNING' THEN 9
      WHEN 'FINAL_READINESS' THEN 10
      ELSE NULL END,
    version_label='V1',
    updated_at=clock_timestamp()
WHERE id='$ORDER' AND organization_id='$ORG';

INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path)
VALUES
 ('41111111-1111-4111-8111-111111111111','$ORG','PRODUCTION_ORDER','$ORDER',
  'PRODUCT','V1','READY','wos-private','organizations/qa/product.png'),
 ('42222222-2222-4222-8222-222222222222','$ORG','PRODUCTION_ORDER','$ORDER',
  'FILM_PATTERN','V1','READY','wos-private','organizations/qa/film.png'),
 ('43333333-3333-4333-8333-333333333333','$ORG','PRODUCTION_ORDER','$ORDER',
  'SIGNED_SAMPLE','V1','READY','wos-private','organizations/qa/signed.png'),
 ('44444444-4444-4444-8444-444444444444','$ORG','PRODUCTION_ORDER','$ORDER',
  'CUSTOMER_APPROVED_SAMPLE','V1','READY','wos-private',
  'organizations/qa/customer.png');

INSERT INTO storage.objects(id,bucket_id,name,version,updated_at,is_delete_marker)
VALUES
 ('51111111-1111-4111-8111-111111111111','wos-private',
  'organizations/qa/product.png','v1',now(),false),
 ('52222222-2222-4222-8222-222222222222','wos-private',
  'organizations/qa/film.png','v1',now(),false),
 ('53333333-3333-4333-8333-333333333333','wos-private',
  'organizations/qa/signed.png','v1',now(),false),
 ('54444444-4444-4444-8444-444444444444','wos-private',
  'organizations/qa/customer.png','v1',now(),false);

INSERT INTO public.wos_qa_verified_image_proofs(
  image_id,organization_id,order_id,storage_bucket,storage_path,
  storage_object_id,storage_object_version,storage_object_updated_at,
  verified_sha256,verified_at,expires_at)
SELECT im.id,im.organization_id,im.entity_id,im.storage_bucket,im.storage_path,
  ob.id,ob.version,ob.updated_at,
  encode(sha256(convert_to(im.id::text,'UTF8')),'hex'),
  now()-interval '1 hour',now()+interval '1 hour'
FROM public.wos_reference_images im
JOIN storage.objects ob ON ob.name=im.storage_path;

DO \$seed\$
DECLARE
  baseline uuid:=pg_catalog.gen_random_uuid();
  proof text;
BEGIN
  INSERT INTO public.wos_visual_baselines(
    id,organization_id,entity_type,entity_id,version_label,status)
  VALUES(baseline,'$ORG','PRODUCTION_ORDER','$ORDER','V1','DRAFT');
  INSERT INTO public.wos_visual_baseline_items(
    baseline_id,reference_image_id,display_order,is_required)
  VALUES
   (baseline,'41111111-1111-4111-8111-111111111111',0,true),
   (baseline,'42222222-2222-4222-8222-222222222222',1,true),
   (baseline,'43333333-3333-4333-8333-333333333333',2,true),
   (baseline,'44444444-4444-4444-8444-444444444444',3,true);
  SELECT proof_digest INTO proof
  FROM public.wos_qa_p2_m2_checked_proof_set('$ORDER','$ORG',baseline,'V1');
  UPDATE public.wos_visual_baselines
  SET status=CASE WHEN '$state'='OFFICE_SIGNING' THEN 'DRAFT' ELSE 'CURRENT' END,
      confirmed_by_office_profile_id=CASE WHEN '$state' IN
        ('WORKSHOP_SIGNING','FINAL_READINESS') THEN
        '11111111-1111-4111-8111-111111111111'::uuid ELSE NULL END,
      office_confirmed_at=CASE WHEN '$state' IN
        ('WORKSHOP_SIGNING','FINAL_READINESS') THEN
        clock_timestamp()-interval '20 minutes' ELSE NULL END,
      office_proof_set_digest=CASE WHEN '$state' IN
        ('WORKSHOP_SIGNING','FINAL_READINESS') THEN proof ELSE NULL END,
      office_post_order_version=CASE WHEN '$state' IN
        ('WORKSHOP_SIGNING','FINAL_READINESS') THEN 9 ELSE NULL END,
      confirmed_by_workshop_profile_id=CASE WHEN '$state'='FINAL_READINESS'
        THEN '22222222-2222-4222-8222-222222222222'::uuid ELSE NULL END,
      workshop_confirmed_at=CASE WHEN '$state'='FINAL_READINESS'
        THEN clock_timestamp()-interval '10 minutes' ELSE NULL END,
      workshop_proof_set_digest=CASE WHEN '$state'='FINAL_READINESS'
        THEN proof ELSE NULL END,
      workshop_post_order_version=CASE WHEN '$state'='FINAL_READINESS'
        THEN 10 ELSE NULL END
  WHERE id=baseline;
END
\$seed\$;

UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_CONCURRENCY_PG17_ONLY',
    allowed_order_id='$ORDER',
    allowed_organization_id='$ORG',
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');
SQL
}

start_signoff() {
  local state="$1"
  local app="$2"
  local out="$3"
  local action payload user
  case "$state" in
    OFFICE_SIGNING)
      action='BASELINE_OFFICE_CONFIRM'
      payload="jsonb_build_object('productionVersionLabel','V1','note','Office signoff concurrent supersession test.','baselineId',(SELECT id FROM public.wos_visual_baselines WHERE status='DRAFT'))"
      user="$OFFICE_USER"
      ;;
    WORKSHOP_SIGNING)
      action='BASELINE_WORKSHOP_CONFIRM'
      payload="jsonb_build_object('productionVersionLabel','V1','note','Workshop signoff concurrent supersession test.','baselineId',(SELECT id FROM public.wos_visual_baselines WHERE status='CURRENT'))"
      user="$OPERATOR_USER"
      ;;
    FINAL_READINESS)
      action='FINAL_READINESS_CONFIRM'
      payload="jsonb_build_object('productionVersionLabel','V1','note','Final readiness concurrent supersession test.','baselineId',(SELECT id FROM public.wos_visual_baselines WHERE status='CURRENT'),'physicalCheckAttested',true,'filmArrivedAt',clock_timestamp()-interval '10 minutes','fixtureArrivedAt',clock_timestamp()-interval '9 minutes','incomingArrivedAt',clock_timestamp()-interval '8 minutes','signedSampleArrivedAt',clock_timestamp()-interval '7 minutes','quantityExpected',100,'quantityArrived',110)"
      user="$OPERATOR_USER"
      ;;
  esac
  local expected
  case "$state" in
    OFFICE_SIGNING) expected=7 ;;
    WORKSHOP_SIGNING) expected=9 ;;
    FINAL_READINESS) expected=10 ;;
  esac
  (
    psql_app "$app" -qAt -d "$DB" <<SQL
SELECT set_config('request.jwt.claim.sub','$user',false);
SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('wos-qa-m2:$ORDER',0));
SELECT pg_catalog.jsonb_build_object('action_phase','SIGNOFF_APPLIED',
  'result',public.wos_qa_p2_m2_action('$ORDER',$expected,
    pg_catalog.gen_random_uuid(),'$action',$payload));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
  ) >"$out" 2>&1 &
  SIGNOFF_PID=$!
}

start_replacement() {
  local app="$1"
  local out="$2"
  (
    psql_app "$app" -qAt -d "$DB" <<SQL
SELECT set_config('request.jwt.claim.sub','$OFFICE_USER',false);
INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path,supersedes_image_id)
VALUES(
  '45555555-5555-4555-8555-555555555555','$ORG','PRODUCTION_ORDER','$ORDER',
  'FILM_PATTERN','V1','READY','wos-private',
  'organizations/qa/film-superseding.png',
  '42222222-2222-4222-8222-222222222222');
SELECT 'REPLACEMENT_INSERTED';
SQL
  ) >"$out" 2>&1 &
  REPLACEMENT_PID=$!
}

run_scenario() {
  local state="$1"
  local signoff_app="wos-signoff-$1"
  local replacement_app="wos-replacement-$1"
  local first second
  first="$(mktemp)"
  second="$(mktemp)"
  seed_state "$state"

  start_signoff "$state" "$signoff_app" "$first"
  wait_for_application_lock "$signoff_app" || {
    cat "$first"
    echo "signoff did not acquire advisory lock" >&2
    return 1
  }

  start_replacement "$replacement_app" "$second"
  wait_for_application_block "$replacement_app" || {
    cat "$first" "$second"
    echo "replacement insert did not block on PostgreSQL advisory lock" >&2
    return 1
  }

  wait "$SIGNOFF_PID"
  wait "$REPLACEMENT_PID"
  grep -q 'SIGNOFF_APPLIED' "$first"
  grep -q 'REPLACEMENT_INSERTED' "$second"

  local state_row signatures replacement
  state_row="$(db_scalar "SELECT workflow_status||':'||version FROM public.wos_production_orders WHERE id='$ORDER'")"
  signatures="$(db_scalar "SELECT count(*) FROM public.wos_visual_baselines WHERE entity_id='$ORDER' AND status='CURRENT' AND (confirmed_by_office_profile_id IS NOT NULL OR confirmed_by_workshop_profile_id IS NOT NULL OR office_proof_set_digest IS NOT NULL OR workshop_proof_set_digest IS NOT NULL)")"
  replacement="$(db_scalar "SELECT count(*) FROM public.wos_reference_images WHERE id='45555555-5555-4555-8555-555555555555' AND image_status='READY'")"
  test "$signatures" = "0"
  test "$replacement" = "1"

  case "$state" in
    OFFICE_SIGNING) test "$state_row" = 'WAITING_MATERIAL:8' ;;
    WORKSHOP_SIGNING) test "$state_row" = 'WAITING_MATERIAL:10' ;;
    FINAL_READINESS)
      test "$state_row" = 'WAITING_MATERIAL:12'
      test "$(db_scalar "SELECT count(*) FROM public.wos_status_history WHERE entity_id='$ORDER' AND reason_code='QA_M2_EVIDENCE_INVALIDATED'")" = "1"
      ;;
  esac
  echo "WOS_M2_CONCURRENT_SUPERSESSION_${state}=PASS"
  rm -f "$first" "$second"
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
GRANT_EXECUTE="GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb) TO authenticated"
psql_run -q -d "$DB" -c "$GRANT_EXECUTE"

run_scenario OFFICE_SIGNING
run_scenario WORKSHOP_SIGNING
run_scenario FINAL_READINESS

echo 'WOS_P2_M2_PG17_TWO_SESSION_LOCKS_AND_INVALIDATION=PASS'
echo 'WOS_P2_M2_PG17_NO_CLOUD_QA_CONNECTION=PASS'
