#!/usr/bin/env bash
set -euo pipefail

# Ephemeral PostgreSQL 17 regression for PR #270 P1/P2 review findings.
# Required: WOS_PG_DOCKER_CONTAINER names a local postgres:17-alpine container
# created with --network none and labels:
#   com.hongda.wos.disposable-pg17=true
#   com.hongda.wos.test-purpose=pr270-p1-p2-regression
# WOS_PG17_GUARD_CHECK_ONLY=1 verifies the isolation contract without DB writes.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
CONTAINER_ID=''
RUN_NAMESPACE="wos_pr270_${$}_"
DB_OWNER="WOS_PR270_REGRESSION:${RUN_NAMESPACE}"
CREATED_DBS=()

guard_fail() {
  printf 'WOS_PG17_GUARD_FAILED=%s\n' "$1" >&2
  exit 78
}

[[ -n "$CONTAINER" ]] || guard_fail 'WOS_PG_DOCKER_CONTAINER_REQUIRED'
[[ "$CONTAINER" =~ ^codex-wos-pr270-pg17-[A-Za-z0-9_.-]+$ ]] \
  || guard_fail 'CONTAINER_NAME_NOT_OWNED'
[[ -S /var/run/docker.sock ]] || guard_fail 'LOCAL_DOCKER_SOCKET_REQUIRED'
export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGOPTIONS
unset DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL

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
[[ "$(docker inspect --format '{{index .Config.Labels "com.hongda.wos.test-purpose"}}' "$CONTAINER_ID")" = 'pr270-p1-p2-regression' ]] \
  || guard_fail 'TEST_PURPOSE_LABEL_REQUIRED'

psql_run() {
  docker exec -i "$CONTAINER_ID" env -u PGHOST -u PGPORT -u PGUSER \
    -u PGPASSWORD -u PGDATABASE -u PGOPTIONS -u DATABASE_URL \
    -u DIRECT_URL -u SUPABASE_URL -u SUPABASE_DB_URL \
    psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
}

POSTGRES_SCOPE="$(psql_run -qAt -d postgres -c "
  SELECT (current_database()='postgres')
     AND (current_user='postgres')
     AND pg_catalog.inet_server_addr() IS NULL
     AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
")"
[[ "$POSTGRES_SCOPE" = 't' ]] || guard_fail 'POSTGRES_CONNECTION_SCOPE_INVALID'

if [[ "${WOS_PG17_GUARD_CHECK_ONLY:-}" = '1' ]]; then
  echo 'WOS_PG17_GUARD_PASS'
  exit 0
fi

cleanup_databases() {
  local rc=$?
  local db owner
  trap - EXIT INT TERM
  for db in "${CREATED_DBS[@]}"; do
    if [[ "$db" != "${RUN_NAMESPACE}"* ]] \
      || [[ ! "$db" =~ ^[a-z0-9_]+$ ]]; then
      echo "WOS_PG17_CLEANUP_REFUSED_INVALID_NAME=$db" >&2
      continue
    fi
    owner="$(psql_run -qAt -d postgres -c \
      "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='$db'" \
      2>/dev/null || true)"
    if [[ -n "$owner" && "$owner" != "$DB_OWNER" ]]; then
      echo "WOS_PG17_CLEANUP_REFUSED_NOT_OWNED=$db" >&2
      continue
    fi
    psql_run -q -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" \
      >/dev/null 2>&1 || true
  done
  exit "$rc"
}
trap cleanup_databases EXIT INT TERM

create_db() {
  local db="$1"
  [[ "$db" = "${RUN_NAMESPACE}"* ]] || guard_fail 'DATABASE_NAME_OUTSIDE_RUN_NAMESPACE'
  [[ "$db" =~ ^[a-z0-9_]+$ ]] || guard_fail 'DATABASE_NAME_INVALID'
  if [[ "$(psql_run -qAt -d postgres -c \
    "SELECT count(*) FROM pg_database WHERE datname='$db'")" != '0' ]]; then
    guard_fail 'DATABASE_NAMESPACE_ALREADY_EXISTS'
  fi
  psql_run -q -d postgres -c "CREATE DATABASE \"$db\"" >/dev/null
  CREATED_DBS+=("$db")
  psql_run -q -d postgres -c "COMMENT ON DATABASE \"$db\" IS '$DB_OWNER'" >/dev/null
  psql_run -q -d "$db" < "$ROOT/tests/sql/wos-p2-m2-pg17-fixture.sql"
  psql_run -q -d "$db" < \
    "$ROOT/docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql"
}

