#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
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
  local db="$1"
  local sql="$2"
  psql_run -qAt -d "$db" -c "$sql"
}

wait_for_lock() {
  local db="$1"
  local app="$2"
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if [[ "$(db_scalar "$db" "SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a USING(pid) WHERE a.application_name='$app' AND l.locktype='advisory' AND l.granted")" != "0" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

wait_for_block() {
  local db="$1"
  local app="$2"
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if [[ "$(db_scalar "$db" "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name='$app' AND wait_event_type='Lock'")" != "0" ]]; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

create_db() {
  local db="$1"
  if [[ -n "$CONTAINER" ]]; then
    docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
      -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null
    docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
      -c "CREATE DATABASE \"$db\"" >/dev/null
  else
    psql -X -v ON_ERROR_STOP=1 -d postgres \
      -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null
    psql -X -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"$db\"" >/dev/null
  fi
  psql_run -q -d "$db" < "$ROOT/tests/sql/wos-p2-m2-pg17-fixture.sql"
  psql_run -q -d "$db" < \
    "$ROOT/docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql"
  psql_run -q -d "$db" < \
    "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
  psql_run -q -d "$db" -c \
    "GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb) TO authenticated" \
    >/dev/null
}

seed_order() {
  local db="$1"
  local mode="$2"
  local order_id old_image new_image old_object new_object
  case "$mode" in
    REVISION_FIRST)
      order_id='88888888-8888-4888-8888-888888888888'
      old_image='81111111-1111-4111-8111-111111111111'
      new_image='82222222-2222-4222-8222-222222222222'
      old_object='71111111-1111-4111-8111-111111111111'
      new_object='72222222-2222-4222-8222-222222222222'
      ;;
    M2_FIRST)
      order_id='77777777-7777-4777-8777-777777777777'
      old_image='71111111-1111-4111-8111-111111111111'
      new_image='72222222-2222-4222-8222-222222222222'
      old_object='61111111-1111-4111-8111-111111111111'
      new_object='62222222-2222-4222-8222-222222222222'
      ;;
    PROOF_REFRESH_FIRST)
      order_id='66666666-6666-4666-8666-666666666666'
      old_image='61111111-1111-4111-8111-111111111111'
      new_image='62222222-2222-4222-8222-222222222222'
      old_object='41111111-1111-4111-8111-111111111111'
      new_object='42222222-2222-4222-8222-222222222222'
      ;;
    M2_PROOF_FIRST)
      order_id='55555555-5555-4555-8555-555555555555'
      old_image='51111111-1111-4111-8111-111111111111'
      new_image='52222222-2222-4222-8222-222222222222'
      old_object='31111111-1111-4111-8111-111111111111'
      new_object='32222222-2222-4222-8222-222222222222'
      ;;
  esac
  psql_run -q -d "$db" <<SQL
INSERT INTO public.wos_production_orders(
  id,organization_id,order_number,workflow_status,version,version_label,
  customer_name_snapshot,product_name,product_material,requested_quantity,
  current_batch_quantity,created_by_profile_id,sales_owner_profile_id)
VALUES(
  '$order_id','$ORG','QA-NONPROD-$mode','WAITING_MATERIAL',7,'QA-R6',
  'QA lock customer','QA lock product','PP',100,100,
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111');

INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path,file_name,mime_type,file_size,
  uploaded_by_profile_id)
VALUES(
  '$old_image','$ORG','PRODUCTION_ORDER','$order_id','FILM_PATTERN','QA-R6',
  'READY','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$old_image/qa-preview-proof.png',
  'qa-preview-proof.png','image/png',100,
  '11111111-1111-4111-8111-111111111111');

INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES
 ('$old_object','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$old_image/qa-preview-proof.png',
  'old-v1',clock_timestamp(),'$OFFICE_USER',
  '{"mimetype":"image/png","size":"100"}',false),
 ('$new_object','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$new_image/qa-preview-proof.png',
  'new-v1',clock_timestamp(),'$OFFICE_USER',
  '{"mimetype":"image/png","size":"100"}',false);

UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_LOCK_ORDER_PG17',
    allowed_order_id='$order_id',allowed_organization_id='$ORG'
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE service_role;
SELECT public.wos_qa_p2_m2_record_trusted_proof(
  pg_catalog.gen_random_uuid(),'$order_id','$old_image','FILM_PATTERN',
  '$OFFICE_USER',7,
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$old_image/qa-preview-proof.png',
  '$old_object','old-v1',
  (SELECT updated_at FROM storage.objects WHERE id='$old_object'),
  repeat('a',64));
SELECT public.wos_qa_p2_m2_record_trusted_proof(
  pg_catalog.gen_random_uuid(),'$order_id','$new_image','FILM_PATTERN',
  '$OFFICE_USER',7,
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$new_image/qa-preview-proof.png',
  '$new_object','new-v1',
  (SELECT updated_at FROM storage.objects WHERE id='$new_object'),
  repeat('b',64));
RESET ROLE;
SQL
}

