#!/usr/bin/env python3
"""Fail-closed, secretless WOS P8 Production migration-lineage check.

This audits file provenance only. It NEVER runs SQL, connects to Supabase,
modifies migration histories, or claims Production/schema compatibility.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath

DEFAULT_MANIFEST = (
    "docs/workshop-order-system/nonproduction-only/"
    "wos_p8_production_migration_lineage_20261109.json"
)
VERSION = re.compile(r"^[0-9]{14}$")
SHA = re.compile(r"^[a-f0-9]{40}$")
BASIS = {"exact_version", "explicit_name_alias", "name_only_candidate"}


class LineageError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise LineageError(message)


def checked_path(root: Path, relative: str) -> Path:
    require(isinstance(relative, str), "path must be a string")
    p = PurePosixPath(relative)
    require(
        not p.is_absolute()
        and len(p.parts) == 3
        and p.parts[0] == "supabase"
        and p.parts[1] == "migrations"
        and p.suffix == ".sql"
        and ".." not in p.parts,
        "migration path must be within supabase/migrations",
    )
    full = (root / relative).resolve()
    require(full.is_relative_to(root.resolve()), "migration path escaped repository")
    require(full.is_file(), f"migration file missing: {relative}")
    return full


def git_blob_sha(data: bytes) -> str:
    header = ("blob " + str(len(data)) + "\0").encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def verify_file(root: Path, relative: str, expected: str) -> None:
    require(bool(SHA.fullmatch(expected)), "invalid pinned Git blob SHA")
    actual = git_blob_sha(checked_path(root, relative).read_bytes())
    require(actual == expected, f"Git blob drift at {relative}")


def audit(manifest: dict, root: Path) -> dict:
    require(manifest.get("schema_version") == 1, "unexpected manifest schema")
    require(
        manifest.get("production_project_ref") == "amqpvxrurenevniilhtl",
        "unexpected Production project reference",
    )
    rules = manifest.get("rules") or {}
    for key in (
        "not_a_deployable_migration",
        "do_not_apply_to_production",
        "do_not_copy_customer_data",
        "do_not_rewrite_applied_migration_history",
        "production_sql_text_identity_unverified",
        "mapping_is_investigative_not_approval",
    ):
        require(rules.get(key) is True, f"required safety rule missing: {key}")

    baseline = manifest.get("production_read_only_baseline") or {}
    require(baseline.get("public_tables") == 67, "recheck live table baseline first")
    require(baseline.get("recorded_migrations") == 29, "recheck live migration count first")
    require(baseline.get("wos_public_tables") == 0, "WOS changed in Production")
    require(baseline.get("wos_private_buckets") == 0, "WOS bucket changed in Production")
    rows = manifest.get("recorded_production_migrations")
    require(isinstance(rows, list) and len(rows) == 29, "expected 29 recorded migrations")
    seen_version: set[str] = set()
    seen_files: set[str] = set()
    versions: list[str] = []
    counts = dict.fromkeys(sorted(BASIS), 0)
    for row in rows:
        version = row["applied_version"]
        basis = row["mapping_basis"]
        relative = row["repo_path"]
        require(bool(VERSION.fullmatch(version)), "invalid Production version")
        require(version not in seen_version, "duplicate Production version")
        require(relative not in seen_files, "same SQL assigned to multiple versions")
        require(basis in BASIS, "invalid mapping basis")
        require(row["sql_identity_verified"] is False, "unattested source marked verified")
        require(bool(row.get("applied_name")), "missing applied migration name")
        require("wos" not in row["applied_name"].lower(), "Production WOS is not deployed")
        if basis == "exact_version":
            require(
                PurePosixPath(relative).name.startswith(version + "_"),
                "exact-version mapping is not exact",
            )
        else:
            require(
                not PurePosixPath(relative).name.startswith(version + "_"),
                "version mismatch mislabeled as exact candidate",
            )
        verify_file(root, relative, row["repo_blob_sha"])
        seen_version.add(version)
        seen_files.add(relative)
        versions.append(version)
        counts[basis] += 1
    require(versions == sorted(versions), "Production version order changed")
    require(counts["exact_version"] == 9, "expected 9 timestamp-matched files")
    require(sum(v for k, v in counts.items() if k != "exact_version") == 20,
            "expected 20 Production timestamp divergences")

    legacy = manifest["historical_baseline"]["legacy_unregistered_candidates"]
    require(isinstance(legacy, list) and len(legacy) >= 1, "missing legacy inventory")
    require(
        manifest["historical_baseline"]["oldest_untracked_repo_bootstrap"]
        == "supabase/migrations/001_initial_schema.sql",
        "original untracked bootstrap was altered",
    )
    require(
        manifest["historical_baseline"]["oldest_production_registered_version"]
        == versions[0],
        "first Production record changed",
    )
    seen_legacy: set[str] = set()
    for row in legacy:
        relative = row["path"]
        require(relative not in seen_files and relative not in seen_legacy,
                "legacy file overlaps registered migration")
        require(row["execution_status"] == "NOT_ATTESTED",
                "legacy SQL improperly approved")
        verify_file(root, relative, row["repo_blob_sha"])
        seen_legacy.add(relative)
    require(
        "supabase/migrations/001_initial_schema.sql" in seen_legacy,
        "historical initialization SQL is missing",
    )

    return {
        "result": "PASS_FILE_LINEAGE_ONLY",
        "production_migration_count": len(versions),
        "source_timestamp_matches": counts["exact_version"],
        "source_timestamp_mismatches": 20,
        "legacy_untracked_candidates": len(legacy),
        "production_sql_text_identity": "NOT_ATTESTED",
        "full_production_schema_replay": "NOT_VERIFIED",
        "production_writes_performed": False,
        "safe_to_merge_or_deploy": False,
    }


def self_test(root: Path) -> None:
    import copy
    manifest = json.loads((root / DEFAULT_MANIFEST).read_text(encoding="utf-8"))
    audit(manifest, root)
    for scenario in ("duplicate_version", "path_escape", "blob_drift", "unsafe_claim"):
        bad = copy.deepcopy(manifest)
        rows = bad["recorded_production_migrations"]
        if scenario == "duplicate_version":
            rows[1]["applied_version"] = rows[0]["applied_version"]
        elif scenario == "path_escape":
            rows[0]["repo_path"] = "../private.sql"
        elif scenario == "blob_drift":
            rows[0]["repo_blob_sha"] = "0" * 40
        elif scenario == "unsafe_claim":
            bad["rules"]["production_sql_text_identity_unverified"] = False
        try:
            audit(bad, root)
        except LineageError:
            continue
        raise AssertionError("Unsafe lineage mutation accepted: " + scenario)
    print("WOS_P8_MIGRATION_LINEAGE_NEGATIVE_SELF_TEST=PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        if args.self_test:
            self_test(root)
        else:
            manifest_file = (root / args.manifest).resolve()
            require(manifest_file.is_relative_to(root), "manifest escaped repository")
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            print(json.dumps(audit(manifest, root), sort_keys=True))
        return 0
    except (LineageError, OSError, KeyError, TypeError, ValueError) as exc:
        print("WOS_P8_MIGRATION_LINEAGE=FAIL: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
