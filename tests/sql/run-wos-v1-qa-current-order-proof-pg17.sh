#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_v1_qa_current_order_proof_ci"

fail() {
  printf 'WOS_V1_QA_CURRENT_ORDER_PROOF_PG17_FAILED=%s\n' "$1" >&2
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

psql_auth_db() {
  local database="$1"
  shift
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 \
    -U authenticator -d "$database" "$@"
}

cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
  >/dev/null
psql_db postgres -q -c "CREATE DATABASE \"$DB\"" >/dev/null

psql_db "$DB" -q <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator LOGIN;
  END IF;
  IF NOT pg_has_role('authenticator','service_role','MEMBER') THEN
    GRANT service_role TO authenticator;
  END IF;
END;
$roles$;

CREATE SCHEMA storage;
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL
);
CREATE TABLE public.wos_production_orders(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_number text NOT NULL,
  created_by_profile_id uuid NOT NULL,
  sales_owner_profile_id uuid NOT NULL,
  version integer NOT NULL,
  version_label text NOT NULL,
  workflow_status text NOT NULL
);
CREATE TABLE storage.objects(
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL,
  version text,
  updated_at timestamptz NOT NULL,
  owner_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_delete_marker boolean NOT NULL DEFAULT false,
  archived_at timestamptz
);
CREATE TABLE public.wos_qa_verified_image_proofs(
  image_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  verified_sha256 text NOT NULL,
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE public.wos_qa_trusted_proof_receipts(
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL,
  image_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  expected_version integer NOT NULL,
  payload_fingerprint text NOT NULL,
  proof_status text NOT NULL,
  before_sha256 text,
  after_sha256 text NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_object_version text,
  storage_object_updated_at timestamptz NOT NULL,
  result_json jsonb NOT NULL
);
CREATE FUNCTION public.wos_qa_revision_gate_allows(
  uuid, uuid, uuid
) RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT false';
CREATE FUNCTION public.wos_qa_p2_m2_invalidate_signoff(
  uuid, uuid, uuid
) RETURNS void LANGUAGE plpgsql AS 'BEGIN RETURN; END';

INSERT INTO public.profiles(id,user_id,org_id,role,is_active)
VALUES(
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'admin',
  true
);
INSERT INTO public.wos_production_orders(
  id,organization_id,order_number,created_by_profile_id,
  sales_owner_profile_id,version,version_label,workflow_status
) VALUES(
  '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'QA-NONPROD-ccd975a6-1516-4833-afd1-902077e70ed8',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  7,
  'V2',
  'WAITING_MATERIAL'
);

CREATE FUNCTION public.wos_v1_qa_uat_edge_record_proof(
  uuid, uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $wrapper$
BEGIN
  PERFORM pg_catalog.set_config(
    'wos_v1.qa_current_order_proof','yes',true
  );
  RETURN public.wos_p7_record_trusted_image_proof(
    $3,$4,$5,$6,$7,$8,$9,$10
  );
END;
$wrapper$;
SQL

docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DB" -At -f - \
  < "$ROOT/tests/sql/wos-v1-live-proof-function-postguard-20261128.sql" \
  >/dev/null

call_direct() {
  psql_auth_db "$DB" -qAt -c "
    SET ROLE service_role;
    SET request.jwt.claims='{\"role\":\"service_role\"}';
    SELECT public.wos_p7_record_trusted_image_proof(
      '5f9329e1-d9dd-4fb2-9fa7-837c6b2060db',
      '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
      '3c0d8866-498a-4e61-a602-28b7a83f75f5',
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/5f9329e1-d9dd-4fb2-9fa7-837c6b2060db/source.png',
      '11111111-1111-4111-8111-111111111111',
      'fixture-version',
      clock_timestamp(),
      repeat('a',64)
    );
  " 2>&1
}

call_wrapper() {
  psql_auth_db "$DB" -qAt -c "
    SET ROLE service_role;
    SET request.jwt.claims='{\"role\":\"service_role\"}';
    SELECT public.wos_v1_qa_uat_edge_record_proof(
      '67527336-0d2b-48ba-bd41-4d6f8d6781ff',
      'c72eedf2-869d-49b6-a3fd-b6084018b6df',
      '5f9329e1-d9dd-4fb2-9fa7-837c6b2060db',
      '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
      '3c0d8866-498a-4e61-a602-28b7a83f75f5',
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/5f9329e1-d9dd-4fb2-9fa7-837c6b2060db/source.png',
      '11111111-1111-4111-8111-111111111111',
      'fixture-version',
      clock_timestamp(),
      repeat('a',64)
    );
  " 2>&1
}

direct_before="$(call_direct || true)"
[[ "$direct_before" == *'PROOF_ORDER_NOT_EDITABLE'* ]] \
  || fail 'DIRECT_V2_WRITE_NOT_DENIED'

{
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_current_order_proof_install_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_COMPAT_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

wrapped_after="$(call_wrapper || true)"
[[ "$wrapped_after" == *'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED'* ]] \
  || fail 'WRAPPER_V2_STATUS_NOT_REACHED'
[[ "$wrapped_after" != *'PROOF_ORDER_NOT_EDITABLE'* ]] \
  || fail 'WRAPPER_V2_STILL_STATUS_DENIED'

{
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_current_order_proof_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_CURRENT_ORDER_PROOF_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

wrapped_rolled_back="$(call_wrapper || true)"
[[ "$wrapped_rolled_back" == *'PROOF_ORDER_NOT_EDITABLE'* ]] \
  || fail 'ROLLBACK_DID_NOT_RESTORE_V2_DENIAL'

echo 'WOS_V1_QA_CURRENT_ORDER_PROOF_PG17=PASS'
echo 'WOS_V1_QA_CURRENT_ORDER_PROOF_DIRECT_DENIAL=PASS'
echo 'WOS_V1_QA_CURRENT_ORDER_PROOF_WRAPPER_ALLOW=PASS'
echo 'WOS_V1_QA_CURRENT_ORDER_PROOF_ROLLBACK=PASS'
