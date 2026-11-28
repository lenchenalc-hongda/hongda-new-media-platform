#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
DB="${WOS_PG_PROOF_LIFECYCLE_DATABASE:-wos_v1_proof_lifecycle_ci}"
VERSION_LABEL="${WOS_PG_PROOF_LIFECYCLE_VERSION_LABEL:-V2}"

fail() {
  printf 'WOS_V1_PROOF_LIFECYCLE_PG17_FAILED=%s\n' "$1" >&2
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
  if [[ "$status" -eq 0 && "${WOS_PROOF_LIFECYCLE_KEEP_DB:-0}" = '1' ]]; then
    printf 'WOS_V1_PROOF_LIFECYCLE_DB_RETAINED=%s\n' "$DB"
    exit "$status"
  fi
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
psql_db postgres -q -c "CREATE DATABASE \"$DB\""
psql_db "$DB" -q < "$ROOT/tests/sql/wos-v1-production-m2-pg17-fixture.sql"
psql_db "$DB" -q \
  < "$ROOT/tests/sql/wos-v1-production-proof-renewal-test-prerequisites.sql"
psql_db "$DB" -v version_label="$VERSION_LABEL" -q <<'SQL'
UPDATE public.wos_production_orders
SET version_label=:'version_label'
WHERE id='33333333-3333-4333-8333-333333333333';
UPDATE public.wos_reference_images
SET version_label=:'version_label'
WHERE entity_id='33333333-3333-4333-8333-333333333333';
SQL
psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql"
psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261128162000_wos_v1_proof_renewal_v2plus.sql"
{
  printf "SET wos_v1.production_m2_activation_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
psql_db "$DB" -v version_label="$VERSION_LABEL" -q \
  < "$ROOT/tests/sql/wos-v1-production-proof-lifecycle-pg17.sql"

{
  printf "SET wos_v1.production_migration_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PROOF_RENEWAL_V2PLUS_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
psql_db "$DB" -qAt -c "
  SELECT pg_get_functiondef(
    'public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure
  ) LIKE '%^V[2-9][0-9]{0,20}$%'
" | grep -qx 't' || fail 'V2PLUS_ROLLBACK_NOT_APPLIED'
psql_db "$DB" -q -1 \
  < "$ROOT/supabase/migrations/20261128162000_wos_v1_proof_renewal_v2plus.sql"

DATA_DIGEST_SQL="
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'organizations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)
      FROM public.organizations o),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
      FROM public.profiles p),
    'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)
      FROM public.wos_production_orders o),
    'images',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)
      FROM public.wos_reference_images i),
    'proofs',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.image_id)
      FROM public.wos_verified_image_proofs p),
    'baselines',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id)
      FROM public.wos_visual_baselines b),
    'baseline_items',(SELECT jsonb_agg(to_jsonb(bi) ORDER BY bi.baseline_id,bi.reference_image_id)
      FROM public.wos_visual_baseline_items bi),
    'resources',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.resource_type)
      FROM public.wos_resource_readiness r),
    'storage_objects',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)
      FROM storage.objects o),
    'submission_receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
      FROM public.wos_submission_receipts r),
    'workshop_inbox',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
      FROM public.wos_workshop_inbox r),
    'blockers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
      FROM public.wos_blockers r),
    'confirmations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
      FROM public.wos_confirmations r),
    'm2_receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id)
      FROM public.wos_v1_m2_receipts r),
    'start_releases',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.request_id)
      FROM public.wos_v1_start_releases r),
    'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at,h.id)
      FROM public.wos_status_history h)
  )::text,'UTF8')),'hex');
"
DATA_BEFORE="$(psql_db "$DB" -qAt -c "$DATA_DIGEST_SQL")"

psql_db "$DB" -q \
  < "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_DEACTIVATE_NOT_AUTHORIZED.sql"
{
  printf "SET wos_v1.production_m2_rollback_authorized='yes';\n"
  cat "$ROOT/docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql"
} | psql_db "$DB" -q
DATA_AFTER="$(psql_db "$DB" -qAt -c "$DATA_DIGEST_SQL")"
[[ "$DATA_BEFORE" = "$DATA_AFTER" ]] \
  || fail 'DATA_DIGEST_CHANGED_AFTER_RECOVERY'
[[ "$(psql_db "$DB" -qAt -c "
  SELECT (SELECT count(*) FROM public.wos_v1_m2_receipts)>=4
    AND (SELECT count(*) FROM public.wos_v1_start_releases)>=1
")" = 't' ]] || fail 'DATA_RETAINING_RECOVERY_FAILED'

echo 'WOS_V1_PRODUCTION_PROOF_LIFECYCLE_PG17=PASS'
echo 'WOS_V1_PROOF_RENEWAL_TEN_MINUTE_BOUNDARY=PASS'
echo 'WOS_V1_PROOF_RENEWAL_TWENTY_FOUR_HOUR_BOUNDARY=PASS'
echo 'WOS_V1_PROOF_RENEWAL_PRESERVES_SIGNOFFS=PASS'
echo 'WOS_V1_PROOF_CONTENT_CHANGE_INVALIDATES=PASS'
echo 'WOS_V1_PROOF_LIFECYCLE_DATA_RETAINING_RECOVERY=PASS'
echo 'WOS_V1_PROOF_LIFECYCLE_DATA_DIGEST_PRESERVED=PASS'
