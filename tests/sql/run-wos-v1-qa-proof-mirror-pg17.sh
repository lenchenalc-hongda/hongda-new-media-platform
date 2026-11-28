#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_v1_qa_proof_mirror_ci"

fail() {
  printf 'WOS_V1_QA_PROOF_MIRROR_PG17_FAILED=%s\n' "$1" >&2
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
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
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
INSERT INTO public.profiles(id,user_id,org_id,role,is_active)
VALUES(
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  '3c0d8866-498a-4e61-a602-28b7a83f75f5',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'admin',
  true
);

CREATE TABLE public.wos_production_orders(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL
);
INSERT INTO public.wos_production_orders(id,organization_id)
VALUES(
  '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2'
);

CREATE TABLE storage.objects(
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL,
  version text,
  updated_at timestamptz NOT NULL
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
CREATE TABLE public.wos_verified_image_proofs(
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

CREATE SCHEMA wos_v1_qa_uat;
CREATE TABLE wos_v1_qa_uat.closeout_controls(
  execution_id uuid PRIMARY KEY,
  authorization_id text NOT NULL,
  project_ref text NOT NULL,
  db_state text NOT NULL,
  edge_state text NOT NULL,
  write_deadline_at timestamptz NOT NULL,
  authorized_order_id uuid,
  authorized_organization_id uuid,
  edge_process_nonce uuid,
  opened_at timestamptz NOT NULL
);
CREATE TABLE wos_v1_qa_uat.write_gates(
  gate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id text NOT NULL
);

CREATE FUNCTION public.wos_v1_qa_uat_edge_write_allowed(
  p_authorization_id text,
  p_project_ref text,
  p_execution_id uuid,
  p_process_nonce uuid,
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_order_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $allowed$
  SELECT EXISTS(
    SELECT 1
    FROM wos_v1_qa_uat.closeout_controls control
    JOIN public.profiles profile ON profile.id=p_actor_profile_id
    WHERE control.execution_id=p_execution_id
      AND control.authorization_id=p_authorization_id
      AND control.project_ref=p_project_ref
      AND control.db_state='ARMED'
      AND control.edge_state='ARMED'
      AND control.write_deadline_at>clock_timestamp()
      AND control.authorized_order_id=p_order_id
      AND control.authorized_organization_id=p_organization_id
      AND control.edge_process_nonce=p_process_nonce
      AND profile.org_id=p_organization_id
      AND profile.is_active=true
      AND profile.role IN ('admin','manager','sales')
  );
$allowed$;
SQL

{
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_verified_proof_mirror_install_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

proof_insert() {
  local image_id="$1"
  local object_id="$2"
  psql_db "$DB" -qAt -c "
    INSERT INTO public.wos_qa_verified_image_proofs(
      image_id,organization_id,order_id,actor_user_id,storage_bucket,
      storage_path,storage_object_id,storage_object_version,
      storage_object_updated_at,verified_sha256,verified_at,expires_at
    ) VALUES(
      '$image_id',
      '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
      '3c0d8866-498a-4e61-a602-28b7a83f75f5',
      'wos-private',
      'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/$image_id/source.png',
      '$object_id',
      'fixture-v2',
      clock_timestamp(),
      repeat('a',64),
      clock_timestamp(),
      clock_timestamp()+interval '10 minutes'
    );
  "
}

psql_db "$DB" -q -c "
  INSERT INTO storage.objects(id,bucket_id,name,version,updated_at)
  VALUES(
    '11111111-1111-4111-8111-111111111111',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/5f9329e1-d9dd-4fb2-9fa7-837c6b2060db/source.png',
    'fixture-v2',
    clock_timestamp()
  );
" >/dev/null

if proof_insert \
  '5f9329e1-d9dd-4fb2-9fa7-837c6b2060db' \
  '11111111-1111-4111-8111-111111111111' >/dev/null 2>/tmp/wos-proof-mirror-gate.err; then
  fail 'PROOF_MIRROR_ALLOWED_WITHOUT_CONTROL'
fi
rg -q 'QA_VERIFIED_PROOF_MIRROR_GATE_REQUIRED' \
  /tmp/wos-proof-mirror-gate.err || fail 'GATE_ERROR_SEMANTICS_MISMATCH'

psql_db "$DB" -q -c "
  INSERT INTO wos_v1_qa_uat.closeout_controls(
    execution_id,authorization_id,project_ref,db_state,edge_state,
    write_deadline_at,authorized_order_id,authorized_organization_id,
    edge_process_nonce,opened_at
  ) VALUES(
    '1dc0f65d-ecc3-4a89-bb16-e2d4b3843395',
    'WOS-V1-PRODUCTION-M2-QA-UAT-015',
    'xulmpqaknlwqqculbsek',
    'ARMED',
    'ARMED',
    clock_timestamp()+interval '8 minutes',
    '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '94e872da-4e3c-4b00-bdbe-91caf6a2c584',
    clock_timestamp()
  );
" >/dev/null

proof_insert \
  '5f9329e1-d9dd-4fb2-9fa7-837c6b2060db' \
  '11111111-1111-4111-8111-111111111111' >/dev/null

[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_verified_image_proofs
  WHERE image_id='5f9329e1-d9dd-4fb2-9fa7-837c6b2060db'
")" = '1' ]] || fail 'VERIFIED_MIRROR_NOT_CREATED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT verified_at::text||'|'||expires_at::text
  FROM public.wos_verified_image_proofs
  WHERE image_id='5f9329e1-d9dd-4fb2-9fa7-837c6b2060db'
")" = "$(psql_db "$DB" -qAt -c "
  SELECT verified_at::text||'|'||expires_at::text
  FROM public.wos_qa_verified_image_proofs
  WHERE image_id='5f9329e1-d9dd-4fb2-9fa7-837c6b2060db'
")" ]] || fail 'MIRROR_TIMESTAMPS_DIFFER'

{
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_verified_proof_mirror_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

[[ "$(psql_db "$DB" -qAt -c "
  SELECT to_regprocedure(
    'public.wos_v1_qa_uat_mirror_verified_proof()'
  ) IS NULL
  AND to_regclass(
    'wos_v1_qa_proof_mirror_compat.install_state'
  ) IS NULL
")" = 't' ]] || fail 'MIRROR_ROLLBACK_INCOMPLETE'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_verified_image_proofs
")" = '1' ]] || fail 'MIRROR_HISTORY_NOT_RETAINED'

echo 'WOS_V1_QA_PROOF_MIRROR_PG17=PASS'
echo 'WOS_V1_QA_PROOF_MIRROR_GATE_REQUIRED=PASS'
echo 'WOS_V1_QA_PROOF_MIRROR_EXACT_PROOF_COPY=PASS'
echo 'WOS_V1_QA_PROOF_MIRROR_ROLLBACK=PASS'
