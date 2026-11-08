# WOS P8 / Issue #225 — Production migration history is not reproducible

Status: **P0 BLOCKED, investigation and disposable CI only** (2026-11-09).

## Verified live facts (read-only)

- Production Supabase `amqpvxrurenevniilhtl`: 67 public tables, 29 tracked migration records, **0** deployed WOS tables/bucket.
- GitHub `master` under `supabase/migrations/`: **61** SQL files.
- Only **9 of the 29** Production migration versions exactly match existing GitHub SQL version prefixes.
- The other **20** have differing timestamps; 6 require explicit name aliases, the others can be provisionally mapped by migration title. **No Production-applied SQL body hashes are available from the migration registry, so these are candidates, not proofs of SQL identity.**
- Earliest Production migration `20261001143000_customer_project_center_phase5a_core_foundation` depends on `organizations`, `profiles`, `auth_profile_id()`, `auth_org_id()`, `auth_has_role(text)`, `set_updated_at()` and composite uniqueness. These are established in earlier files absent from the 29 tracked Production migration records (historical manual/bootstrap path).
- Older `001_initial_schema.sql` has a nonstandard migration filename and creates the original shared tables; earlier RLS and Review Center migrations create and revise authentication helpers.
- Some legacy migration SQL includes **destructive DDL** (e.g., `DROP TABLE IF EXISTS site_data`) and broad historical access policies. It is **not safe** to replay this blind against an existing Production or shared QA project.
- Previous paid, no-data Supabase branch `fzlqdmxtwajhoidtzchf` returned `MIGRATIONS_FAILED`/zero tables. It was deleted in the prior stage; no paid branch is active. These mismatches make reproducibility suspect; the exact original Supabase branch failure log was not captured, so they are **not yet proven to be the first failing statement**.

## Changes in this Draft PR

- `wos_p8_production_migration_lineage_20261109.json` pins 29 observed Production versions to **candidate** repository blobs, recording exact-version vs. name-mapped provenance and 28 untracked historical SQL candidates. Explicit safety flags forbid treating the map as SQL-identity attestation or a deployable migration list.
- `scripts/check_wos_p8_production_lineage.py` checks every pinned Git blob SHA, path traversal, version uniqueness/order, known 9 vs 20 drift, and fail-closed safety flags; negative tests mutate the manifest to prove rejection.
- `wos-p8-lineage-audit.yml`: GitHub pull-request CI with **read-only GITHUB_TOKEN and no Supabase secrets**. One job verifies file lineage; a second runs a disposable PostgreSQL 17 service to replay only the legacy core prerequisites and earliest CPC migration. The job intentionally reports `COMPLETE_67_TABLE_PRODUCTION_PARITY=NOT_VERIFIED`.

## Further release-gating work (no overclaims)

1. Get the original first failing Supabase branch migration line from a recorded branch deployment log, or reproduce it in a disposable test environment. Do **not** create a new hourly-billed branch without separate fee confirmation.
2. Build a canonical **schema-only, no-data Production snapshot** using a controlled read-only `pg_dump --schema-only` / Supabase-supported migration pull. Extract no Production customer or staff rows; protect repository/workflow credentials and review the code before connecting Production.
3. Compare all 67 table signatures, constraints, indexes, RLS policies, functions, Storage config and migration history to the observed Production baseline. Close drift with additional nonproduction migrations; do not edit applied Production history.
4. On an approved isolated Supabase environment, rehearse full Production-compatible WOS Foundation + P7, actual authenticated private image upload/download and Edge verification; test 24-hour natural orphan protection and isolated rollback. Real cleanup deletion requires its own authorization.
5. Require independent security review, exact-HEAD owner sign-off for PR merge and distinct Production database / app release approvals.

**Never** apply files under `docs/.../nonproduction-only/` or tests to Production. This Draft PR contains **no Production database mutation or customer data**.
