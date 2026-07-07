#!/usr/bin/env bash
# ===== Pre-Build Server-Only Import Checker =====
# Ensures no @server-only module is imported by a 'use client' file.
#
# Usage: bash scripts/check-server-imports.sh

set -euo pipefail

SRC_DIR="src"
ERRORS=0

# Find all @server-only marked files
SERVER_FILES=$(rg -l "@server-only" "$SRC_DIR" --type ts --type tsx 2>/dev/null || true)

if [ -z "$SERVER_FILES" ]; then
  echo "✅ No @server-only files found. Nothing to check."
  exit 0
fi

echo "🔍 Checking that @server-only files are not imported by client components..."

for server_file in $SERVER_FILES; do
  # Get the file's module path (no extension)
  module_path="${server_file%.*}"
  module_import="${module_path#src/}"
  
  # Remove the @server-only comment line and any extension suffix for matching
  # e.g., src/lib/ai/service.ts -> lib/ai/service
  module_key=$(echo "$module_import" | sed 's/\.\(ts\|tsx\)$//')
  
  # Find all files that import this module and have 'use client'
  IMPORTS=$(rg -l "from ['\"].*${module_key}['\"]" "$SRC_DIR" --type ts --type tsx 2>/dev/null || true)
  
  for importer in $IMPORTS; do
    # Check if the importer is a 'use client' file
    if head -3 "$importer" | grep -q "'use client'"; then
      echo "  ❌ ILLEGAL IMPORT: '$server_file' is @server-only"
      echo "     but imported by client component: '$importer'"
      ERRORS=$((ERRORS + 1))
    fi
  done
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌❌❌ $ERRORS illegal import(s) found. Fix them to prevent secret leakage."
  exit 1
fi

echo "  ✅ No @server-only modules leak into client code."
exit 0
