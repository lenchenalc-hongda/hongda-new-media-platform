#!/usr/bin/env python3
"""WOS P8 legacy-only metadata reconciliation, disposable PG17 ONLY.

This is NOT a production schema migration. Only run after the full 29-source
synthetic migration replay. Changes ONLY a one-time PostgreSQL 17 CI service.
Fails if any unexpected drift is present, and never runs against Supabase.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META = ROOT / ("docs/workshop-order-system/nonproduction-only/"
               "wos_p8_production_drift_details_20261109.json")
EXPECTED_EXTRA_COLUMNS = {
    "knowledge_cards": {
        "applicable_customers", "applicable_platforms", "card_type",
        "content_scope", "forbidden_expressions", "knowledge_status",
        "last_updated_at", "linked_script_ids", "linked_topic_ids",
        "owner_id", "reviewer_id", "risky_expressions",
        "safer_alternatives", "usage_count",
    },
    "scripts": {
        "grade", "recommended_status", "rewrite_suggestions", "risk_level",
        "risk_points", "safer_expressions", "score", "score_detail",
        "strengths", "weaknesses",
    },
    "topics": {
        "case_refs", "comment_guidance", "content_angle", "content_purpose",
        "core_point", "faq_refs", "is_this_week", "knowledge_refs",
        "last_action", "linked_post_id", "linked_script_id", "logo_risk",
        "material", "owner_id", "planned_publish_date", "planned_shoot_date",
        "platform", "privacy_risk", "private_message_action",
        "product_process", "required_factory_assets", "required_products",
        "required_shots", "review_refs", "risk_level", "risk_result",
        "risk_rules", "score_detail", "script_status", "shooting_method",
        "target_customer", "topic_score", "topic_source", "video_length",
        "viral_refs", "why_user_watch",
    },
}
EXPECTED_EXTRA_POLICIES = {
    "accounts": {
        "Read accounts: admin/manager/operator/viewer",
        "Update accounts: admin/manager", "Write accounts: admin only",
    },
    "knowledge_cards": {
        "Approve knowledge: admin/manager only",
        "Read knowledge: admin/manager/operator/viewer",
        "Write knowledge: admin/operator",
    },
    "leads": {
        "Delete leads: admin only", "Read leads: admin/manager",
        "Update leads: admin/manager", "Viewer cannot read leads",
        "Write leads: admin/operator/sales",
    },
    "posts": {
        "Read posts: admin/manager/operator/viewer",
        "Write posts: admin/operator",
    },
    "scripts": {
        "Approve scripts: admin/manager",
        "Read scripts: admin/manager/operator/viewer",
        "Write scripts: admin/operator",
    },
    "topics": {
        "Delete topics: admin only",
        "Read topics: admin/manager/operator/viewer",
        "Write topics: admin/operator",
    },
    "site_data": {"anyone_insert", "anyone_select", "anyone_update"},
}
EXPECTED_MISSING_POLICIES = {
    "site_data": {"anon_insert", "anon_select", "anon_update"}
}
COLUMN_QUERY = """
SELECT COALESCE(json_agg(x ORDER BY x.table_name),'[]'::json)::text
FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) AS columns
 FROM information_schema.columns WHERE table_schema='public'
 AND table_name IN ('knowledge_cards','scripts','topics')
 GROUP BY table_name) x;
"""
POLICY_QUERY = """
SELECT COALESCE(json_agg(x ORDER BY x.tablename),'[]'::json)::text
FROM (SELECT tablename,json_agg(policyname ORDER BY policyname) AS policies
 FROM pg_policies WHERE schemaname='public' GROUP BY tablename) x;