run_scenario() {
  local mode="$1"
  local db="$2"
  local app1="$3"
  local app2="$4"
  local order_id old_image new_image old_object new_object
  if [[ "$mode" = "REVISION_FIRST" ]]; then
    order_id='88888888-8888-4888-8888-888888888888'
    old_image='81111111-1111-4111-8111-111111111111'
    new_image='82222222-2222-4222-8222-222222222222'
    old_object='71111111-1111-4111-8111-111111111111'
    new_object='72222222-2222-4222-8222-222222222222'
  else
    order_id='77777777-7777-4777-8777-777777777777'
    old_image='71111111-1111-4111-8111-111111111111'
    new_image='72222222-2222-4222-8222-222222222222'
    old_object='61111111-1111-4111-8111-111111111111'
    new_object='62222222-2222-4222-8222-222222222222'
  fi
  local first second
  first="$(mktemp)"
  second="$(mktemp)"
  create_db "$db"
  seed_order "$db" "$mode"

  if [[ "$mode" = "REVISION_FIRST" ]]; then
    (
      psql_app "$app1" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OFFICE_USER',false);
SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.jsonb_build_object('phase','REVISION_APPLIED',
  'result',public.wos_register_qa_revision_image(
    '$order_id','$new_image','FILM_PATTERN',
    'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$new_image/qa-preview-proof.png'));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
    ) >"$first" 2>&1 &
  else
    (
      psql_app "$app1" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.jsonb_build_object('phase','M2_ACTION_APPLIED',
  'result',public.wos_qa_p2_m2_action(
    '$order_id',7,'66666666-6666-4666-8666-666666666666','MATERIAL_RECORD',
    jsonb_build_object(
      'productionVersionLabel','QA-R6',
      'note','M2 action holds the shared order lock before revision.',
      'resourceType','FILM','resourceStatus','ARRIVED',
      'arrivedAt',clock_timestamp(),'physicalCheckAttested',true)));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
    ) >"$first" 2>&1 &
  fi
  local p1=$!
  wait_for_lock "$db" "$app1" || { cat "$first"; echo 'first RPC did not acquire advisory lock' >&2; return 1; }

  if [[ "$mode" = "REVISION_FIRST" ]]; then
    (
      psql_app "$app2" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
SELECT pg_catalog.jsonb_build_object('phase','M2_ACTION_AFTER_WAIT',
  'result',public.wos_qa_p2_m2_action(
    '$order_id',7,'67777777-7777-4777-8777-777777777777','MATERIAL_RECORD',
    jsonb_build_object(
      'productionVersionLabel','QA-R6',
      'note','M2 action waits for revision and uses current CAS version.',
      'resourceType','FILM','resourceStatus','ARRIVED',
      'arrivedAt',clock_timestamp(),'physicalCheckAttested',true)));
SQL
    ) >"$second" 2>&1 &
  else
    (
      psql_app "$app2" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OFFICE_USER',false);
SET ROLE authenticated;
SELECT pg_catalog.jsonb_build_object('phase','REVISION_AFTER_WAIT',
  'result',public.wos_register_qa_revision_image(
    '$order_id','$new_image','FILM_PATTERN',
    'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$new_image/qa-preview-proof.png'));
SQL
    ) >"$second" 2>&1 &
  fi
  local p2=$!
  wait_for_block "$db" "$app2" || {
    cat "$first" "$second"
    echo 'second RPC did not block on the shared advisory lock' >&2
    return 1
  }
  wait "$p1"
  wait "$p2"
  if grep -q '40P01\|deadlock detected' "$first" "$second"; then
    cat "$first" "$second"
    return 1
  fi

  psql_run -q -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
DO \$\$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_m2_action(
      '$order_id',7,'68888888-8888-4888-8888-888888888888','MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','QA-R6',
        'note','Stale CAS after both ordered sessions must be rejected.',
        'resourceType','FILM','resourceStatus','ARRIVED',
        'arrivedAt',clock_timestamp(),'physicalCheckAttested',true));
    RAISE EXCEPTION 'STALE_CAS_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END \$\$;
