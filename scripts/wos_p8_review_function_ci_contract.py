#!/usr/bin/env python3
"""Verify Review Center function semantics / permissions in CI-only disposable PG17.

No Production SQL mutation or keys. The two function text-hash differences
are formatting-only (separately confirmed by lexical token comparison); this
script also verifies their whitespace-insensitive source fingerprints.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / (
    "docs/workshop-order-system/nonproduction-only/"
    "wos_p8_review_function_semantic_fingerprints_20261109.json"
)
EXPECTED = {
    "review_event_actor_directory": "p_review_id uuid, p_purpose text",
    "review_reopen": "p_review_id uuid, p_expected_version integer, p_reason text",
    "review_submit": "p_review_id uuid, p_expected_version integer",
}
BASELINE_QUERY = r"""
SELECT json_agg(row_to_json(v) ORDER BY v.name)::text FROM (
 SELECT p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosrc AS body,
  md5(regexp_replace(p.prosrc,'[[:space:]]+','','g')) AS normalized_body_md5,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
  AND p.proname IN ('review_reopen','review_submit','review_event_actor_directory')
) v;
"""



# SOURCE: independently read-only inspected Production pg_proc bodies (2026-11-09).
# Tokens retain all quoted literals verbatim, including whitespace. The
# repository fixture itself never includes Production function source bodies.
SOURCE_MIGRATIONS = {
    "review_reopen": "20260916053000_review_center_return_reason_required.sql",
    "review_submit": "20260916043000_review_center_submit_missing_fields.sql",
}


def lexical_tokens(body: str) -> list[str]:
    """Lexical audit, not a full PL/pgSQL parser. Reject malformed literals.

    Outside quotes, skip whitespace and SQL comments; case-fold ASCII
    identifiers. Inside single/double quotes preserve every byte of the
    Unicode string. This closes the false-equivalence hole in the historical
    regexp_replace(body, '[[:space:]]+', '') fingerprint.
    """
    result = []
    i = 0
    while i < len(body):
        c = body[i]
        if c.isspace():
            i += 1
        elif body.startswith("--", i):
            end = body.find("\n", i + 2)
            i = len(body) if end == -1 else end
        elif body.startswith("/*", i):
            end = body.find("*/", i + 2)
            if end == -1:
                raise ValueError("unterminated block comment")
            i = end + 2
        elif c in ("'", '"'):
            j = i + 1
            closed = False
            while j < len(body):
                if body[j] == c:
                    if j + 1 < len(body) and body[j + 1] == c:
                        j += 2
                        continue
                    j += 1
                    closed = True
                    break
                j += 1
            if not closed:
                raise ValueError("unterminated SQL quoted literal")
            result.append(body[i:j])
            i = j
        elif c.isascii() and (c.isalpha() or c.isdigit() or c == "_"):
            j = i + 1
            while j < len(body) and body[j].isascii() and (
                body[j].isalpha() or body[j].isdigit() or body[j] in "_$"
            ):
                j += 1
            result.append(body[i:j].lower())
            i = j
        else:
            result.append(c)
            i += 1
    return result


def token_fingerprint(body: str) -> tuple[int, str]:
    tok = lexical_tokens(body)
    payload = json.dumps(tok, ensure_ascii=False, separators=(",", ":"))
    return len(tok), hashlib.sha256(payload.encode("utf-8")).hexdigest()


def source_body(function_name: str) -> str:
    filename = SOURCE_MIGRATIONS[function_name]
    sql = (ROOT / "supabase/migrations" / filename).read_text(encoding="utf-8")
    match = re.search(r"\bAS\s+\$\$([\s\S]*?)\$\$\s*;", sql, flags=re.I)
    if not match:
        raise RuntimeError("WOS_P8_REVIEW_SOURCE_FUNCTION_MISSING: " + function_name)
    return match.group(1)


def lexical_negative_tests():
    original = "BEGIN -- layout\n SELECT 'quoted space', \"Some Column\" FROM foo; END;"
    spaced = "begin select 'quoted space', \"Some Column\" from foo; end;"
    assert token_fingerprint(original) == token_fingerprint(spaced)
    for mutated in (
        "begin select 'quotedspace', \"Some Column\" from foo; end;",
        "begin select 'quoted space', \"SomeColumn\" from foo; end;",
        "begin delete 'quoted space', \"Some Column\" from foo; end;",
    ):
        assert token_fingerprint(original) != token_fingerprint(mutated)
    for malformed in ("SELECT 'unfinished", "SELECT /* unclosed"):
        try:
            lexical_tokens(malformed)
        except ValueError:
            continue
        raise RuntimeError("WOS_P8_MALFORMED_FUNCTION_SOURCE_ACCEPTED")
    print("WOS_P8_QUOTED_LITERAL_WHITESPACE_NEGATIVE_TESTS=PASS", flush=True)


def guard():
    if (os.getenv("GITHUB_ACTIONS") != "true" or
        os.getenv("PGHOST") != "localhost" or
        os.getenv("PGUSER") != "postgres" or
        os.getenv("PGDATABASE") != "wos_p8_lineage_ci"):
        raise RuntimeError("WOS_P8_DISPOSABLE_GITHUB_CI_ONLY")


def psql(query: str) -> str:
    result = subprocess.run(
        ["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
        input=query, text=True, capture_output=True, check=True, cwd=ROOT
    )
    return result.stdout.strip()


def inspect():
    rows = json.loads(psql(BASELINE_QUERY))
    if len(rows) != 3 or {x["name"] for x in rows} != set(EXPECTED):
        raise RuntimeError("WOS_P8_REVIEW_FUNCTION_REGISTRY_DRIFT")
    return {row["name"]: row for row in rows}


def main():
    guard()
    lexical_negative_tests()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if (
        manifest.get("project_ref") != "amqpvxrurenevniilhtl"
        or manifest.get("schema_version") != 1
        or manifest.get("safety", {}).get("ci_only") is not True
        or manifest.get("safety", {}).get("production_writes_forbidden") is not True
    ):
        raise RuntimeError("WOS_P8_REVIEW_FUNCTION_PROVENANCE_INCOMPLETE")
    expected = {x["name"]: x for x in manifest["functions"]}
    if set(expected) != set(EXPECTED):
        raise RuntimeError("WOS_P8_UNEXPECTED_PRODUCTION_FUNCTIONS")
    if not all(manifest["verified_token_review"][n]["lexical_tokens_equal"]
               for n in ("review_reopen", "review_submit")):
        raise RuntimeError("WOS_P8_FUNCTION_TOKEN_EQUALITY_UNATTESTED")

    original = inspect()
    if manifest.get("safety", {}).get("quoted_whitespace_mutation_must_fail") is not True:
        raise RuntimeError("WOS_P8_QUOTED_WHITESPACE_GUARD_MISSING")
    for function_name, source in SOURCE_MIGRATIONS.items():
        record = manifest["verified_token_review"][function_name]
        expected_sha256 = record["quoted_literal_preserving_token_sha256"]
        expected_tokens = record["prod_tokens"]
        if not record.get("lexical_tokens_equal") or expected_tokens != record.get("repo_tokens"):
            raise RuntimeError("WOS_P8_FUNCTION_LEXICAL_PROVENANCE_UNATTESTED")
        for label, body in (
            ("repository_migration", source_body(function_name)),
            ("ephemeral_pg17_replay", original[function_name]["body"]),
        ):
            count, actual_sha256 = token_fingerprint(body)
            if (count, actual_sha256) != (expected_tokens, expected_sha256):
                raise RuntimeError("WOS_P8_QUOTE_AWARE_FUNCTION_DRIFT: " + function_name + "/" + label)
        print("WOS_P8_QUOTE_AWARE_FUNCTION_PARITY=PASS " + function_name +
              " tokens=" + str(expected_tokens) + " sha256=" + expected_sha256, flush=True)

    for n, baseline in expected.items():
        row = original[n]
        if (
            row["args"] != EXPECTED[n]
            or row["normalized_body_md5"] != baseline["normalized_body_md5"]
            or row["anon_exec"] is not False
            or row["auth_exec"] is not True
        ):
            raise RuntimeError("WOS_P8_FUNCTION_SEMANTIC_OR_ROLE_MISMATCH: " + n)
    print("WOS_P8_THREE_REVIEW_FUNCTION_SOURCE_HASHES=PASS", flush=True)

    # Match ONLY one existing Production service_role grant in the *throwaway*
    # database. Never create a migration for this historical behavior.
    grant = r"""
