#!/usr/bin/env python3
"""WOS P8 *candidate* full SQL replay in a one-time GitHub PostgreSQL service.

Never attach real Supabase credentials, connection strings, customer rows,
Production data, or paid cloud resources. This intentionally does NOT certify
a real Supabase 67-table schema clone; historical bootstrap is only a candidate.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / (
    "docs/workshop-order-system/nonproduction-only/"
    "wos_p8_production_migration_lineage_20261109.json"
)
# Reviewed historical schema changes that were installed outside the 29
# Production migration registry entries. Some early July/OA scripts are
# excluded because their actual historical application remains unverified.
CANDIDATE_LEGACY_TAIL = (
    "20260708_site_data.sql",
    "20260817_review_center_phase2_policy_role_hardening.sql",
    "20260818_review_center_phase2_draft_mutation_foundation.sql",
    "20260818_review_center_phase2_jsonb_compat_hardening.sql",
    "20260819_review_center_profile_directory.sql",
    "20260820_review_center_participant_directory.sql",
    "20260825_review_center_event_actor_directory.sql",
    "20260825200000_review_center_lifecycle_foundation.sql",
    "20260825213000_review_center_lifecycle_submit_permission_null_safety.sql",
    "20260825221500_review_center_capa_schema_foundation.sql",
    "20260825223000_review_center_capa_mutation_foundation.sql",
    "20260826210336_review_center_metadata_foundation.sql",
    "20260827000000_review_center_case_core_foundation.sql",
    "20260827010000_review_center_case_mutation_foundation.sql",
    "20260916043000_review_center_submit_missing_fields.sql",
    "20260916053000_review_center_return_reason_required.sql",
)


def guarded() -> None:
    if (
        os.environ.get("PGHOST") != "localhost"
        or os.environ.get("PGDATABASE") != "wos_p8_lineage_ci"
        or os.environ.get("PGUSER") != "postgres"
    ):
        raise SystemExit("WOS_P8_DISPOSABLE_PG17_ONLY_GUARD=FAIL")


def run(*args: str) -> None:
    proc = subprocess.run(args, cwd=ROOT, check=False)
    if proc.returncode:
        raise RuntimeError(
            "WOS_P8_FIRST_FAILED_CANDIDATE=" + " ".join(args)
            + " EXIT=" + str(proc.returncode)
        )


def main() -> int:
    guarded()
    doc = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = doc["recorded_production_migrations"]
    if (
        len(rows) != 29
        or rows[0]["applied_version"] != "20261001143000"
        or not all(x["sql_identity_verified"] is True for x in rows)
    ):
        raise SystemExit("WOS_P8_PRODUCTION_SOURCE_ATTESTATION_INCOMPLETE")

    run("python3", "scripts/check_wos_p8_production_lineage.py")
    # Replays the first registered CPC migration after selected legacy core.
    run("bash", "scripts/wos_p8_replay_minimal_lineage.sh")

    legacy = {
        x["path"].split("/")[-1]
        for x in doc["historical_baseline"]["legacy_unregistered_candidates"]
    }
    for filename in CANDIDATE_LEGACY_TAIL:
        if filename not in legacy:
            raise RuntimeError("Unpinned historical candidate " + filename)
        path = "supabase/migrations/" + filename
        print("WOS_P8_CANDIDATE_LEGACY=" + path, flush=True)
        run("psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", path)

    # The first registered Production migration was tested in the bootstrap
    # command; replay the other 28 **at their applied-version order**, NOT
    # their mismatched source filenames' chronological order.
    for row in rows[1:]:
        path = row["repo_path"]
        print(
            "WOS_P8_CANDIDATE_REPLAY_VERSION="
            + row["applied_version"] + " SOURCE=" + path,
            flush=True
        )
        run("psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", path)

    print("WOS_P8_29_RECORDED_CANDIDATE_SQL_REPLAY=PASS", flush=True)
    run("python3", "scripts/wos_p8_schema_drift_report.py")
    print("WOS_P8_REAL_SUPABASE_FEATURE_PARITY=NOT_VERIFIED", flush=True)
    print("WOS_P8_PHYSICAL_STORAGE_EDGE_ROLLBACK=NOT_RUN", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, KeyError, ValueError) as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
