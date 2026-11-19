#!/usr/bin/env python3
"""Reconcile only explicit table grant metadata in disposable PG17, never Prod.

Derived from read-only Production pg_catalog metadata. No business rows.
Used to find default privilege/RLS differences, not a Production migration.
"""
import csv
import io
import json
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/workshop-order-system/nonproduction-only/"
DETAILS = BASE / "wos_p8_production_public_grant_details_20261109.json"
EXPECTED = BASE / "wos_p8_production_public_table_grants_20261109.json"
QUERY = ROOT / "tests/sql/wos_p8_public_table_grant_signatures.sql"
ROLES = ("anon", "authenticated", "service_role")
PRIVS = {"SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"}


def quote_name(s):
    if not s or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789_" for c in s):
        raise ValueError("bad table identifier")
    return '"' + s + '"'


def rows_from_psql(query_path):
    p = subprocess.run(
        ["psql","-X","--csv","-v","ON_ERROR_STOP=1","-f",str(query_path)],
        capture_output=True,text=True,check=True
    )
    return list(csv.DictReader(io.StringIO(p.stdout)))


def main():
    if (os.environ.get("PGHOST") != "localhost"
            or os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
            or os.environ.get("PGUSER") != "postgres"):
        raise RuntimeError("WOS_P8_DISPOSABLE_ONLY_GRANTS_GUARD")
    detail = json.loads(DETAILS.read_text())
    manifest = json.loads(EXPECTED.read_text())
    if (detail.get("project_ref") != "amqpvxrurenevniilhtl"
            or manifest.get("project_ref") != "amqpvxrurenevniilhtl"
            or detail.get("contains_business_rows") is not False
            or manifest.get("contains_business_rows") is not False
            or len(detail.get("records",[])) != 371
            or len(manifest.get("tables",[])) != 67):
        raise RuntimeError("WOS_P8_INVALID_PRODUCTION_GRANT_REFERENCE")

    tables = sorted(x["table_name"] for x in manifest["tables"])
    if len(tables)!=len(set(tables)):
        raise RuntimeError("duplicated table in reference")
    perms = defaultdict(lambda:defaultdict(set))
    seen = set()
    for rec in detail["records"]:
        table,role,priv = rec["table_name"],rec["grantee"],rec["privilege_type"]
        if table not in tables or role not in ROLES or priv not in PRIVS:
            raise RuntimeError("unexpected role or privilege in reference")
        key = (table,role,priv)
        if key in seen:
            raise RuntimeError("duplicate grant")
        seen.add(key)
        perms[table][role].add(priv)

    expected = {x["table_name"]: (str(x["grants"]), x["grant_sig"])
                for x in manifest["tables"]}
    local_before = {x["table_name"] for x in rows_from_psql(QUERY)}
    if local_before != set(tables):
        raise RuntimeError("public table set differs from reference")

    commands = ["BEGIN;",
        """DO $gate$ BEGIN
         IF current_database()<>'wos_p8_lineage_ci'
           OR (SELECT count(*) FROM auth.users)<>0
           OR (SELECT count(*) FROM information_schema.tables
             WHERE table_schema='public' AND table_type='BASE TABLE')<>67
         THEN RAISE EXCEPTION 'WOS_P8_GRANT_CI_ONLY_GUARD'; END IF;
         END $gate$;"""
    ]
    for table in tables:
        table_quoted = "public."+quote_name(table)
        commands.append("REVOKE ALL ON TABLE "+table_quoted+
                        " FROM anon,authenticated,service_role;")
        for role in ROLES:
            p = sorted(perms[table][role])
            if p:
                commands.append("GRANT "+",".join(p)+" ON TABLE "+table_quoted+
                                " TO "+role+";")
    commands.append("COMMIT;")
    proc = subprocess.run(
        ["psql","-X","-q","-v","ON_ERROR_STOP=1"],
        input="\n".join(commands)+"\n",capture_output=True,text=True
    )
    if proc.returncode:
        raise RuntimeError("WOS_P8_GRANT_TX_ABORTED: "+proc.stderr[-1300:])
    actual = {x["table_name"]: (x["grants"],x["grant_sig"])
              for x in rows_from_psql(QUERY)}
    failures = [x for x in tables if actual.get(x)!=expected[x]]
    if failures:
        raise RuntimeError("WOS_P8_EXPLICIT_GRANT_PARITY_FAILED: "+str(failures[:12]))
    print("WOS_P8_DISPOSABLE_EXPLICIT_TABLE_GRANT_PARITY=PASS")
    print("WOS_P8_EFFECTIVE_PRODUCTION_ACL_AUTH_API_PARITY=NOT_VERIFIED")
    print("WOS_P8_PRODUCTION_ROLE_CHANGES=NONE")
    return 0


if __name__=="__main__":
    try:
        sys.exit(main())
    except (RuntimeError,OSError,KeyError,ValueError,subprocess.CalledProcessError) as e:
        print(str(e),file=sys.stderr)
        sys.exit(1)
