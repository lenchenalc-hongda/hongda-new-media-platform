#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${WOS_PG_DATABASE:-wos_qa_proof_guard_compat}"
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
psql_run -q -d "$DB" < "$ROOT/tests/sql/wos-qa-existing-proof-guard-fixture.sql"

assert_old() {
  psql_run -qAt -d "$DB" <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_trigger
     WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
       AND NOT tgisinternal
       AND tgname IN (
         'wos_qa_trusted_proof_guard',
         'wos_qa_trusted_proof_write_guard',
         'wos_qa_p2_m2_verified_proof_guard'
       ))<>1 THEN
   RAISE EXCEPTION 'LEGACY_TRUSTED_GUARD_NOT_EXACTLY_ONE';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
     AND tgname='wos_qa_trusted_proof_guard'
 ) THEN
   RAISE EXCEPTION 'LEGACY_TRUSTED_GUARD_NAME_CHANGED';
 END IF;
 IF (SELECT pg_get_functiondef('public.wos_qa_proof_write_guard()'::regprocedure))
    NOT LIKE '%QA_LEGACY_DRAFT_ONLY%' THEN
   RAISE EXCEPTION 'LEGACY_GUARD_NOT_RESTORED';
 END IF;
END $$;
SQL
}

assert_new() {
  psql_run -qAt -d "$DB" <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_trigger
     WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
       AND NOT tgisinternal
       AND tgname IN (
         'wos_qa_trusted_proof_guard',
         'wos_qa_trusted_proof_write_guard',
         'wos_qa_p2_m2_verified_proof_guard'
       ))<>1 THEN
   RAISE EXCEPTION 'NEW_TRIGGER_NOT_UNIQUE';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgrelid='public.wos_qa_verified_image_proofs'::regclass
     AND tgname='wos_qa_trusted_proof_guard'
 ) THEN RAISE EXCEPTION 'QA_TRIGGER_NAME_NOT_RETAINED'; END IF;
 IF (SELECT pg_get_functiondef('public.wos_qa_proof_write_guard()'::regprocedure))
    NOT LIKE '%TRUSTED_PROOF_RPC_REQUIRED%' THEN
   RAISE EXCEPTION 'NEW_GUARD_NOT_INSTALLED';
 END IF;
 IF (SELECT count(*) FROM wos_qa_safety.wos_proof_guard_backup)<>1 THEN
   RAISE EXCEPTION 'ORIGINAL_GUARD_BACKUP_MISSING';
 END IF;
 IF pg_catalog.to_regprocedure(
   'public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)'
 ) IS NULL THEN RAISE EXCEPTION 'TRUSTED_PROOF_RPC_MISSING'; END IF;
END $$;
SQL
}

acl_snapshot() {
  psql_run -qAt -d "$DB" <<'SQL'
SELECT COALESCE(
  pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      'privilege',a.privilege_type,
      'grantable',a.is_grantable
    )
    ORDER BY
      CASE WHEN a.grantee=0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      a.privilege_type,
      a.is_grantable,
      pg_catalog.pg_get_userbyid(a.grantor)
  )::text,
  '[]'
)
FROM pg_catalog.pg_class c
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))
) a
WHERE c.oid='public.wos_qa_verified_image_proofs'::regclass;
SQL
}

assert_old
ACL_BEFORE="$(acl_snapshot)"
psql_run -qAt -d "$DB" <<'SQL'
DO $$
BEGIN
 IF NOT has_table_privilege(
   'service_role','public.wos_qa_verified_image_proofs','SELECT')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','INSERT')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','UPDATE')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','DELETE')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','TRUNCATE')
 THEN RAISE EXCEPTION 'QA_BASELINE_SERVICE_ROLE_ACL_INCOMPLETE'; END IF;
END $$;
SQL
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
assert_new
ACL_INSTALLED="$(acl_snapshot)"
if [[ "$ACL_INSTALLED" = "$ACL_BEFORE" ]]; then
  echo 'INSTALL_DID_NOT_RESTRICT_SERVICE_ROLE_ACL' >&2
  exit 1
fi
psql_run -qAt -d "$DB" <<'SQL'
DO $$
BEGIN
 IF NOT has_table_privilege(
   'service_role','public.wos_qa_verified_image_proofs','SELECT')
   OR has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','INSERT')
   OR has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','UPDATE')
   OR has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','DELETE')
   OR has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','TRUNCATE')
 THEN RAISE EXCEPTION 'INSTALLED_SERVICE_ROLE_ACL_NOT_RESTRICTED'; END IF;
END $$;
SQL
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql"
assert_new
ACL_REINSTALLED="$(acl_snapshot)"
if [[ "$ACL_REINSTALLED" != "$ACL_INSTALLED" ]]; then
  echo 'REINSTALL_CHANGED_SERVICE_ROLE_ACL' >&2
  printf 'INSTALLED=%s\nREINSTALLED=%s\n' \
    "$ACL_INSTALLED" "$ACL_REINSTALLED" >&2
  exit 1
fi
psql_run -q -d "$DB" < \
  "$ROOT/docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql"
assert_old
ACL_AFTER="$(acl_snapshot)"
if [[ "$ACL_AFTER" != "$ACL_BEFORE" ]]; then
  echo 'ROLLBACK_ACL_NOT_EQUAL_TO_ORIGINAL' >&2
  printf 'BEFORE=%s\nAFTER=%s\n' "$ACL_BEFORE" "$ACL_AFTER" >&2
  exit 1
fi

psql_run -qAt -d "$DB" <<'SQL'
DO $$
BEGIN
 IF pg_catalog.to_regprocedure(
   'public.wos_qa_p2_m2_record_trusted_proof(uuid,uuid,uuid,text,uuid,integer,text,uuid,text,timestamptz,text)'
 ) IS NOT NULL THEN RAISE EXCEPTION 'ROLLBACK_LEFT_RPC_INSTALLED'; END IF;
 IF NOT has_table_privilege(
   'service_role','public.wos_qa_verified_image_proofs','INSERT')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','UPDATE')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','DELETE')
   OR NOT has_table_privilege(
     'service_role','public.wos_qa_verified_image_proofs','TRUNCATE')
 THEN RAISE EXCEPTION 'ROLLBACK_DID_NOT_RESTORE_SERVICE_ROLE_GRANTS'; END IF;
END $$;
SQL

echo 'QA_TRIGGER_COMPATIBILITY_BASELINE_ACL=PASS'
echo 'QA_TRIGGER_COMPATIBILITY_INSTALL=PASS'
echo 'QA_TRIGGER_COMPATIBILITY_REINSTALL=PASS'
echo 'QA_TRIGGER_COMPATIBILITY_ROLLBACK=PASS'
echo 'QA_TRIGGER_COMPATIBILITY_ROLLBACK_ACL_EQUAL=PASS'
echo 'QA_TRIGGER_COMPATIBILITY_NO_CLOUD_QA_CONNECTION=PASS'