"""


def fail(reason):
    raise RuntimeError("WOS_P8_GUARDED_CANDIDATE_RECONCILIATION_DENIED: " + reason)


def checked_pg():
    if (
        os.environ.get("PGHOST") != "localhost"
        or os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
        or os.environ.get("PGUSER") != "postgres"
    ):
        fail("only one-time localhost wos_p8_lineage_ci database is allowed")


def sql_query(text):
    r = subprocess.run(
        ["psql", "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", text],
        capture_output=True, check=True, text=True
    )
    return json.loads(r.stdout.strip())


def quote(identifier):
    # Policy names contain spaces, colons and '/' in the historical schema.
    # SQL identifiers are NOT SQL strings; permit a narrow, fixed alphabet
    # and always double-quote. Names must already match the exact allowlist.
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ /:-")
    if (not isinstance(identifier, str) or not identifier or
            len(identifier) > 120 or any(c not in allowed for c in identifier)):
        fail("unexpected identifier")
    return '"' + identifier + '"'


def main():
    checked_pg()
    manifest = json.loads(META.read_text(encoding="utf-8"))
    if (manifest.get("project_ref") != "amqpvxrurenevniilhtl"
            or manifest.get("contains_customer_rows") is not False
            or len(manifest.get("column_targets", [])) != 3):
        fail("unverified zero-data Production metadata")

    expected = {x["table_name"]: set(x["columns"])
                for x in manifest["column_targets"]}
    observed = {x["table_name"]: set(x["columns"])
                for x in sql_query(COLUMN_QUERY)}
    column_extra = {name: observed.get(name, set()) - vals
                    for name, vals in expected.items()}
    column_missing = {name: vals - observed.get(name, set())
                      for name, vals in expected.items()}
    if column_extra != EXPECTED_EXTRA_COLUMNS:
        fail("new or unexpected extra fields detected")
    if any(column_missing.values()):
        fail("some required Production fields are missing")

    prod = {x["tablename"]: set(x["policies"])
            for x in manifest["policy_names"]}
    test = {x["tablename"]: set(x["policies"])
            for x in sql_query(POLICY_QUERY)}
    all_tables = sorted(set(prod) | set(test))
    extra = {name: test.get(name, set()) - prod.get(name, set())
             for name in all_tables if test.get(name, set()) - prod.get(name, set())}
    missing = {name: prod.get(name, set()) - test.get(name, set())
               for name in all_tables if prod.get(name, set()) - test.get(name, set())}
    if extra != EXPECTED_EXTRA_POLICIES or missing != EXPECTED_MISSING_POLICIES:
        fail("policy-set mismatch is not the independently reviewed allowlist")

    # No business data: discard the test transaction if any fake or actual Auth
    # users exist. We never touch any live Supabase database or Storage schema.
    statement = [
        "BEGIN;",
        """DO $guard$ BEGIN
         IF current_database()<>'wos_p8_lineage_ci'
          OR (SELECT count(*) FROM auth.users)<>0
          OR (SELECT count(*) FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE')<>67
         THEN RAISE EXCEPTION 'WOS_P8_ONE_TIME_CI_SCHEMA_GUARD'; END IF;
         END $guard$;"""
    ]
    for table, names in sorted(EXPECTED_EXTRA_POLICIES.items()):
        if table == "site_data":
            continue
        for name in sorted(names):
            statement.append("DROP POLICY " + quote(name)
                             + " ON public." + quote(table) + ";")
    for name in sorted(EXPECTED_EXTRA_POLICIES["site_data"]):
        new = name.replace("anyone_", "anon_", 1)
        statement.append("ALTER POLICY " + quote(name) + " ON public.site_data "
                         + "RENAME TO " + quote(new) + ";")
    for table, names in sorted(EXPECTED_EXTRA_COLUMNS.items()):
        for name in sorted(names):
            # Deliberately no CASCADE. If a dependency exists, abort the
            # entire transaction rather than modifying another object.
            statement.append("ALTER TABLE public." + quote(table)
                             + " DROP COLUMN " + quote(name) + ";")
    statement.append("COMMIT;")
    proc = subprocess.run(
        ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
        input="\n".join(statement) + "\n",
        capture_output=True, check=False, text=True
    )
    if proc.returncode != 0:
        fail("transaction aborted: " + proc.stderr[-1500:])

    new_columns = {x["table_name"]: set(x["columns"])
                   for x in sql_query(COLUMN_QUERY)}
    new_policies = {x["tablename"]: set(x["policies"])
                    for x in sql_query(POLICY_QUERY)}
    if new_columns != expected or new_policies != prod:
        fail("post-cleanup column/policy name inventory differs from Production")
    print("WOS_P8_DISPOSABLE_LEGACY_FIELD_POLICY_PARITY=PASS")
    print("WOS_P8_TRUE_PRODUCTION_SCHEMA_PARITY=NOT_VERIFIED")
    print("WOS_P8_PRODUCTION_OR_QA_DATABASE_WRITES=NO")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
