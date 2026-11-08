#!/usr/bin/env python3
"""Compare Production table catalog *hashes* with disposable PG17 after convergence.

Read-only SELECTs only. No Production network/API, no secrets and no row data.
Hash match does not establish production-equivalence of extensions/Auth/Storage.
"""
import csv
import io
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / ("docs/workshop-order-system/nonproduction-only/"
                    "wos_p8_public_catalog_signatures_20261109.json")
QUERY = ROOT / "tests/sql/wos_p8_public_catalog_signatures.sql"


def main():
    if (
        os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
        or os.environ.get("PGHOST") != "localhost"
        or os.environ.get("PGUSER") != "postgres"
    ):
        raise RuntimeError("WOS_P8_PUBLIC_CATALOG_LOCAL_ONLY_GUARD")
    meta = json.loads(REFERENCE.read_text(encoding="utf-8"))
    prod_rows = meta["public_catalog_signature_rows"]
    if (meta.get("project_ref") != "amqpvxrurenevniilhtl"
            or meta.get("contains_customer_rows") is not False
            or meta.get("expected_table_count") != 67
            or len(prod_rows) != 67
            or len({x["table_name"] for x in prod_rows}) != 67):
        raise RuntimeError("WOS_P8_UNRELIABLE_CATALOG_METADATA")
    proc = subprocess.run(
        ["psql", "-X", "--csv", "-v", "ON_ERROR_STOP=1", "-f", str(QUERY)],
        check=True, capture_output=True, text=True
    )
    local_rows = list(csv.DictReader(io.StringIO(proc.stdout)))
    prod = {x["table_name"]: x for x in prod_rows}
    local = {x["table_name"]: x for x in local_rows}
    if len(local) != 67 or set(prod) != set(local):
        raise RuntimeError("WOS_P8_PUBLIC_TABLE_NAME_PARITY_REGRESSION")

    numeric_keys = ("columns", "indexes", "constraints", "policies")
    digest_keys = ("column_sig", "index_sig", "constraint_sig", "policy_sig")
    diffs = {}
    for key in numeric_keys + digest_keys:
        mismatched = [
            table for table in sorted(prod)
            if str(prod[table][key]) != str(local[table][key])
        ]
        diffs[key] = {"count": len(mismatched), "tables_first_20": mismatched[:20]}
    print("WOS_P8_PUBLIC_CATALOG_SIGNATURE_REPORT=" +
          json.dumps(diffs, sort_keys=True))
    print("WOS_P8_PRODUCTION_PUBLIC_SCHEMA_SIGNATURE_EQUAL=" +
          ("YES" if all(not diff["count"] for diff in diffs.values()) else "NO"))
    print("WOS_P8_WIDER_SUPABASE_SCHEMA_STORAGE_EDGE_PARITY=NOT_VERIFIED")
    print("WOS_P8_PUBLIC_DATA_OR_REAL_SUPABASE_WRITES=NONE")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, KeyError, ValueError, RuntimeError, subprocess.CalledProcessError) as e:
        print("WOS_P8_PUBLIC_CATALOG_SIGNATURE_CHECK_FAILED: " + str(e),
              file=sys.stderr)
        sys.exit(1)