RESET ROLE;
SQL

  test "$(db_scalar "$db" "SELECT workflow_status||':'||version FROM public.wos_production_orders WHERE id='$order_id'")" = 'WAITING_MATERIAL:8'
  test "$(db_scalar "$db" "SELECT image_status FROM public.wos_reference_images WHERE id='$old_image'")" = 'SUPERSEDED'
  test "$(db_scalar "$db" "SELECT image_status FROM public.wos_reference_images WHERE id='$new_image'")" = 'READY'
  test "$(db_scalar "$db" "SELECT supersedes_image_id FROM public.wos_reference_images WHERE id='$new_image'")" = "$old_image"
  test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_qa_p2_m2_receipts WHERE order_id='$order_id'")" = '1'
  test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_status_history WHERE entity_id='$order_id'")" = '1'

  psql_run -q -d "$db" -c \
    "UPDATE public.wos_qa_p2_m2_gate SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',allowed_order_id=NULL,allowed_organization_id=NULL WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES')" \
    >/dev/null
  echo "WOS_QA_REVISION_LOCK_ORDER_${mode}=PASS"
  rm -f "$first" "$second"
}

run_proof_scenario() {
  local mode="$1"
  local db="$2"
  local app1="$3"
  local app2="$4"
  local order_id old_image old_object proof_expected proof_request
  if [[ "$mode" = "PROOF_REFRESH_FIRST" ]]; then
    order_id='66666666-6666-4666-8666-666666666666'
    old_image='61111111-1111-4111-8111-111111111111'
    old_object='41111111-1111-4111-8111-111111111111'
    proof_expected=7
    proof_request='63000000-0000-4000-8000-000000000001'
  else
    order_id='55555555-5555-4555-8555-555555555555'
    old_image='51111111-1111-4111-8111-111111111111'
    old_object='31111111-1111-4111-8111-111111111111'
    proof_expected=8
    proof_request='63000000-0000-4000-8000-000000000002'
  fi
  local first second
  first="$(mktemp)"
  second="$(mktemp)"
  create_db "$db"
  seed_order "$db" "$mode"

  if [[ "$mode" = "PROOF_REFRESH_FIRST" ]]; then
    (
      psql_app "$app1" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OFFICE_USER',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
BEGIN;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_catalog.jsonb_build_object('phase','PROOF_REFRESH_APPLIED',
  'result',public.wos_qa_p2_m2_record_trusted_proof(
    '$proof_request','$order_id','$old_image','FILM_PATTERN',
    '$OFFICE_USER',$proof_expected,
    'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$old_image/qa-preview-proof.png',
    '$old_object','old-v1',
    (SELECT updated_at FROM storage.objects WHERE id='$old_object'),
    repeat('f',64)));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
    ) >"$first" 2>&1 &
  else
    (
      psql_app "$app1" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.jsonb_build_object('phase','M2_ACTION_APPLIED',
  'result',public.wos_qa_p2_m2_action(
    '$order_id',7,'65555555-5555-4555-8555-555555555555','MATERIAL_RECORD',
    jsonb_build_object(
      'productionVersionLabel','QA-R6',
      'note','M2 action holds the lock before trusted proof refresh.',
      'resourceType','FILM','resourceStatus','ARRIVED',
      'arrivedAt',clock_timestamp(),'physicalCheckAttested',true)));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
    ) >"$first" 2>&1 &
  fi
  local p1=$!
  wait_for_lock "$db" "$app1" || {
    cat "$first"
    echo 'first proof/M2 action did not acquire advisory lock' >&2
    return 1
  }

  if [[ "$mode" = "PROOF_REFRESH_FIRST" ]]; then
    (
      psql_app "$app2" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
SELECT pg_catalog.jsonb_build_object('phase','M2_ACTION_AFTER_PROOF',
  'result',public.wos_qa_p2_m2_action(
    '$order_id',7,'64444444-4444-4444-8444-444444444444','MATERIAL_RECORD',
    jsonb_build_object(
      'productionVersionLabel','QA-R6',
      'note','M2 action waits for proof refresh and obeys current CAS.',
      'resourceType','FILM','resourceStatus','ARRIVED',
      'arrivedAt',clock_timestamp(),'physicalCheckAttested',true)));
SQL
    ) >"$second" 2>&1 &
  else
    (
      psql_app "$app2" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OFFICE_USER',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_catalog.jsonb_build_object('phase','PROOF_REFRESH_AFTER_M2',
  'result',public.wos_qa_p2_m2_record_trusted_proof(
    '$proof_request','$order_id','$old_image','FILM_PATTERN',
    '$OFFICE_USER',$proof_expected,
    'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/$old_image/qa-preview-proof.png',
    '$old_object','old-v1',
    (SELECT updated_at FROM storage.objects WHERE id='$old_object'),
    repeat('f',64)));
SQL
    ) >"$second" 2>&1 &
  fi
  local p2=$!
  wait_for_block "$db" "$app2" || {
    cat "$first" "$second"
    echo 'second proof/M2 action did not block on advisory lock' >&2
    return 1
  }
  wait "$p1"
  wait "$p2"
  if grep -q '40P01\|deadlock detected' "$first" "$second"; then
    cat "$first" "$second"
    return 1
  fi

  psql_run -q -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