grant_and_open_m2_gate() {
  local db="$1" order_id="$2"
  psql_run -q -d "$db" <<SQL
GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)
  TO authenticated;
UPDATE public.wos_qa_p2_m2_gate
SET enabled=true,
    enabled_until=clock_timestamp()+interval '10 minutes',
    approval_reference='SYNTHETIC_PR270_REGRESSION',
    allowed_order_id='$order_id',
    allowed_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    updated_at=clock_timestamp()
WHERE gate_name IN ('M2_OFFICE_WRITES','M2_OPERATOR_WRITES');
SQL
}

# 1. Same-org Sales B is denied for baseline selection and office confirmation.
sales_db="${RUN_NAMESPACE}sales_scope"
create_db "$sales_db"
psql_run -q -d "$sales_db" <<'SQL'
INSERT INTO public.profiles(id,user_id,org_id,role,is_active) VALUES
 ('66666666-6666-4666-8666-666666666666',
  '60606060-6060-4060-8060-606060606060',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','sales',true),
 ('77777777-7777-4777-8777-777777777777',
  '70707070-7070-4070-8070-707070707070',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager',true),
 ('88888888-8888-4888-8888-888888888888',
  '80808080-8080-4080-8080-808080808080',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
SQL
grant_and_open_m2_gate "$sales_db" '33333333-3333-4333-8333-333333333333'

psql_run -q -d "$sales_db" <<'SQL'
SELECT set_config('request.jwt.claim.sub','60606060-6060-4060-8060-606060606060',false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.wos_qa_p2_m2_action(
   '33333333-3333-4333-8333-333333333333',7,
   '71000000-0000-4000-8000-000000000001','BASELINE_SELECT',
   jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Sales B must not select another owner baseline.',
    'imageIds',jsonb_build_array(
      '41111111-1111-4111-8111-111111111111',
      '42222222-2222-4222-8222-222222222222',
      '43333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444')));
  RAISE EXCEPTION 'SALES_B_BASELINE_SELECT_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT version FROM public.wos_production_orders
     WHERE id='33333333-3333-4333-8333-333333333333')<>7
   OR EXISTS (SELECT 1 FROM public.wos_visual_baselines)
   OR EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_receipts)
   OR EXISTS (SELECT 1 FROM public.wos_status_history) THEN
  RAISE EXCEPTION 'SALES_B_SELECT_CAUSED_SIDE_EFFECT';
 END IF;
END $$;
SQL

psql_run -q -d "$sales_db" <<'SQL'
SELECT set_config('request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',7,
  '71000000-0000-4000-8000-000000000002','BASELINE_SELECT',
  jsonb_build_object(
   'productionVersionLabel','V1',
   'note','Sales owner selects the exact four-category proof set.',
   'imageIds',jsonb_build_array(
     '41111111-1111-4111-8111-111111111111',
     '42222222-2222-4222-8222-222222222222',
     '43333333-3333-4333-8333-333333333333',
     '44444444-4444-4444-8444-444444444444')));
 IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>8 THEN
  RAISE EXCEPTION 'SALES_A_BASELINE_SELECT_FAILED: %',r;
 END IF;
END $$;
RESET ROLE;
SQL

psql_run -q -d "$sales_db" <<'SQL'
SELECT set_config('request.jwt.claim.sub','60606060-6060-4060-8060-606060606060',false);
SET ROLE authenticated;
DO $$
DECLARE baseline uuid;
BEGIN
 SELECT id INTO baseline FROM public.wos_visual_baselines
 WHERE entity_id='33333333-3333-4333-8333-333333333333' AND status='DRAFT';
 BEGIN
  PERFORM public.wos_qa_p2_m2_action(
   '33333333-3333-4333-8333-333333333333',8,
   '71000000-0000-4000-8000-000000000003','BASELINE_OFFICE_CONFIRM',
   jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Sales B must not sign another owner baseline.',
    'baselineId',baseline));
  RAISE EXCEPTION 'SALES_B_OFFICE_CONFIRM_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT version FROM public.wos_production_orders
     WHERE id='33333333-3333-4333-8333-333333333333')<>8
   OR (SELECT count(*) FROM public.wos_qa_p2_m2_receipts)<>1
   OR (SELECT count(*) FROM public.wos_status_history)<>1
   OR EXISTS (SELECT 1 FROM public.wos_visual_baselines
      WHERE entity_id='33333333-3333-4333-8333-333333333333'
        AND office_confirmed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'SALES_B_CONFIRM_CAUSED_SIDE_EFFECT';
 END IF;
END $$;
SQL

psql_run -q -d "$sales_db" <<'SQL'
SELECT set_config('request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb; baseline uuid;
BEGIN
 SELECT id INTO baseline FROM public.wos_visual_baselines
 WHERE entity_id='33333333-3333-4333-8333-333333333333' AND status='DRAFT';
 r:=public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',8,
  '71000000-0000-4000-8000-000000000004','BASELINE_OFFICE_CONFIRM',
  jsonb_build_object(
   'productionVersionLabel','V1',
   'note','Sales owner confirms the selected immutable proof set.',
   'baselineId',baseline));
 IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>9 THEN
  RAISE EXCEPTION 'SALES_A_OFFICE_CONFIRM_FAILED: %',r;
 END IF;
END $$;
RESET ROLE;
SQL

# Manager and Admin retain their authorized override paths.
psql_run -q -d "$sales_db" <<'SQL'
SELECT set_config('request.jwt.claim.sub','70707070-7070-4070-8070-707070707070',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',9,
  '71000000-0000-4000-8000-000000000005','BASELINE_SELECT',
  jsonb_build_object(
   'productionVersionLabel','V1',
   'note','Manager selects a replacement baseline for QA review.',
   'imageIds',jsonb_build_array(
     '41111111-1111-4111-8111-111111111111',
     '42222222-2222-4222-8222-222222222222',
     '43333333-3333-4333-8333-333333333333',
     '44444444-4444-4444-8444-444444444444')));
 IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>10 THEN
  RAISE EXCEPTION 'MANAGER_BASELINE_SELECT_FAILED: %',r;
 END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','70707070-7070-4070-8070-707070707070',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb; baseline uuid;
BEGIN
 SELECT id INTO baseline FROM public.wos_visual_baselines
 WHERE entity_id='33333333-3333-4333-8333-333333333333' AND status='DRAFT';
 r:=public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',10,
  '71000000-0000-4000-8000-000000000006','BASELINE_OFFICE_CONFIRM',
  jsonb_build_object(
   'productionVersionLabel','V1',
   'note','Manager confirms the replacement proof set.',
   'baselineId',baseline));
 IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>11 THEN
  RAISE EXCEPTION 'MANAGER_OFFICE_CONFIRM_FAILED: %',r;
 END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','80808080-8080-4080-8080-808080808080',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',11,
  '71000000-0000-4000-8000-000000000007','BASELINE_SELECT',
  jsonb_build_object(
   'productionVersionLabel','V1',
   'note','Admin selects a final replacement baseline for QA review.',
   'imageIds',jsonb_build_array(
     '41111111-1111-4111-8111-111111111111',
     '42222222-2222-4222-8222-222222222222',
     '43333333-3333-4333-8333-333333333333',
     '44444444-4444-4444-8444-444444444444')));
 IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>12 THEN
  RAISE EXCEPTION 'ADMIN_BASELINE_SELECT_FAILED: %',r;
 END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','80808080-8080-4080-8080-808080808080',false);
