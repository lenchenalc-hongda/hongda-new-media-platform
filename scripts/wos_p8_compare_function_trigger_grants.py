#!/usr/bin/env python3
"""WOS P8 metadata-only functions/triggers/table grants parity diagnostics.

Runs exclusively against disposable CI PostgreSQL, after local 29-migration
replay. Never accesses Prod, staff/customer records, or any Supabase secret.
"""
import csv
import io
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "docs/workshop-order-system/nonproduction-only/"
CHECKS = (
    ("functions", "wos_p8_production_public_function_signatures_20261109.json",
     "tests/sql/wos_p8_public_function_signatures.sql",
     "functions", ("name", "identity_args"),
     ("result_type","language","security_definer","volatility","settings",
      "definition_sig","anon_exec","auth_exec","service_exec")),
    ("triggers", "wos_p8_production_public_trigger_signatures_20261109.json",
     "tests/sql/wos_p8_public_trigger_signatures.sql",
     "triggers", ("table_name","trigger_name"),
     ("definition_sig","enabled_state")),
    ("table_grants", "wos_p8_production_public_table_grants_20261109.json",
     "tests/sql/wos_p8_public_table_grant_signatures.sql",
     "tables", ("table_name",), ("grants","grant_sig")),
)


def to_string(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    if isinstance(value, str) and value.lower() in ("t","f","true","false"):
        return "true" if value.lower() in ("t","true") else "false"
    return str(value)


def main():
    if (
        os.environ.get("PGHOST") != "localhost"
        or os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
        or os.environ.get("PGUSER") != "postgres"
    ):
        raise RuntimeError("WOS_P8_DISPOSABLE_ONLY_GUARD_FAILED")
    out = {}
    for name, manifest_path, query_path, attr, keys, fields in CHECKS:
        manifest = json.loads((ROOT / SOURCE / manifest_path).read_text())
        if manifest.get("contains_business_rows") is not False:
            raise RuntimeError("WOS_P8_METADATA_MANIFEST_MAY_CONTAIN_DATA")
        if manifest.get("project_ref") != "amqpvxrurenevniilhtl":
            raise RuntimeError("WOS_P8_WRONG_REFERENCE_PROJECT")
        baseline_rows = manifest[attr]
        run = subprocess.run(
            ["psql","-X","--csv","-v","ON_ERROR_STOP=1",
             "-f",str(ROOT / query_path)],
            check=True,capture_output=True,text=True
        )
        candidate_rows = list(csv.DictReader(io.StringIO(run.stdout)))
        k = lambda v: "|".join(to_string(v[x]) for x in keys)
        old = {k(r):r for r in baseline_rows}
        actual = {k(r):r for r in candidate_rows}
        if len(old)!=len(baseline_rows) or len(actual)!=len(candidate_rows):
            raise RuntimeError("WOS_P8_DUPLICATE_SIGNATURE_IDENTIFIER")
        missing = sorted(set(old)-set(actual))
        extra = sorted(set(actual)-set(old))
        changes = {}
        for field in fields:
            mismatches = [
                key for key in sorted(set(old)&set(actual))
                if to_string(old[key][field]).lower() != to_string(actual[key][field]).lower()
            ]
            changes[field] = {"count":len(mismatches),"first_8":mismatches[:8]}
        out[name] = {
            "production_count":len(old),"local_count":len(actual),
            "missing_count":len(missing),"missing_first_12":missing[:12],
            "extra_count":len(extra),"extra_first_12":extra[:12],
            "property_drift":changes,
        }
    print("WOS_P8_FUNCTION_TRIGGER_GRANT_PARITY=" +
          json.dumps(out,sort_keys=True))
    print("WOS_P8_LIVE_SUPABASE_AUTH_STORAGE_EDGE_PARITY=NOT_VERIFIED")
    print("WOS_P8_PRODUCTION_DATA_OR_WRITES=NONE")
    return 0


if __name__=="__main__":
    try:
        sys.exit(main())
    except (RuntimeError,ValueError,KeyError,OSError,subprocess.CalledProcessError) as exc:
        print("WOS_P8_METADATA_TEST_FAILED: " + str(exc),file=sys.stderr)
        sys.exit(1)
