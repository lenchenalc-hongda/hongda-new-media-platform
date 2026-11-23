#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${WOS_PG_DOCKER_CONTAINER:-}"
BOOTSTRAP_DB="wos_prod_bootstrap_ci"
HISTORY_DB="wos_p8_replay_ci"
MANIFEST="$ROOT/docs/workshop-order-system/production-readiness/wos_v1_production_app_signature_manifest_20261123.json"
RUNTIME_FORWARD="docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql"
RUNTIME_ROLLBACK="docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_ROLLBACK_NOT_AUTHORIZED.sql"
RUNTIME_SMOKE="docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_SMOKE_PG17.sql"
RUNTIME_ACTIVATION="docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RPC_ACTIVATION_TEMPLATE_NOT_AUTHORIZED.sql"
RUNTIME_DEACTIVATE="docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RPC_DEACTIVATE_NOT_AUTHORIZED.sql"
RUNTIME_SECURITY_SIGNATURES="docs/workshop-order-system/production-readiness/evidence/wos_v1_runtime_security_signatures_20261123.ndjson"

fail() {
  printf 'WOS_V1_PG17_REHEARSAL_FAILED=%s\n' "$1" >&2
  exit 1
}

[[ -n "$CONTAINER" ]] || fail 'CONTAINER_REQUIRED'
[[ "$CONTAINER" =~ ^codex-wos-prod-readiness-pg17-[A-Za-z0-9_.-]+$ ]] \
  || fail 'CONTAINER_NAME_NOT_OWNED'
[[ -S /var/run/docker.sock ]] || fail 'LOCAL_DOCKER_SOCKET_REQUIRED'

unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGOPTIONS
unset DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SERVICE_ROLE_KEY

CONTAINER_ID="$(docker inspect --format '{{.Id}}' "$CONTAINER")" \
  || fail 'CONTAINER_NOT_FOUND'
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_ID")" = 'true' ]] \
  || fail 'CONTAINER_NOT_RUNNING'
[[ "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")" = 'postgres:17-alpine' ]] \
  || fail 'POSTGRES17_ALPINE_REQUIRED'
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$CONTAINER_ID")" = 'none' ]] \
  || fail 'CONTAINER_NETWORK_MUST_BE_DISABLED'
[[ "$(docker inspect --format '{{index .Config.Labels "com.hongda.wos.disposable-pg17"}}' "$CONTAINER_ID")" = 'true' ]] \
  || fail 'DISPOSABLE_LABEL_REQUIRED'
[[ "$(docker inspect --format '{{index .Config.Labels "com.hongda.wos.test-purpose"}}' "$CONTAINER_ID")" = 'wos-v1-production-readiness' ]] \
  || fail 'TEST_PURPOSE_LABEL_REQUIRED'

psql_db() {
  local database="$1"
  shift
  docker exec -i "$CONTAINER_ID" env -u PGHOST -u PGPORT -u PGUSER \
    -u PGPASSWORD -u PGDATABASE -u PGOPTIONS -u DATABASE_URL \
    -u DIRECT_URL -u SUPABASE_URL -u SUPABASE_DB_URL -u SERVICE_ROLE_KEY \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"
}

apply_file() {
  local database="$1"
  local file="$2"
  psql_db "$database" -q < "$ROOT/$file"
}

apply_authorized_activation() {
  local database="$1"
  local file="$2"
  {
    printf "SET wos_v1.production_activation_authorized = 'yes';\n"
    cat "$ROOT/$file"
  } | psql_db "$database" -q
}

write_runtime_security_signatures() {
  local database="$1"
  local file="$2"
  psql_db "$database" -qAt \
    < "$ROOT/tests/sql/wos_v1_production_runtime_security_signatures.sql" \
    > "$file"
}

recreate_db() {
  local database="$1"
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$database\" WITH (FORCE)"
  psql_db postgres -q -c "CREATE DATABASE \"$database\""
}