SET ROLE authenticated;
DO $$
DECLARE r jsonb; baseline uuid;
BEGIN
 SELECT id INTO baseline FROM public.wos_visual_baselines
 WHERE entity_id='33333333-3333-4333-8333-333333333333' AND status='DRAFT';
 r:=public.wos_qa_p2_m2_action(
  '33333333-3333-4333-8333-333333333333',12,
  '71000000-0000-4000-8000-000000000008','BASELINE_OFFICE_CONFIRM',
  jsonb_build_object(
   'productionVersionLabel','V1',
   'note','Admin confirms the final replacement proof set.',
   'baselineId',baseline));
 IF r->>'status'<>'APPLIED' OR (r->>'version')::integer<>13 THEN
  RAISE EXCEPTION 'ADMIN_OFFICE_CONFIRM_FAILED: %',r;
 END IF;
END $$;
RESET ROLE;
SQL

echo 'PR270_SALES_B_DIRECT_RPC_DENIED=PASS'
echo 'PR270_SALES_OWNER_MANAGER_ADMIN_SUCCESS=PASS'

# 2. Exact QA-NONPROD prefix is enforced with no side effects.
prefix_db="${RUN_NAMESPACE}prefix_scope"
create_db "$prefix_db"
psql_run -q -d "$prefix_db" <<'SQL'
INSERT INTO public.wos_production_orders(
 id,organization_id,order_number,workflow_status,version,version_label,
 customer_id,customer_name_snapshot,product_name,product_material,
 requested_quantity,current_batch_quantity)