DO \$\$
BEGIN
  BEGIN
    PERFORM public.wos_qa_p2_m2_action(
      '$order_id',7,'63333333-3333-4333-8333-333333333333','MATERIAL_RECORD',
      jsonb_build_object(
        'productionVersionLabel','QA-R6',
        'note','Stale CAS after proof refresh ordering must be rejected.',
        'resourceType','FILM','resourceStatus','ARRIVED',
        'arrivedAt',clock_timestamp(),'physicalCheckAttested',true));
    RAISE EXCEPTION 'PROOF_STALE_CAS_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
END \$\$;
RESET ROLE;
SQL

  test "$(db_scalar "$db" "SELECT workflow_status||':'||version FROM public.wos_production_orders WHERE id='$order_id'")" = 'WAITING_MATERIAL:8'
  test "$(db_scalar "$db" "SELECT verified_sha256 FROM public.wos_qa_verified_image_proofs WHERE image_id='$old_image'")" = "$(printf 'f%.0s' {1..64})"
  test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_qa_p2_m2_receipts WHERE order_id='$order_id'")" = '1'
  test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_status_history WHERE entity_id='$order_id'")" = '1'
  psql_run -q -d "$db" -c \
    "UPDATE public.wos_qa_p2_m2_gate SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',allowed_order_id=NULL,allowed_organization_id=NULL WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES')" \
    >/dev/null
  echo "WOS_QA_PROOF_REFRESH_LOCK_ORDER_${mode}=PASS"
  rm -f "$first" "$second"
}

