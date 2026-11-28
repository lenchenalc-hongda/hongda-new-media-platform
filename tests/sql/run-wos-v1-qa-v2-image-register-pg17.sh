#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="wos_v1_qa_v2_image_register_ci"

fail() {
  printf 'WOS_V1_QA_V2_IMAGE_REGISTER_PG17_FAILED=%s\n' "$1" >&2
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

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $uid$ SELECT '3c0d8866-498a-4e61-a602-28b7a83f75f5'::uuid $uid$;

CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
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
  organization_id uuid NOT NULL,
  created_by_profile_id uuid,
  sales_owner_profile_id uuid,
  workflow_status text NOT NULL,
  version_label text NOT NULL
);
INSERT INTO public.wos_production_orders(
  id,organization_id,created_by_profile_id,sales_owner_profile_id,
  workflow_status,version_label
) VALUES(
  '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  'f8adf44a-f04e-44b4-9c82-8b96508097bb',
  'NEEDS_INFORMATION',
  'V2'
);

CREATE SCHEMA storage;
CREATE TABLE storage.objects(
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id text NOT NULL,
  is_delete_marker boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  metadata jsonb NOT NULL,
  version text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.wos_reference_images(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  category text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  version_label text NOT NULL,
  image_status text NOT NULL,
  uploaded_by_profile_id uuid NOT NULL
);
CREATE TABLE public.wos_qa_orphan_cleanup_claims(
  storage_object_id uuid,
  state text,
  lease_expires_at timestamptz
);
CREATE TABLE public.wos_qa_verified_image_proofs(
  image_id uuid,
  order_id uuid,
  organization_id uuid,
  actor_user_id uuid,
  storage_bucket text,
  storage_path text,
  storage_object_id uuid,
  storage_object_version text,
  storage_object_updated_at timestamptz,
  expires_at timestamptz
);
SQL

psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-qa-existing-v2-image-register-fixture.sql"

source_sha="$(psql_db "$DB" -qAt -c "
  SELECT encode(sha256(convert_to(
    pg_get_functiondef(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
    ),
    'UTF8'
  )), 'hex')
")"
[[ "$source_sha" = \
  'f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187' ]] \
  || fail 'SOURCE_HASH_MISMATCH'

psql_db "$DB" -q -c "
  INSERT INTO storage.objects(
    id,bucket_id,name,owner_id,metadata,version
  ) VALUES(
    'dd966e71-36bc-4c2b-af7d-2ba888b2cf00',
    'wos-private',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/16eef570-9940-4661-9f04-c48ebfaac513/source.png',
    '3c0d8866-498a-4e61-a602-28b7a83f75f5',
    '{\"mimetype\":\"image/png\",\"size\":1353}'::jsonb,
    'fixture-v2'
  );
  INSERT INTO public.wos_qa_verified_image_proofs(
    image_id,order_id,organization_id,actor_user_id,storage_bucket,
    storage_path,storage_object_id,storage_object_version,
    storage_object_updated_at,expires_at
  )
  SELECT
    '16eef570-9940-4661-9f04-c48ebfaac513',
    '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
    '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    '3c0d8866-498a-4e61-a602-28b7a83f75f5',
    'wos-private',name,id,version,updated_at,
    clock_timestamp() + interval '10 minutes'
  FROM storage.objects
  WHERE id='dd966e71-36bc-4c2b-af7d-2ba888b2cf00';
" >/dev/null

psql_db "$DB" -qAt -c "
  DO \$precheck\$
  BEGIN
    BEGIN
      PERFORM public.wos_register_uploaded_reference_image(
        '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
        '16eef570-9940-4661-9f04-c48ebfaac513',
        'PRODUCT',
        'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/16eef570-9940-4661-9f04-c48ebfaac513/source.png'
      );
      RAISE EXCEPTION 'V2_REGISTER_PREMATURELY_ALLOWED';
    EXCEPTION WHEN SQLSTATE '23514' THEN
      IF SQLERRM<>'UNSUPPORTED_ORDER_VERSION' THEN RAISE; END IF;
    END;
  END;
  \$precheck\$;
" >/dev/null

{
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_v2_image_register_install_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_V2_IMAGE_REGISTER_COMPAT_INSTALL_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

installed_sha="$(psql_db "$DB" -qAt -c "
  SELECT encode(sha256(convert_to(
    pg_get_functiondef(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
    ),
    'UTF8'
  )), 'hex')
")"
[[ "$installed_sha" = \
  '40231c055eae538f101ca7394880e1f746adcccb8265b07a832909238b678f0d' ]] \
  || fail 'TARGET_HASH_MISMATCH'

registered="$(psql_db "$DB" -qAt -c "
  SELECT public.wos_register_uploaded_reference_image(
    '3ade0180-e6bf-49da-b80b-fd00cd1948a8',
    '16eef570-9940-4661-9f04-c48ebfaac513',
    'PRODUCT',
    'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/16eef570-9940-4661-9f04-c48ebfaac513/source.png'
  )->>'status'
")"
[[ "$registered" = 'CREATED' ]] || fail 'V2_REGISTER_NOT_CREATED'

{
  printf "SET wos_v1.qa_project='xulmpqaknlwqqculbsek';\n"
  printf "SET wos_v1.qa_v2_image_register_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_V2_IMAGE_REGISTER_COMPAT_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q

restored_sha="$(psql_db "$DB" -qAt -c "
  SELECT encode(sha256(convert_to(
    pg_get_functiondef(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
    ),
    'UTF8'
  )), 'hex')
")"
[[ "$restored_sha" = "$source_sha" ]] || fail 'SOURCE_HASH_NOT_RESTORED'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT count(*) FROM public.wos_reference_images
  WHERE id='16eef570-9940-4661-9f04-c48ebfaac513'
")" = '1' ]] || fail 'RETAINED_IMAGE_MISSING'

echo 'WOS_V1_QA_V2_IMAGE_REGISTER_PG17=PASS'
echo 'WOS_V1_QA_V2_IMAGE_REGISTER_SOURCE_HASH=PASS'
echo 'WOS_V1_QA_V2_IMAGE_REGISTER_NEEDS_INFORMATION_V2=PASS'
echo 'WOS_V1_QA_V2_IMAGE_REGISTER_ROLLBACK=PASS'
