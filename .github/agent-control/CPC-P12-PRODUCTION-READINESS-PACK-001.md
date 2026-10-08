# CPC-P12-PRODUCTION-READINESS-PACK-001

Status: READY_FOR_CODEX
Base master SHA: `2ec626b3bc0eaf751248db0f449065bad573196a`

## Context

Phase 0–11 are PASS. Phase 12 automated surrogate pilot is owner-accepted PASS. Production execution is still CLOSED and explicitly NOT authorized.

This task is repository-only preparation for the future human Production gates. It must not mutate any Supabase/Vercel Production environment.

Verified read-only facts as of 2026-10-08:

- Production Supabase: `hongda-new-media / amqpvxrurenevniilhtl`
- Non-Production Supabase: `hongda-review-dev / xulmpqaknlwqqculbsek`
- Production migration history: zero CPC migration records
- Production public schema: no `cpc_%` tables or routines
- Required legacy foundations already exist in Production: `profiles`, `organizations`, `auth_profile_id()`, `auth_org_id()`, `auth_has_role(text)`
- Non-Production migration history records only Phase 5A/5B/5D while live CPC runtime objects include later phases; do not repair history blindly
- Vercel Production project: `hongda-new-media-platform` / `prj_y1JAqsnwxlIAJANknRQ0JHWsn8tG`
- Vercel account/team scope observed on project: `team_OZQkJ9a5x0fAirpMzt3vn3Xp`
- Production domain: `www.hongdaprinting.tech`
- Current Production deployment: `dpl_9UcXbdGKKftA1UprkwiGpn2U1wgE`
- Current Production deployment Git SHA: `2ec626b3bc0eaf751248db0f449065bad573196a`, branch `master`, READY
- Production env names include Supabase URL / anon key / service-role key; values must never be exposed
- `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` is currently Preview-only; no Production entry is present
- Current Vercel MCP may still return 403 on team-scoped deployment enumeration; do not work around with secrets

## Exact SQL candidate

Only these 9 migrations are in the candidate, in this order:

1. `supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql`
   Git blob SHA: `9a564550836e6a3d57978fe5177321b8ab39b791`
2. `supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql`
   Git blob SHA: `e3bf4075532a6d27084b6642cad03ea4fc420404`
3. `supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql`
   Git blob SHA: `f7e5f97a6d28bc4f0241d649862c9977f87cf37d`
4. `supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql`
   Git blob SHA: `ca48610311bb06d8adc3dc7252398565cb9d5e17`
5. `supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql`
   Git blob SHA: `af33ebdf7f8847846243b68e79cd0cbe3135ee48`
6. `supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql`
   Git blob SHA: `31f525111c01f12bf250eaa9a7134975fd7d987a`
7. `supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql`
   Git blob SHA: `96ce47615ed013934f70e9b439064e0aecf762c2`
8. `supabase/migrations/20261006140000_customer_project_center_pilot_env_hardening.sql`
   Git blob SHA: `740b4149717a34b62aef96d3ecfdae1b05d8990c`
9. `supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql`
   Git blob SHA: `0ab44fb7bf63d4e23d36fcebdb2506d910e4fd4d`

Withdrawn PR #57 migration is excluded.

Static review already found no actual `DROP TABLE`, `DROP SCHEMA`, `DELETE`, or `TRUNCATE` operation in these nine files; TRUNCATE matches were comments only. Re-verify from exact master, do not trust this statement alone.

## Deliverables

Create/update repository documentation only under `docs/customer-project-center/` plus focused non-production/read-only unit tests if useful. Do not edit migration SQL in this task.

### 1. PRODUCTION_SQL_EXECUTION_MANIFEST.md

Must contain:
- release candidate exact master SHA;
- all 9 files in exact order with Git blob SHA;
- a reproducible content-integrity check procedure (include SHA-256 placeholders only if computed from exact repository file contents; never invent hashes);
- Production preflight checks before file 1:
  - target project/ref identity;
  - CPC objects absent as expected;
  - migration history baseline;
  - legacy dependency existence/signatures;
  - role/grant baseline;
  - backup/PITR evidence status;
  - maintenance/rollback owner;
  - exact Vercel feature flag must remain OFF while DB is being migrated;