seed_final_order() {
  local db="$1"
  local mode="$2"
  local order_id='44444444-4444-4444-8444-444444444444'
  psql_run -q -d "$db" <<SQL
INSERT INTO public.wos_production_orders(
  id,organization_id,order_number,workflow_status,version,version_label,
  customer_name_snapshot,product_name,product_material,requested_quantity,
  current_batch_quantity,created_by_profile_id,sales_owner_profile_id)
VALUES(
  '$order_id','$ORG','QA-NONPROD-$mode','WAITING_MATERIAL',10,'QA-R6',
  'QA final lock customer','QA final lock product','PP',100,100,
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111');

INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,version_label,
  image_status,storage_bucket,storage_path,file_name,mime_type,file_size,
  uploaded_by_profile_id)
VALUES
 ('a1111111-1111-4111-8111-111111111111','$ORG','PRODUCTION_ORDER',
  '$order_id','PRODUCT','QA-R6','READY','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/product/versions/QA-R6/a1111111-1111-4111-8111-111111111111/qa-preview-proof.png',
  'qa-preview-proof.png','image/png',100,'11111111-1111-4111-8111-111111111111'),
 ('a2222222-2222-4222-8222-222222222222','$ORG','PRODUCTION_ORDER',
  '$order_id','FILM_PATTERN','QA-R6','READY','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/a2222222-2222-4222-8222-222222222222/qa-preview-proof.png',
  'qa-preview-proof.png','image/png',100,'11111111-1111-4111-8111-111111111111'),
 ('a3333333-3333-4333-8333-333333333333','$ORG','PRODUCTION_ORDER',
  '$order_id','CUSTOMER_APPROVED_SAMPLE','QA-R6','READY','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/customer-approved-sample/versions/QA-R6/a3333333-3333-4333-8333-333333333333/qa-preview-proof.png',
  'qa-preview-proof.png','image/png',100,'11111111-1111-4111-8111-111111111111'),
 ('a4444444-4444-4444-8444-444444444444','$ORG','PRODUCTION_ORDER',
  '$order_id','SIGNED_SAMPLE','QA-R6','READY','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/signed-sample/versions/QA-R6/a4444444-4444-4444-8444-444444444444/qa-preview-proof.png',
  'qa-preview-proof.png','image/png',100,'11111111-1111-4111-8111-111111111111');

INSERT INTO storage.objects(
  id,bucket_id,name,version,updated_at,owner_id,metadata,is_delete_marker)
VALUES
 ('b1111111-1111-4111-8111-111111111111','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/product/versions/QA-R6/a1111111-1111-4111-8111-111111111111/qa-preview-proof.png',
  'v1',clock_timestamp(),'$OFFICE_USER','{"mimetype":"image/png","size":"100"}',false),
 ('b2222222-2222-4222-8222-222222222222','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/a2222222-2222-4222-8222-222222222222/qa-preview-proof.png',
  'v1',clock_timestamp(),'$OFFICE_USER','{"mimetype":"image/png","size":"100"}',false),
 ('b3333333-3333-4333-8333-333333333333','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/customer-approved-sample/versions/QA-R6/a3333333-3333-4333-8333-333333333333/qa-preview-proof.png',
  'v1',clock_timestamp(),'$OFFICE_USER','{"mimetype":"image/png","size":"100"}',false),
 ('b4444444-4444-4444-8444-444444444444','wos-private',
  'organizations/$ORG/wos/production-order/$order_id/images/signed-sample/versions/QA-R6/a4444444-4444-4444-8444-444444444444/qa-preview-proof.png',
  'v1',clock_timestamp(),'$OFFICE_USER','{"mimetype":"image/png","size":"100"}',false);

UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_FINAL_PROOF_LOCK',
    allowed_order_id='$order_id',allowed_organization_id='$ORG'
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');

SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE service_role;
SELECT public.wos_qa_p2_m2_record_trusted_proof(
  pg_catalog.gen_random_uuid(),'$order_id',
  'a1111111-1111-4111-8111-111111111111','PRODUCT','$OFFICE_USER',10,
  'organizations/$ORG/wos/production-order/$order_id/images/product/versions/QA-R6/a1111111-1111-4111-8111-111111111111/qa-preview-proof.png',
  'b1111111-1111-4111-8111-111111111111','v1',
  (SELECT updated_at FROM storage.objects WHERE id='b1111111-1111-4111-8111-111111111111'),
  repeat('1',64));
SELECT public.wos_qa_p2_m2_record_trusted_proof(
  pg_catalog.gen_random_uuid(),'$order_id',
  'a2222222-2222-4222-8222-222222222222','FILM_PATTERN','$OFFICE_USER',10,
  'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/a2222222-2222-4222-8222-222222222222/qa-preview-proof.png',
  'b2222222-2222-4222-8222-222222222222','v1',
  (SELECT updated_at FROM storage.objects WHERE id='b2222222-2222-4222-8222-222222222222'),
  repeat('2',64));
SELECT public.wos_qa_p2_m2_record_trusted_proof(
  pg_catalog.gen_random_uuid(),'$order_id',
  'a3333333-3333-4333-8333-333333333333','CUSTOMER_APPROVED_SAMPLE','$OFFICE_USER',10,
  'organizations/$ORG/wos/production-order/$order_id/images/customer-approved-sample/versions/QA-R6/a3333333-3333-4333-8333-333333333333/qa-preview-proof.png',
  'b3333333-3333-4333-8333-333333333333','v1',
  (SELECT updated_at FROM storage.objects WHERE id='b3333333-3333-4333-8333-333333333333'),
  repeat('3',64));
SELECT public.wos_qa_p2_m2_record_trusted_proof(
  pg_catalog.gen_random_uuid(),'$order_id',
  'a4444444-4444-4444-8444-444444444444','SIGNED_SAMPLE','$OFFICE_USER',10,
  'organizations/$ORG/wos/production-order/$order_id/images/signed-sample/versions/QA-R6/a4444444-4444-4444-8444-444444444444/qa-preview-proof.png',
  'b4444444-4444-4444-8444-444444444444','v1',
  (SELECT updated_at FROM storage.objects WHERE id='b4444444-4444-4444-8444-444444444444'),
  repeat('4',64));
RESET ROLE;

INSERT INTO public.wos_visual_baselines(
  id,organization_id,entity_type,entity_id,version_label,status,
  confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,
  office_confirmed_at,workshop_confirmed_at,superseded_at)
VALUES(
  'c1111111-1111-4111-8111-111111111111','$ORG','PRODUCTION_ORDER',
  '$order_id','QA-R6','DRAFT',NULL,NULL,NULL,NULL,NULL);
INSERT INTO public.wos_visual_baseline_items(
  baseline_id,reference_image_id,display_order,is_required)
VALUES
 ('c1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',0,true),
 ('c1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222',1,true),
 ('c1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333',2,true),
 ('c1111111-1111-4111-8111-111111111111','a4444444-4444-4444-8444-444444444444',3,true);
DO \$seed_final\$
DECLARE v_digest text;
BEGIN
 SELECT proof_digest INTO v_digest
 FROM public.wos_qa_p2_m2_checked_proof_set(
   '$order_id','$ORG','c1111111-1111-4111-8111-111111111111','QA-R6');
 UPDATE public.wos_visual_baselines
 SET status='CURRENT',confirmed_by_office_profile_id=
   '11111111-1111-4111-8111-111111111111',
   confirmed_by_workshop_profile_id='33333333-3333-4333-8333-333333333333',
   office_confirmed_at=clock_timestamp(),
   workshop_confirmed_at=clock_timestamp()+interval '1 second',
   office_proof_set_digest=v_digest,workshop_proof_set_digest=v_digest,
   office_post_order_version=9,workshop_post_order_version=10
 WHERE id='c1111111-1111-4111-8111-111111111111';
END \$seed_final\$;
SQL
}