VALUES(
 '99999999-9999-4999-8999-999999999999',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','QA-BUSINESS-001',
 'WAITING_MATERIAL',7,'V1',NULL,'QA NONPROD CUSTOMER','QA PREFIX PRODUCT',
 'QA MATERIAL',100,100);
SQL
grant_and_open_m2_gate "$prefix_db" '99999999-9999-4999-8999-999999999999'
psql_run -q -d "$prefix_db" <<'SQL'
SELECT set_config('request.jwt.claim.sub','20202020-2020-4020-8020-202020202020',false);
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.wos_qa_p2_m2_action(
   '99999999-9999-4999-8999-999999999999',7,
   '72000000-0000-4000-8000-000000000001','MATERIAL_RECORD',
   jsonb_build_object(
    'productionVersionLabel','V1',
    'note','Non QA-NONPROD order must be rejected.',
    'resourceType','FILM','resourceStatus','ARRIVED',
    'arrivedAt',clock_timestamp(),'physicalCheckAttested',true));
  RAISE EXCEPTION 'NON_SYNTHETIC_QA_ORDER_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT version FROM public.wos_production_orders
     WHERE id='99999999-9999-4999-8999-999999999999')<>7
   OR EXISTS (SELECT 1 FROM public.wos_qa_p2_m2_receipts)
   OR EXISTS (SELECT 1 FROM public.wos_status_history)
   OR EXISTS (SELECT 1 FROM public.wos_resource_readiness) THEN
  RAISE EXCEPTION 'PREFIX_REJECTION_CAUSED_SIDE_EFFECT';
 END IF;
END $$;
SQL
echo 'PR270_QA_ORDER_PREFIX_DENIED=PASS'

# 3. Empty-receipt M2 rollback removes triggers/functions and image ops still work.
rollback_db="${RUN_NAMESPACE}m2_rollback"
create_db "$rollback_db"
psql_run -q -d "$rollback_db" < \
  "$ROOT/docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql"
psql_run -q -d "$rollback_db" <<'SQL'
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgrelid='public.wos_reference_images'::regclass
     AND tgname='wos_qa_p2_m2_reference_image_guard'
 ) OR pg_catalog.to_regprocedure(
   'public.wos_qa_p2_m2_invalidate_signoff(uuid,uuid,uuid)') IS NOT NULL
   OR pg_catalog.to_regprocedure(
     'public.wos_qa_p2_m2_image_change_guard()') IS NOT NULL THEN
  RAISE EXCEPTION 'M2_ROLLBACK_LEFT_DEPENDENCIES';
 END IF;
END $$;
INSERT INTO public.wos_reference_images(
 id,organization_id,entity_type,entity_id,category,version_label,
 image_status,storage_bucket,storage_path)
VALUES(
 'a6666666-6666-4666-8666-666666666666',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
 '33333333-3333-4333-8333-333333333333','PRODUCT','V1','READY',
 'wos-private','organizations/qa/post-rollback.png');
UPDATE public.wos_reference_images
SET image_status='READY'
WHERE id='41111111-1111-4111-8111-111111111111';
SQL
echo 'PR270_M2_ROLLBACK_IMAGE_INSERT_UPDATE=PASS'

