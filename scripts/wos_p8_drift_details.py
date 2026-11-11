#!/usr/bin/env python3
"""Detailed nonproduction WOS P8 drift notes. No row data; never cloud connects."""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / ("docs/workshop-order-system/nonproduction-only/"
                   "wos_p8_production_drift_details_20261109.json")
QCOL = """
SELECT COALESCE(json_agg(x ORDER BY x.table_name),'[]'::json)::text FROM (
 SELECT table_name,json_agg(column_name ORDER BY ordinal_position) AS columns
 FROM information_schema.columns WHERE table_schema='public'
  AND table_name IN ('knowledge_cards','scripts','topics')
 GROUP BY table_name
) x;
"""
QPOL = """
SELECT COALESCE(json_agg(x ORDER BY x.tablename),'[]'::json)::text FROM (
 SELECT tablename,json_agg(policyname ORDER BY policyname) AS policies
 FROM pg_policies WHERE schemaname='public' GROUP BY tablename
) x;
"""


def local(sql):
    p = subprocess.run(["psql","-X","-t","-A","-v","ON_ERROR_STOP=1","-c",sql],
                       capture_output=True,text=True,check=True)
    return json.loads(p.stdout.strip())


def main():
    if (os.environ.get("PGHOST") != "localhost"
            or os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
            or os.environ.get("PGUSER") != "postgres"):
        raise SystemExit("WOS_P8_NONPRODUCTION_ONLY_GUARD=FAIL")
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if m.get("contains_customer_rows") is not False or len(m["column_targets"]) != 3:
        raise SystemExit("WOS_P8_PRODUCTION_SCHEMA_METADATA_INCOMPLETE")
    expected_columns = {x["table_name"]: set(x["columns"]) for x in m["column_targets"]}
    actual_columns = {x["table_name"]: set(x["columns"]) for x in local(QCOL)}
    columns = [
        {"table": n,"missing":sorted(expected_columns[n]-actual_columns.get(n,set())),
         "extra":sorted(actual_columns.get(n,set())-expected_columns[n])}
        for n in sorted(expected_columns)
        if expected_columns[n] != actual_columns.get(n,set())
    ]
    prod = {x["tablename"]:set(x["policies"]) for x in m["policy_names"]}
    test = {x["tablename"]:set(x["policies"]) for x in local(QPOL)}
    policies = [
        {"table": n,"missing":sorted(prod.get(n,set())-test.get(n,set())),
         "extra":sorted(test.get(n,set())-prod.get(n,set()))}
        for n in sorted(set(prod)|set(test))
        if prod.get(n,set()) != test.get(n,set())
    ]
    print("WOS_P8_COLUMN_DRIFT=" +
          json.dumps(columns,ensure_ascii=False,sort_keys=True))
    print("WOS_P8_POLICY_NAME_DRIFT=" +
          json.dumps(policies,ensure_ascii=False,sort_keys=True))
    print("WOS_P8_PRODUCTION_SCHEMA_PARITY=NOT_VERIFIED")
    print("WOS_P8_REAL_DATABASE_OR_CUSTOMER_ROWS_USED=NO")
    return 0


if __name__ == "__main__":
    sys.exit(main())
