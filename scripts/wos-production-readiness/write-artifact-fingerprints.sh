#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

output="${1:-docs/workshop-order-system/production-readiness/evidence/ARTIFACT_FINGERPRINTS_20261123.txt}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT INT TERM

files=(
  src/lib/workshop-orders/production-runtime-contract.ts
  tests/unit/workshop-order-production-runtime-contract.test.ts
  supabase/production-bootstrap/20261123_app_schema.sql
  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql
  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_ROLLBACK_NOT_AUTHORIZED.sql
  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_SMOKE_PG17.sql
  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RPC_ACTIVATION_TEMPLATE_NOT_AUTHORIZED.sql
  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RPC_DEACTIVATE_NOT_AUTHORIZED.sql
  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_FOUNDATION_CONTAINMENT_NOT_AUTHORIZED.sql
  docs/workshop-order-system/production-readiness/sql/V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql
  docs/workshop-order-system/production-readiness/sql/V1_APP_01_PROOF_RENEWAL_ROLLBACK_NOT_AUTHORIZED.sql
  src/app/api/workshop-orders/v1/route.ts
  src/app/workshop-orders/inbox/page.tsx
  src/app/workshop-orders/production/new/page.tsx
  src/components/workshop-orders/ProductionOfficeOrders.tsx
  src/components/workshop-orders/ProductionOfficeWorkflow.tsx
  src/components/workshop-orders/ProductionOrderForm.tsx
  src/components/workshop-orders/ProductionWorkshopInbox.tsx
  src/lib/workshop-orders/production-app-client.ts
  src/lib/workshop-orders/production-app-contract.ts
  src/lib/workshop-orders/production-app-handler.ts
  src/lib/workshop-orders/production-app-server.ts
  supabase/functions/_shared/wos-png-integrity.ts
  supabase/functions/wos-p7-verify-image/png.ts
  supabase/functions/wos-v1-verify-image/core.ts
  supabase/functions/wos-v1-verify-image/index.ts
  tests/unit/workshop-order-production-app-contract.test.ts
  tests/unit/workshop-order-production-app-http.test.ts
  tests/unit/workshop-order-production-edge-core.test.ts
  tests/sql/wos_production_bootstrap_fixture.sql
  tests/sql/wos_production_app_schema_signatures.sql
  tests/sql/wos_v1_production_runtime_security_signatures.sql
  tests/sql/wos_v1_production_concurrency_setup.sql
  tests/sql/wos_p8_p7_production_compatible_candidate.sql
  tests/sql/wos_p8_p7_service_proof_and_cleanup.sql
  tests/sql/wos_p8_p7_disposable_full_rollback.sql
  tests/sql/wos_p8_historical_acl_compensation.sql
  scripts/wos-p8/replay-history.mjs
  scripts/wos-p8/replay-manifest.json
  scripts/wos-p8/source-pins.mjs
  scripts/wos_p8_compare_public_catalog_signatures.py
  scripts/wos_p8_compare_function_trigger_grants.py
  scripts/wos_p8_reconcile_table_grants_ci_only.py
  scripts/wos-production-readiness/run-pg17-rehearsal.sh
  scripts/wos-production-readiness/run-runtime-concurrency.sh
  scripts/wos-production-readiness/verify-runtime-security-signatures.mjs
  scripts/wos-production-readiness/schema-signature-manifest.mjs
  docs/workshop-order-system/production-readiness/wos_v1_production_app_signature_manifest_20261123.json
  docs/workshop-order-system/production-readiness/wos_v1_runtime_security_inactive_manifest_20261123.json
  docs/workshop-order-system/production-readiness/wos_v1_runtime_security_active_manifest_20261123.json
  docs/workshop-order-system/production-readiness/evidence/pg17_rehearsal_20261123.log
  docs/workshop-order-system/production-readiness/evidence/wos_v1_runtime_security_signatures_20261123.ndjson
  docs/workshop-order-system/production-readiness/evidence/supabase_production_migration_list_20261123.txt
  docs/workshop-order-system/production-readiness/evidence/v1_app_01_pg17_rehearsal_20261123.log
  docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_SCHEMA_COMPATIBILITY_REPORT_20261123.md
  docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_MIGRATION_RUNBOOK_NOT_AUTHORIZED_20261123.md
  docs/workshop-order-system/production-readiness/WOS_V1_SOURCE_GAP_AUDIT_20261123.md
  docs/workshop-order-system/production-readiness/WOS_V1_FIRST_RELEASE_BLOCKERS_20261123.md
  docs/workshop-order-system/production-readiness/V1_APP_01_IMPLEMENTATION_REPORT.md
  docs/workshop-order-system/production-readiness/V1_APP_01_ROUTE_AND_EDGE_CONFIG.md
  scripts/wos-production-readiness/write-artifact-fingerprints.sh
)

{
  echo "# WOS V1 Production Readiness Artifact Fingerprints"
  echo "# Generated: 2026-11-23"
  echo "# Format: SHA256  GIT_BLOB_SHA1  PATH"
  echo
  for file in "${files[@]}"; do
    printf '%s  %s  %s\n' \
      "$(shasum -a 256 "$file" | awk '{print $1}')" \
      "$(git hash-object "$file")" \
      "$file"
  done
} > "$tmp"

mv "$tmp" "$output.tmp"
mv "$output.tmp" "$output"
echo "WOS_V1_ARTIFACT_FINGERPRINTS_WRITTEN=$output"
