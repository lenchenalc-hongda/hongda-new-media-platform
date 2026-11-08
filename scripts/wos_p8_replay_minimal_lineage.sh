#!/usr/bin/env bash
# WOS P8 historical prerequisite test: GitHub postgres:17 service ONLY.
# Fails closed on other databases. No Supabase URLs, DB passwords or secrets.
set -euo pipefail

if [[ "$PGDATABASE" != "wos_p8_lineage_ci" ||
      "$PGHOST" != "localhost" ||
      "$PGUSER" != "postgres" ]]; then
  echo "WOS_P8_LINEAGE_DISPOSABLE_GUARD=FAIL" >&2
  exit 1
fi

run() {
  local path="$1"
  printf 'WOS_P8_LINEAGE_EXECUTING=%s\n' "$path"
  psql -X -q -v ON_ERROR_STOP=1 -f "$path"
}

run tests/sql/wos_p8_lineage_ephemeral_auth_fixture.sql
# Legacy bootstrap is untracked in Production migration history. Run only
# inside the isolated PG17 service to detect first missing prerequisite.
run supabase/migrations/001_initial_schema.sql
run supabase/migrations/20260705_rls_policies.sql
run supabase/migrations/20260801000000_review_center_auth_forward_migration.sql
run supabase/migrations/20260817_review_center_phase2_core_foundation.sql

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $assert$
BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.review_cases') IS NULL
     OR to_regprocedure('public.auth_profile_id()') IS NULL
     OR to_regprocedure('public.auth_has_role(text)') IS NULL
     OR to_regprocedure('public.set_updated_at()') IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
       AND tablename='profiles' AND indexname='uq_profiles_id_org')
  THEN RAISE EXCEPTION 'WOS_P8_HISTORICAL_CPC_PREREQUISITE_MISSING'; END IF;
END $assert$;
SQL
echo 'WOS_P8_LEGACY_CORE_PREREQUISITES=PASS'

# First registered Production migration -- not the entire 29-migration
# replay. This is a dependency smoke; SQL identities are unverified.
run supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $cpc$
BEGIN
  IF to_regclass('public.cpc_customer_references') IS NULL
  THEN RAISE EXCEPTION 'WOS_P8_CPC_PHASE5A_REPLAY_MISSING'; END IF;
END $cpc$;
SQL
echo 'WOS_P8_FIRST_REGISTERED_CPC_MIGRATION=PASS'
echo 'WOS_P8_COMPLETE_67_TABLE_PRODUCTION_PARITY=NOT_VERIFIED'
echo 'WOS_P8_PRODUCTION_DATABASE_ACCESSED=NO'