query_value() {
  local database="$1"
  local sql="$2"
  psql_db "$database" -qAt -c "$sql"
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$BOOTSTRAP_DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  psql_db postgres -q -c "DROP DATABASE IF EXISTS \"$HISTORY_DB\" WITH (FORCE)" \
    >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

[[ "$(query_value postgres "SELECT current_setting('server_version_num')::integer BETWEEN 170000 AND 179999")" = 't' ]] \
  || fail 'POSTGRESQL17_REQUIRED'

recreate_db "$BOOTSTRAP_DB"
apply_file "$BOOTSTRAP_DB" tests/sql/wos_production_bootstrap_fixture.sql
apply_file "$BOOTSTRAP_DB" supabase/production-bootstrap/20261123_app_schema.sql

[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")" = '67' ]] \
  || fail 'BOOTSTRAP_PUBLIC_TABLE_COUNT'
[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM public.organizations")" = '0' ]] \
  || fail 'BOOTSTRAP_ORGANIZATION_DATA_PRESENT'
[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM public.profiles")" = '0' ]] \
  || fail 'BOOTSTRAP_PROFILE_DATA_PRESENT'
[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_%'")" = '0' ]] \
  || fail 'BOOTSTRAP_WOS_MUST_BE_ABSENT'

psql_db "$BOOTSTRAP_DB" -qAt \
  < "$ROOT/tests/sql/wos_production_app_schema_signatures.sql" \
  > /tmp/wos-v1-bootstrap-signatures.ndjson
node "$ROOT/scripts/wos-production-readiness/schema-signature-manifest.mjs" \
  verify /tmp/wos-v1-bootstrap-signatures.ndjson "$MANIFEST"

recreate_db "$HISTORY_DB"

WRAPPER_DIR="$(mktemp -d)"
cat > "$WRAPPER_DIR/psql" <<WRAPPER
#!/usr/bin/env python3
import os
import subprocess
import sys

container = "$CONTAINER_ID"
args = list(sys.argv[1:])
stdin = None
if "-f" in args:
    index = args.index("-f")
    file_name = args[index + 1]
    del args[index:index + 2]
    with open(file_name, "rb") as handle:
        stdin = handle.read()
command = [
    "docker", "exec", "-i", container, "psql",
    "-U", os.environ.get("PGUSER", "postgres"),
    "-d", os.environ.get("PGDATABASE", "postgres"),
    *args,
]
raise SystemExit(subprocess.run(command, input=stdin).returncode)
WRAPPER
chmod +x "$WRAPPER_DIR/psql"

PATH="$WRAPPER_DIR:$PATH" \
PGHOST=localhost \
PGDATABASE="$HISTORY_DB" \
PGUSER=postgres \
node "$ROOT/scripts/wos-p8/replay-history.mjs" --ci

apply_file "$HISTORY_DB" tests/sql/wos_p8_production_missing_policy_reconcile.sql
apply_file "$HISTORY_DB" tests/sql/wos_p8_historical_function_compensation.sql
apply_file "$HISTORY_DB" tests/sql/wos_p8_historical_acl_compensation.sql

PATH="$WRAPPER_DIR:$PATH" \
PGHOST=localhost \
PGDATABASE="$HISTORY_DB" \
PGUSER=postgres \
python3 "$ROOT/scripts/wos_p8_reconcile_table_grants_ci_only.py"

PATH="$WRAPPER_DIR:$PATH" \
PGHOST=localhost \
PGDATABASE="$HISTORY_DB" \
PGUSER=postgres \
python3 "$ROOT/scripts/wos_p8_compare_public_catalog_signatures.py"

PATH="$WRAPPER_DIR:$PATH" \
PGHOST=localhost \
PGDATABASE="$HISTORY_DB" \
PGUSER=postgres \
python3 "$ROOT/scripts/wos_p8_compare_function_trigger_grants.py"

psql_db "$HISTORY_DB" -qAt \
  < "$ROOT/tests/sql/wos_production_app_schema_signatures.sql" \
  > /tmp/wos-v1-history-signatures.ndjson
node "$ROOT/scripts/wos-production-readiness/schema-signature-manifest.mjs" \
  verify /tmp/wos-v1-history-signatures.ndjson "$MANIFEST"

apply_file "$BOOTSTRAP_DB" supabase/migrations/20261014102000_workshop_order_system_foundation.sql
apply_file "$BOOTSTRAP_DB" tests/sql/wos_p8_p7_production_compatible_candidate.sql
apply_file "$BOOTSTRAP_DB" tests/sql/wos_p8_p7_service_proof_and_cleanup.sql
apply_file "$BOOTSTRAP_DB" "$RUNTIME_FORWARD"

[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_%'")" = '19' ]] \
  || fail 'WOS_RUNTIME_TABLE_COUNT'

write_runtime_security_signatures \
  "$BOOTSTRAP_DB" "$ROOT/$RUNTIME_SECURITY_SIGNATURES"
node "$ROOT/scripts/wos-production-readiness/verify-runtime-security-signatures.mjs" \
  "$ROOT/$RUNTIME_SECURITY_SIGNATURES" installed-inactive

apply_authorized_activation "$BOOTSTRAP_DB" "$RUNTIME_ACTIVATION"
write_runtime_security_signatures \
  "$BOOTSTRAP_DB" /tmp/wos-v1-runtime-security-active.ndjson
node "$ROOT/scripts/wos-production-readiness/verify-runtime-security-signatures.mjs" \
  /tmp/wos-v1-runtime-security-active.ndjson activated

apply_file "$BOOTSTRAP_DB" "$RUNTIME_DEACTIVATE"
write_runtime_security_signatures \
  "$BOOTSTRAP_DB" /tmp/wos-v1-runtime-security-deactivated.ndjson
node "$ROOT/scripts/wos-production-readiness/verify-runtime-security-signatures.mjs" \
  /tmp/wos-v1-runtime-security-deactivated.ndjson installed-inactive

if psql_db "$BOOTSTRAP_DB" -q < "$ROOT/$RUNTIME_FORWARD" \
    > /tmp/wos-v1-duplicate-install.log 2>&1; then
  fail 'DUPLICATE_RUNTIME_INSTALL_ACCEPTED'
fi
grep -q 'WOS_V1_RUNTIME_ALREADY_PARTIALLY_INSTALLED' \
  /tmp/wos-v1-duplicate-install.log \
  || fail 'DUPLICATE_RUNTIME_INSTALL_WRONG_ERROR'

apply_file "$BOOTSTRAP_DB" "$RUNTIME_SMOKE"
WOS_PG_DOCKER_CONTAINER="$CONTAINER_ID" \
  bash "$ROOT/scripts/wos-production-readiness/run-runtime-concurrency.sh"
apply_file "$BOOTSTRAP_DB" "$RUNTIME_ROLLBACK"
apply_file "$BOOTSTRAP_DB" tests/sql/wos_p8_p7_disposable_full_rollback.sql

[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")" = '67' ]] \
  || fail 'ROLLBACK_TABLE_COUNT'
[[ "$(query_value "$BOOTSTRAP_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_%'")" = '0' ]] \
  || fail 'ROLLBACK_WOS_PRESENT'

psql_db "$BOOTSTRAP_DB" -qAt \
  < "$ROOT/tests/sql/wos_production_app_schema_signatures.sql" \
  > /tmp/wos-v1-rollback-signatures.ndjson
node "$ROOT/scripts/wos-production-readiness/schema-signature-manifest.mjs" \
  verify /tmp/wos-v1-rollback-signatures.ndjson "$MANIFEST"

echo 'WOS_V1_PG17_SCHEMA_BOOTSTRAP=PASS'
echo 'WOS_V1_PG17_HISTORICAL_LINEAGE_REPLAY=PASS'
echo 'WOS_V1_PG17_PUBLIC_AND_COMMERCIAL_SCHEMA_PARITY=PASS'
echo 'WOS_V1_PG17_WOS_RUNTIME_LIFECYCLE=PASS'
echo 'WOS_V1_PG17_RPC_ACL_ACTIVATION_AND_DEACTIVATION=PASS'
echo 'WOS_V1_PG17_CONCURRENT_VERSION_CAS=PASS'
echo 'WOS_V1_PG17_DUPLICATE_INSTALL_REJECTED=PASS'
echo 'WOS_V1_PG17_FULL_ROLLBACK_PARITY=PASS'
echo 'WOS_V1_PG17_CPC_GLH_COMMERCIAL_NO_DRIFT=PASS'
