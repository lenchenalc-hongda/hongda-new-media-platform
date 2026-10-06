# Agent Control Task — CPC Phase 12 Pilot Environment Hardening

TASK_ID = CPC-P12-PILOT-ENV-HARDEN-001
BASE_MASTER_SHA = f077567c2554b15b1c00d8b41de628d75277c785
TARGET = isolated non-Production pilot only

## Verified environment facts

- Approved pilot cohort: 叶展龙、刘士玮、黄文强.
- Supabase Production project: `hongda-new-media` / `amqpvxrurenevniilhtl` — strictly forbidden.
- Approved candidate non-Production project: `hongda-review-dev` / `xulmpqaknlwqqculbsek`.
- Read-only PM preflight on 2026-10-06: `hongda-review-dev` is `ACTIVE_HEALTHY`, PostgreSQL 17, and every CPC table contains 0 rows.
- Recorded migration history currently contains only Phase 5A, 5B and 5D entries, while the repository also contains Phase 5F, 6B, 6C and Phase 7 migrations.
- Supabase Security Advisor reports that `auth_has_role(text)`, `auth_org_id()`, and `auth_profile_id()` are callable by `anon` as `SECURITY DEFINER` functions.
- Vercel Preview for PR #67 reached Ready, confirming the repository/project integration is reachable. Supabase Preview environment binding is not yet accepted as verified.

## Objective

Produce one bounded, reviewable repository change that makes the isolated pilot environment safe to reconcile and verify before any pilot user is invited.

## Required work

1. Audit the complete repository migration sequence against the verified non-Production migration inventory.
2. Add forward-only, idempotent reconciliation/remediation migrations where needed. Do not rewrite historical migration semantics unless required for deterministic fresh installs.
3. Remove unintended anonymous execution from the three base auth helper functions using explicit `REVOKE` statements while preserving the minimum execution privileges required by RLS and approved authenticated CPC RPCs.
4. Add contract tests that fail when:
   - a required CPC migration is omitted from the expected pilot sequence;
   - a `SECURITY DEFINER` auth helper remains executable by `PUBLIC` or `anon`;
   - a migration contains destructive SQL, disables RLS, exposes direct authenticated table DML, or references the Production project.
5. Add/update the Phase 12 pilot environment runbook with:
   - exact read-only preflight;
   - exact ordered migration application plan;
   - postflight schema/RLS/advisor checks;
   - synthetic `PILOT-NONPROD` data-only rule;
   - stop/rollback conditions;
   - explicit statement that Production execution is forbidden.
6. Do not create real pilot users, seed real customer data, change Vercel/Supabase secrets, or execute migrations against any external environment in this Codex task.

## Acceptance criteria

- Fresh-install migration contract passes.
- Existing non-Production drift can be reconciled without DROP/TRUNCATE/data overwrite.
- `anon` and `PUBLIC` cannot execute the three base auth helpers.
- Required authenticated/RLS behavior remains covered by tests.
- TypeScript, focused tests, full CI, Build, Secret Audit and Smoke pass.
- No customer ownership, financial source-of-truth, Production, or external publishing change.

## Completion Contract

Post a top-level PR comment containing:

- `TASK_ID = CPC-P12-PILOT-ENV-HARDEN-001`
- `TASK_STATUS = PASS / FAILED / BLOCKED / NEEDS_DECISION`
- `BRANCH`
- `BASE_MASTER_SHA`
- `HEAD_SHA`
- `PR_NUMBER`
- `FILES_CHANGED`
- `TESTS`
- `DATABASE_CHANGED = NO`
- `MIGRATION_CREATED = YES / NO`
- `RLS_CHANGED = YES / NO`
- `PRODUCTION_CHANGED = NO`
- `EXTERNAL_ENV_EXECUTED = NO`
- `KNOWN_LIMITATIONS`
- `READY_FOR_PM_REVIEW = YES / NO`