BEGIN;
DO $guard$
BEGIN
 IF current_database() <> 'wos_p8_lineage_ci'
 OR (SELECT count(*) FROM auth.users) <> 0
 OR (SELECT count(*) FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE') <> 67
 THEN RAISE EXCEPTION 'WOS_P8_DISPOSABLE_CATALOG_GUARD'; END IF;
END
$guard$;
GRANT EXECUTE ON FUNCTION public.review_event_actor_directory(uuid,text)
 TO service_role;
COMMIT;
"""
    psql(grant)
    actual = inspect()
    for name, reference in expected.items():
        row = actual[name]
        if (row["service_exec"] != reference["service_exec"]
                or row["anon_exec"] != reference["anon_exec"]
                or row["auth_exec"] != reference["auth_exec"]
                or row["normalized_body_md5"] != reference["normalized_body_md5"]):
            raise RuntimeError("WOS_P8_POST_GRANT_REVIEW_CONTRACT_DRIFT: " + name)
    print("WOS_P8_REVIEW_FUNCTION_CI_ONLY_PERMISSION_PARITY=PASS", flush=True)
    print("WOS_P8_REAL_SUPABASE_PERMISSIONS_UNTOUCHED=YES", flush=True)
    print("WOS_P8_PRODUCTION_SCHEMA_REPLAY_FULLY_VERIFIED=NO", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as exc:
        print("WOS_P8_REVIEW_FUNCTION_CONTRACT_FAIL: " + str(exc),file=sys.stderr)
        sys.exit(1)