# 4. Existing M2 receipts refuse destructive rollback and preserve objects.
receipt_db="${RUN_NAMESPACE}receipt_rollback"
create_db "$receipt_db"
psql_run -q -d "$receipt_db" <<'SQL'
INSERT INTO public.wos_qa_p2_m2_receipts(
 request_id,organization_id,order_id,actor_profile_id,action,expected_version,
 payload_fingerprint,before_spec_digest,after_spec_digest,receipt_digest,
 production_version_label,result_json)
VALUES(
 '73000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111','BASELINE_SELECT',7,
 repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),'V1',
 '{"status":"APPLIED"}');
SQL
set +e
psql_run -q -d "$receipt_db" < \
  "$ROOT/docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql" \
  >/tmp/wos-pr270-receipt-rollback.out 2>&1
receipt_rc=$?
set -e
if [[ $receipt_rc -eq 0 ]] || ! rg -q 'M2_ROLLBACK_REFUSED_RECEIPTS_EXIST' \
  /tmp/wos-pr270-receipt-rollback.out; then
  echo 'EXPECTED_M2_RECEIPT_ROLLBACK_REFUSAL_MISSING' >&2
  cat /tmp/wos-pr270-receipt-rollback.out >&2
  exit 1
fi
psql_run -qAt -d "$receipt_db" <<'SQL'
SELECT CASE WHEN to_regclass('public.wos_qa_p2_m2_receipts') IS NOT NULL
 AND to_regprocedure('public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)') IS NOT NULL
 AND (SELECT count(*) FROM public.wos_qa_p2_m2_receipts)=1
 THEN 'PR270_M2_RECEIPT_ROLLBACK_FAILCLOSED=PASS'
 ELSE 'PR270_M2_RECEIPT_ROLLBACK_FAILCLOSED=FAIL' END;
SQL

# 5. Revision-image rollback restores the pre-install catalog and ACL state.
revision_db="${RUN_NAMESPACE}revision_rollback"
create_db "$revision_db"
psql_run -q -d "$revision_db" \
  < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"
psql_run -q -d "$revision_db" <<'SQL'
GRANT INSERT ON public.wos_reference_images TO authenticated;
SQL

