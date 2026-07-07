#!/usr/bin/env bash
# ===== Post-Build Secret Leakage Auditor =====
# Check .next/static JS bundles for any leaked secret keys.
# Fail the build if any are found.
#
# Usage: bash scripts/audit-bundle-secrets.sh
# Called automatically by next.config.mjs after build.

set -euo pipefail

BUNDLE_DIR=".next/static"
SECRET_PATTERNS=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "sb_secret"
  "service_role"
  "OPENAI_API_KEY"
  "WECHAT_VIDEO_ACCESS_TOKEN"
  "WECHAT_APP_SECRET"
  "DOUYIN_CLIENT_SECRET"
)

ERRORS=0

echo "🔍 Auditing built bundles for secret key leakage..."
echo "  Target: $BUNDLE_DIR"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "  ⚠️  Bundle directory not found. Skipping audit (build may not have run yet)."
  exit 0
fi

for pattern in "${SECRET_PATTERNS[@]}"; do
  # Search for the actual pattern as a string assignment, not just variable reference
  # e.g., "process.env.SUPABASE_SERVICE_ROLE_KEY" in built code is OK (it's a reference)
  # But a hardcoded "sk_live_xxx" or the actual key value is NOT OK
  # For safety, we check for any occurrence of the pattern name
  MATCHES=$(rg -l "$pattern" "$BUNDLE_DIR" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo "  ❌ FOUND: '$pattern' leaked in:"
    echo "$MATCHES" | sed 's/^/      - /'
    ERRORS=$((ERRORS + 1))
  fi
done

# Also check for .map files (which contain source code)
for pattern in "${SECRET_PATTERNS[@]}"; do
  MAP_MATCHES=$(rg -l "$pattern" "$BUNDLE_DIR" --glob '*.map' 2>/dev/null || true)
  if [ -n "$MAP_MATCHES" ]; then
    echo "  ⚠️  Source map leak: '$pattern' found in .map files (harmless if .map not deployed)"
  fi
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌❌❌ SECRET LEAKAGE DETECTED! $ERRORS pattern(s) found in built bundles."
  echo "   This means a secret env var was inlined into the client-side JS bundle."
  echo "   Fix: ensure the module using the secret has '// @server-only' marker"
  echo "   and is never imported by a 'use client' component."
  exit 1
fi

echo "  ✅ No secret keys leaked in static bundles."
exit 0
