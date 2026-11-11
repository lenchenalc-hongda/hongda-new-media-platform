#!/usr/bin/env python3
"""Report metadata-only drift between observed Production public tables and disposable PG17.

THIS IS A DIAGNOSTIC: running the legacy minimum is not full Production parity.
Never read or export row data. Never connect to any Supabase endpoint.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

INVENTORY = (
    "docs/workshop-order-system/nonproduction-only/"
    "wos_p8_production_public_table_inventory_20261109.json"
)
SQL = """
SELECT COALESCE(json_agg(x ORDER BY x.table_name), '[]'::json)::text
FROM (
 SELECT t.table_name, count(c.column_name)::int AS column_count,
  COALESCE((SELECT cls.relrowsecurity
   FROM pg_class cls JOIN pg_namespace ns ON ns.oid=cls.relnamespace
   WHERE ns.nspname='public' AND cls.relname=t.table_name),false) AS rls_enabled,
  COALESCE((SELECT count(*)::int FROM pg_policies p
   WHERE p.schemaname='public' AND p.tablename=t.table_name),0) AS policy_count
 FROM information_schema.tables t
 LEFT JOIN information_schema.columns c
  ON c.table_schema=t.table_schema AND c.table_name=t.table_name
 WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
 GROUP BY t.table_name
) x;
"""


def main():
    if (
        os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
        or os.environ.get("PGHOST") != "localhost"
        or os.environ.get("PGUSER") != "postgres"
    ):
        raise SystemExit("WOS_P8_DISPOSABLE_ONLY_GUARD=FAIL")
    root = Path(__file__).resolve().parents[1]
    metadata = json.loads((root / INVENTORY).read_text(encoding="utf-8"))
    reference = metadata.get("public_tables")
    if (
        metadata.get("expected_table_count") != 67
        or metadata.get("contains_business_rows") is not False
        or not isinstance(reference, list)
        or len(reference) != 67
    ):
        raise SystemExit("WOS_P8_INVALID_PRODUCTION_METADATA_INVENTORY")

    proc = subprocess.run(
        ["psql", "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", SQL],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    actual = json.loads(proc.stdout.strip())
    prod = {x["table_name"]: x for x in reference}
    local = {x["table_name"]: x for x in actual}
    if len(prod) != len(reference) or len(local) != len(actual):
        raise SystemExit("WOS_P8_DUPLICATE_TABLE_NAME_IN_METADATA")

    missing = sorted(prod.keys() - local.keys())
    extra = sorted(local.keys() - prod.keys())
    columns = sorted(
        name for name in prod.keys() & local.keys()
        if prod[name]["column_count"] != local[name]["column_count"]
    )
    rls = sorted(
        name for name in prod.keys() & local.keys()
        if prod[name]["rls_enabled"] != local[name]["rls_enabled"]
    )
    policies = sorted(
        name for name in prod.keys() & local.keys()
        if prod[name]["policy_count"] != local[name]["policy_count"]
    )
    report = {
        "WOS_P8_LOCAL_TABLES": len(local),
        "WOS_P8_PRODUCTION_TABLE_METADATA": len(prod),
        "missing_count": len(missing),
        "extra_count": len(extra),
        "different_column_counts": len(columns),
        "different_rls_flags": len(rls),
        "different_policy_counts": len(policies),
        "missing_first_15": missing[:15],
        "extra_first_15": extra[:15],
        "column_drift_first_15": columns[:15],
        "schema_parity_status": "NOT_VERIFIED",
        "source_sql_identity": "UNATTESTED",
        "uses_customer_rows": False,
        "connects_to_production": False,
    }
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    # This is only a diagnostic job. Later exact clone is a separate hard gate.
    return 0


if __name__ == "__main__":
    sys.exit(main())