run_final_proof_scenario() {
  local mode="$1"
  local db="$2"
  local app1="$3"
  local app2="$4"
  local order_id='44444444-4444-4444-8444-444444444444'
  local first second
  first="$(mktemp)"
  second="$(mktemp)"
  create_db "$db"
  seed_final_order "$db" "$mode"

  if [[ "$mode" = "FINAL_FIRST" ]]; then
    (
      psql_app "$app1" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.jsonb_build_object('phase','FINAL_APPLIED',
  'result',public.wos_qa_p2_m2_action(
    '$order_id',10,'62000000-0000-4000-8000-000000000001',
    'FINAL_READINESS_CONFIRM',jsonb_build_object(
      'productionVersionLabel','QA-R6',
      'note','Final readiness holds the shared lock before proof refresh.',
      'baselineId','c1111111-1111-4111-8111-111111111111',
      'physicalCheckAttested',true,
      'filmArrivedAt',clock_timestamp()-interval '4 minutes',
      'fixtureArrivedAt',clock_timestamp()-interval '3 minutes',
      'incomingArrivedAt',clock_timestamp()-interval '2 minutes',
      'signedSampleArrivedAt',clock_timestamp()-interval '1 minute',
      'quantityExpected',100,'quantityArrived',100)));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
    ) >"$first" 2>&1 &
  else
    (
      psql_app "$app1" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE service_role;
BEGIN;
SELECT pg_catalog.jsonb_build_object('phase','PROOF_REFRESH_APPLIED',
  'result',public.wos_qa_p2_m2_record_trusted_proof(
    '62000000-0000-4000-8000-000000000002',
    '$order_id','a2222222-2222-4222-8222-222222222222','FILM_PATTERN',
    '$OFFICE_USER',10,
    'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/a2222222-2222-4222-8222-222222222222/qa-preview-proof.png',
    'b2222222-2222-4222-8222-222222222222','v1',
    (SELECT updated_at FROM storage.objects WHERE id='b2222222-2222-4222-8222-222222222222'),
    repeat('f',64)));
SELECT pg_catalog.pg_sleep(1.5);
COMMIT;
SQL
    ) >"$first" 2>&1 &
  fi
  local p1=$!
  wait_for_lock "$db" "$app1" || {
    cat "$first"
    echo 'first final/proof RPC did not acquire advisory lock' >&2
    return 1
  }

  if [[ "$mode" = "FINAL_FIRST" ]]; then
    (
      psql_app "$app2" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE service_role;
SELECT pg_catalog.jsonb_build_object('phase','PROOF_REFRESH_AFTER_FINAL',
  'result',public.wos_qa_p2_m2_record_trusted_proof(
    '62000000-0000-4000-8000-000000000003',
    '$order_id','a2222222-2222-4222-8222-222222222222','FILM_PATTERN',
    '$OFFICE_USER',11,
    'organizations/$ORG/wos/production-order/$order_id/images/film-pattern/versions/QA-R6/a2222222-2222-4222-8222-222222222222/qa-preview-proof.png',
    'b2222222-2222-4222-8222-222222222222','v1',
    (SELECT updated_at FROM storage.objects WHERE id='b2222222-2222-4222-8222-222222222222'),
    repeat('f',64)));
SQL
    ) >"$second" 2>&1 &
  else
    (
      psql_app "$app2" -qAt -d "$db" <<SQL
SELECT set_config('request.jwt.claim.sub','$OPERATOR_USER',false);
SET ROLE authenticated;
DO \$\$
BEGIN
 BEGIN
  PERFORM public.wos_qa_p2_m2_action(
    '$order_id',10,'62000000-0000-4000-8000-000000000004',
    'FINAL_READINESS_CONFIRM',jsonb_build_object(
      'productionVersionLabel','QA-R6',
      'note','Final readiness must fail after proof invalidation changed version.',
      'baselineId','c1111111-1111-4111-8111-111111111111',
      'physicalCheckAttested',true,
      'filmArrivedAt',clock_timestamp()-interval '4 minutes',
      'fixtureArrivedAt',clock_timestamp()-interval '3 minutes',
      'incomingArrivedAt',clock_timestamp()-interval '2 minutes',
      'signedSampleArrivedAt',clock_timestamp()-interval '1 minute',
      'quantityExpected',100,'quantityArrived',100));
  RAISE EXCEPTION 'STALE_FINAL_AFTER_PROOF_WAS_ACCEPTED';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  RAISE NOTICE 'FINAL_AFTER_PROOF=DENIED';
 END;
END \$\$;
SQL
    ) >"$second" 2>&1 &
  fi
  local p2=$!
  wait_for_block "$db" "$app2" || {
    cat "$first" "$second"
    echo 'second final/proof RPC did not block on advisory lock' >&2
    return 1
  }
  wait "$p1"
  wait "$p2"
  if grep -q '40P01\|deadlock detected' "$first" "$second"; then
    cat "$first" "$second"
    return 1
  fi

  if [[ "$mode" = "FINAL_FIRST" ]]; then
    test "$(db_scalar "$db" "SELECT workflow_status||':'||version FROM public.wos_production_orders WHERE id='$order_id'")" = 'WAITING_MATERIAL:12'
  else
    test "$(db_scalar "$db" "SELECT workflow_status||':'||version FROM public.wos_production_orders WHERE id='$order_id'")" = 'WAITING_MATERIAL:10'
  fi
  test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_visual_baselines WHERE id='c1111111-1111-4111-8111-111111111111' AND (confirmed_by_office_profile_id IS NOT NULL OR confirmed_by_workshop_profile_id IS NOT NULL OR office_proof_set_digest IS NOT NULL OR workshop_proof_set_digest IS NOT NULL)")" = '0'
  test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_qa_trusted_proof_receipts WHERE order_id='$order_id'")" = '5'
  if [[ "$mode" = "FINAL_FIRST" ]]; then
    test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_qa_p2_m2_receipts WHERE order_id='$order_id'")" = '1'
    test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_resource_readiness WHERE entity_id='$order_id' AND status='VERSION_VERIFIED'")" = '0'
  else
    test "$(db_scalar "$db" "SELECT count(*) FROM public.wos_qa_p2_m2_receipts WHERE order_id='$order_id'")" = '0'
  fi
  psql_run -q -d "$db" -c \
    "UPDATE public.wos_qa_p2_m2_gate SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',allowed_order_id=NULL,allowed_organization_id=NULL WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES')" \
    >/dev/null
  echo "WOS_FINAL_READINESS_VS_PROOF_REFRESH_${mode}=PASS"
  rm -f "$first" "$second"
}

run_scenario REVISION_FIRST wos_revision_first wos-revision-first wos-m2-after-revision
run_scenario M2_FIRST wos_m2_first wos-m2-first wos-revision-after-m2
run_proof_scenario PROOF_REFRESH_FIRST wos_proof_first wos-proof-first wos-m2-after-proof
run_proof_scenario M2_PROOF_FIRST wos_m2_proof_first wos-m2-proof-first wos-proof-after-m2
run_final_proof_scenario FINAL_FIRST wos_final_first wos-final-first wos-proof-after-final
run_final_proof_scenario PROOF_FIRST wos_proof_first_final wos-proof-first-final wos-final-after-proof

echo 'WOS_QA_REVISION_LOCK_ORDER_NO_DEADLOCK=PASS'
echo 'WOS_QA_REVISION_LOCK_ORDER_NO_CAS_BYPASS=PASS'
echo 'WOS_QA_REVISION_LOCK_ORDER_NO_CLOUD_QA_CONNECTION=PASS'