- per-file post-apply assertions derived from the actual SQL, not guessed;
- after-file-9 assertions:
  - all CPC tables RLS enabled;
  - expected SELECT policies exist;
  - authenticated has only intended RPC EXECUTE;
  - anon/PUBLIC cannot execute consequential CPC RPCs;
  - direct authenticated business-table writes remain blocked;
  - create-project replay/idempotency guard present;
  - security advisor findings attributable to CPC are reviewed;
- explicit stop conditions;
- forward-only containment plan;
- clearly state this is a plan, not execution authorization.

### 2. DEV_MIGRATION_HISTORY_RECONCILIATION.md

Must document:
- actual known migration-history drift in `hongda-review-dev`;
- why blindly replaying later non-idempotent migrations is unsafe;
- an object-by-object/signature comparison procedure mapping each of the 9 migrations to live objects;
- criteria for when Supabase migration repair would be justified;
- migration repair must not be executed by this task;
- dev history must never be copied as Production truth.

### 3. CLEAN_ROOM_REHEARSAL_PLAN.md

Must define a real clean-room rehearsal:
- disposable non-Production database with required legacy schema, no real business data;
- apply the exact 9 files in order;
- verify per-file assertions and final RLS/RPC/replay behavior;
- use synthetic identities/data only;
- record schema/advisor/migration-history evidence;
- compare clean-room final schema to non-Production pilot contract;
- define PASS/FAIL and stop conditions.
- Explicitly state that creating a Supabase Branch/project may incur cost and requires separate user cost confirmation; this PR must not create one.

### 4. PRODUCTION_VERCEL_DEPLOYMENT_MANIFEST.md

Must contain:
- exact project/team/domain/deployment/release SHA facts listed above;
- Production env variable NAMES only, never values;
- current CPC Production feature flag absence;
- staged Production build strategy without assigning live domain first;
- checks that Production points only to Production Supabase, not hongda-review-dev;
- promotion/rollback steps;
- Gate B requires separate explicit owner approval;
- do not mutate Vercel in this task.

### 5. PRODUCTION_GATE_CHECKLIST.md

Single compact checklist splitting:
- Gate A Production SQL/RLS
- Gate B Production Vercel env/deployment
- Gate C internal cohort/go-live
For each gate: exact evidence required, owner approval phrase, execution owner, rollback/stop conditions.

## Static review requirements

Read the exact 9 SQL files and derive assertions from them.
Check for:
- destructive statements;
- SECURITY DEFINER + search_path;
- grants/revokes;
- RLS enablement/policies;
- dependencies on profiles/organizations/auth helpers;
- replay guard/index;
- assumptions that differ from Production baseline.

Do not change SQL merely to make the manifest easier.

## Tests

If adding a focused repository test, it may only verify static repository contracts (candidate files/order/presence/no obvious destructive SQL/manifest exact SHA). Do not add Production network tests to CI.

Do not edit `.github/workflows/*` unless PM later decides a test must be wired; MAC-5 protected paths must not be bypassed.

## Safety

- PRODUCTION_CHANGED = NO
- DATABASE_EXECUTED = NO
- RLS_EXECUTED = NO
- VERCEL_PRODUCTION_CHANGED = NO
- CUSTOMER_OWNERSHIP_CHANGED = NO
- FINANCIAL_SOT_CHANGED = NO
- SECRETS_EXPOSED = NO
- No Production SQL, no migration repair, no env change, no deployment promotion, no real business-data access
- Never print or store secret values

## Completion contract

TASK_ID = CPC-P12-PRODUCTION-READINESS-PACK-001
TASK_STATUS = PASS / FAILED / BLOCKED / NEEDS_DECISION
BRANCH =
HEAD_SHA =
PR_NUMBER =
FILES_CHANGED =
TESTS =
PRODUCTION_CHANGED = NO
DATABASE_EXECUTED = NO
RLS_EXECUTED = NO
VERCEL_PRODUCTION_CHANGED = NO
SQL_MANIFEST = PASS / FAIL
DEV_HISTORY_PLAN = PASS / FAIL
CLEAN_ROOM_PLAN = PASS / FAIL
VERCEL_MANIFEST = PASS / FAIL
GATE_CHECKLIST = PASS / FAIL
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO

AUTO_PRODUCTION = false.