snapshot_sql=$(cat <<'SQL'
SELECT jsonb_build_object(
 'functions',(
   SELECT jsonb_agg(jsonb_build_object(
     'identity',p.oid::regprocedure::text,
     'definition',pg_get_functiondef(p.oid))
     ORDER BY p.oid::regprocedure::text)
   FROM pg_catalog.pg_proc p
   WHERE p.oid IN (
     to_regprocedure('public.wos_qa_proof_write_guard()'),
     to_regprocedure('public.wos_qa_revision_gate_allows(uuid,uuid,uuid)'),
     to_regprocedure('public.wos_register_qa_revision_image(uuid,uuid,text,text)'),
     to_regprocedure('public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)')
   )
 ),
 'triggers',(
   SELECT jsonb_agg(pg_get_triggerdef(t.oid,true) ORDER BY t.tgname)
   FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid='public.wos_qa_verified_image_proofs'::regclass
     AND NOT t.tgisinternal
 ),
 'policies',(
   SELECT jsonb_agg(jsonb_build_object(
     'name',p.polname,'cmd',p.polcmd,'permissive',p.polpermissive,
     'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
     'check',pg_get_expr(p.polwithcheck,p.polrelid))
     ORDER BY p.polname)
   FROM pg_catalog.pg_policy p
   WHERE p.polrelid='storage.objects'::regclass
     AND p.polname='wos_qa_revision_object_insert'
 ),
 'table_privileges',(
   SELECT jsonb_agg(jsonb_build_object(
     'table',c.oid::regclass::text,
     'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     'privilege',a.privilege_type,'grantable',a.is_grantable)
     ORDER BY c.oid::regclass::text,a.grantee,a.privilege_type,a.is_grantable)
   FROM pg_catalog.pg_class c
   CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid IN (
     'public.wos_qa_verified_image_proofs'::regclass,
     'public.wos_reference_images'::regclass
   )
 ),
 'function_privileges',(
   SELECT jsonb_agg(jsonb_build_object(
     'function',p.oid::regprocedure::text,
     'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     'privilege',a.privilege_type,'grantable',a.is_grantable)
     ORDER BY p.oid::regprocedure::text,a.grantee,a.privilege_type,a.is_grantable)
   FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid IN (
     to_regprocedure('public.wos_qa_proof_write_guard()'),
     to_regprocedure('public.wos_qa_revision_gate_allows(uuid,uuid,uuid)'),
     to_regprocedure('public.wos_register_qa_revision_image(uuid,uuid,text,text)'),
     to_regprocedure('public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)')
   )
 )
)::text;
SQL
)
before_snapshot="$(psql_run -qAt -d "$revision_db" -c "$snapshot_sql")"
psql_run -q -d "$revision_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
psql_run -qAt -d "$revision_db" <<'SQL'
SELECT CASE WHEN to_regprocedure('public.wos_register_qa_revision_image(uuid,uuid,text,text)') IS NOT NULL
 AND to_regprocedure('public.wos_qa_revision_gate_allows(uuid,uuid,uuid)') IS NOT NULL
 AND to_regprocedure('public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)') IS NOT NULL
 AND EXISTS (SELECT 1 FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname='wos_qa_revision_object_insert')
 THEN 'PR270_REVISION_ENTRYPOINTS_INSTALLED=PASS'
 ELSE 'PR270_REVISION_ENTRYPOINTS_INSTALLED=FAIL' END;
SQL
psql_run -q -d "$revision_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
psql_run -q -d "$revision_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql"
after_snapshot="$(psql_run -qAt -d "$revision_db" -c "$snapshot_sql")"
if [[ "$before_snapshot" != "$after_snapshot" ]]; then
  echo 'REVISION_ROLLBACK_CATALOG_OR_ACL_MISMATCH' >&2
  printf 'BEFORE=%s\nAFTER=%s\n' "$before_snapshot" "$after_snapshot" >&2
  exit 1
fi
psql_run -q -d "$revision_db" <<'SQL'
DO $$
BEGIN
 IF to_regprocedure('public.wos_register_qa_revision_image(uuid,uuid,text,text)') IS NOT NULL
   OR to_regprocedure('public.wos_qa_revision_gate_allows(uuid,uuid,uuid)') IS NOT NULL
   OR to_regprocedure('public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)') IS NOT NULL
   OR EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND policyname='wos_qa_revision_object_insert')
 THEN RAISE EXCEPTION 'REVISION_ROLLBACK_LEFT_ACTIVE_ENTRYPOINT'; END IF;
 IF NOT has_table_privilege('authenticated','public.wos_reference_images','INSERT') THEN
   RAISE EXCEPTION 'REVISION_ROLLBACK_DID_NOT_RESTORE_REFERENCE_INSERT';
 END IF;
END $$;
INSERT INTO public.wos_reference_images(
 id,organization_id,entity_type,entity_id,category,version_label,
 image_status,storage_bucket,storage_path)
VALUES(
 'a7777777-7777-4777-8777-777777777777',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','PRODUCTION_ORDER',
 '33333333-3333-4333-8333-333333333333','PRODUCT','V1','READY',
 'wos-private','organizations/qa/after-revision-rollback.png');
UPDATE public.wos_reference_images SET image_status='READY'
WHERE id='41111111-1111-4111-8111-111111111111';
SQL
psql_run -q -d "$revision_db" < \
  "$ROOT/docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql"
echo 'PR270_REVISION_ROLLBACK_NO_ACTIVE_ENTRYPOINT=PASS'
echo 'PR270_REVISION_CATALOG_AND_ACL_EQUAL=PASS'
echo 'PR270_CORRECT_REVERSE_ROLLBACK_ORDER=PASS'

# 6. A same-name pre-existing Storage policy is restored exactly.
policy_db="${RUN_NAMESPACE}revision_policy_restore"
create_db "$policy_db"
psql_run -q -d "$policy_db" \
  < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"
psql_run -q -d "$policy_db" <<'SQL'
CREATE POLICY wos_qa_revision_object_insert ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated
USING (bucket_id='wos-private');
SQL
policy_snapshot_sql=$(cat <<'SQL'
SELECT jsonb_build_object(
 'name',p.polname,'permissive',p.polpermissive,'cmd',p.polcmd,
 'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
 'check',pg_get_expr(p.polwithcheck,p.polrelid))::text
FROM pg_catalog.pg_policy p
WHERE p.polrelid='storage.objects'::regclass
  AND p.polname='wos_qa_revision_object_insert';
SQL
)
policy_before="$(psql_run -qAt -d "$policy_db" -c "$policy_snapshot_sql")"
psql_run -q -d "$policy_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
psql_run -q -d "$policy_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
psql_run -q -d "$policy_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql"
policy_after="$(psql_run -qAt -d "$policy_db" -c "$policy_snapshot_sql")"
if [[ "$policy_before" != "$policy_after" ]]; then
  echo 'PREEXISTING_STORAGE_POLICY_NOT_RESTORED' >&2
  printf 'BEFORE=%s\nAFTER=%s\n' "$policy_before" "$policy_after" >&2
  exit 1
fi
psql_run -q -d "$policy_db" < \
  "$ROOT/docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql"
echo 'PR270_STORAGE_POLICY_RESTORED=PASS'

# 7. Receipts with audit data are retained closed instead of deleted.
audit_db="${RUN_NAMESPACE}revision_audit_preserve"
create_db "$audit_db"
psql_run -q -d "$audit_db" \
  < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"
psql_run -q -d "$audit_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
psql_run -q -d "$audit_db" <<'SQL'
INSERT INTO public.wos_qa_trusted_proof_receipts(
 request_id,organization_id,order_id,image_id,actor_user_id,actor_profile_id,
 expected_version,payload_fingerprint,proof_status,before_sha256,after_sha256,
 storage_object_id,storage_object_version,storage_object_updated_at,result_json)
VALUES(
 '74000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '33333333-3333-4333-8333-333333333333',
 '41111111-1111-4111-8111-111111111111',
 '10101010-1010-4010-8010-101010101010',
 '11111111-1111-4111-8111-111111111111',
 7,repeat('a',64),'CREATED',NULL,repeat('b',64),
 '51111111-1111-4111-8111-111111111111','v1',clock_timestamp(),
 '{"status":"CREATED"}');
SQL
psql_run -q -d "$audit_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql"
psql_run -qAt -d "$audit_db" <<'SQL'
SELECT CASE WHEN to_regclass('public.wos_qa_trusted_proof_receipts') IS NOT NULL
 AND (SELECT relrowsecurity FROM pg_class
      WHERE oid='public.wos_qa_trusted_proof_receipts'::regclass)
 AND NOT has_table_privilege('authenticated','public.wos_qa_trusted_proof_receipts','SELECT')
 AND NOT has_table_privilege('service_role','public.wos_qa_trusted_proof_receipts','SELECT')
 AND (SELECT count(*) FROM public.wos_qa_trusted_proof_receipts)=1
 THEN 'PR270_AUDIT_RECEIPTS_PRESERVED=PASS'
 ELSE 'PR270_AUDIT_RECEIPTS_PRESERVED=FAIL' END;
SQL

# 8. M2-first rollback is rejected while revision-image dependencies exist.
wrong_db="${RUN_NAMESPACE}wrong_rollback_order"
create_db "$wrong_db"
psql_run -q -d "$wrong_db" \
  < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"
psql_run -q -d "$wrong_db" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
set +e
psql_run -q -d "$wrong_db" < \
  "$ROOT/docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql" \
  >/tmp/wos-pr270-wrong-order.out 2>&1
wrong_rc=$?
set -e
if [[ $wrong_rc -eq 0 ]] || ! rg -q 'M2_ROLLBACK_REVISION_IMAGE_DEPENDENCY_ACTIVE' \
  /tmp/wos-pr270-wrong-order.out; then
  echo 'EXPECTED_M2_REVISION_DEPENDENCY_REFUSAL_MISSING' >&2
  cat /tmp/wos-pr270-wrong-order.out >&2
  exit 1
fi
psql_run -qAt -d "$wrong_db" <<'SQL'
SELECT CASE WHEN to_regprocedure('public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)') IS NOT NULL
 AND to_regprocedure('public.wos_register_qa_revision_image(uuid,uuid,text,text)') IS NOT NULL
 THEN 'PR270_INVALID_ROLLBACK_ORDER_DENIED=PASS'
 ELSE 'PR270_INVALID_ROLLBACK_ORDER_DENIED=FAIL' END;
SQL

echo 'PR270_P1_P2_PG17_REGRESSION=PASS'
echo 'PR270_NO_CLOUD_QA_CONNECTION=PASS'
