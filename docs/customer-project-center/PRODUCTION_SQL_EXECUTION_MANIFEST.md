# Customer Project Center Production SQL Execution Manifest

## Status

- Task: `CPC-P12-PRODUCTION-READINESS-PACK-001`
- Release candidate master SHA: `2ec626b3bc0eaf751248db0f449065bad573196a`
- Production Supabase: `hongda-new-media / amqpvxrurenevniilhtl`
- Repository state as of `2026-10-08`
- Production changed by this document: NO
- Database executed by this document: NO
- RLS executed by this document: NO
- This document is a future human execution plan. It is not Production execution authorization.

The exact candidate commit object is not present in this shallow checkout. Exact
content identity was verified locally by recomputing `git hash-object` for all
nine files and matching every resulting Git blob SHA to the trusted manifest.

## Frozen Candidate

The only candidate files, in required apply order, are:

| Order | Repository path | Git blob SHA | SHA-256 of exact file contents |
| --- | --- | --- | --- |
| 1 | `supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql` | `9a564550836e6a3d57978fe5177321b8ab39b791` | `81e88dd2bf2bc89eac41d19199c54c0bf8824b801d8392b1fd2ead11287a1ad4` |
| 2 | `supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql` | `e3bf4075532a6d27084b6642cad03ea4fc420404` | `2dbfa413e60fdc935dbc58c4703a0aac004b165e1e5caa17daf193bdfecf26a7` |
| 3 | `supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql` | `f7e5f97a6d28bc4f0241d649862c9977f87cf37d` | `c44d3d313e5b7c247ee3f6406b2fa023fed2ae0f5c53dd9f4f550b26b359bb58` |
| 4 | `supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql` | `ca48610311bb06d8adc3dc7252398565cb9d5e17` | `835f390a8d1cca9e7a54080d58a2ae92faa2ede760b6ffb066d81da6fa53978e` |
| 5 | `supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql` | `af33ebdf7f8847846243b68e79cd0cbe3135ee48` | `31c039394e142fa45f5b87dfddb675affbd5f1ea5d13c63e76ec3132b3686bef` |
| 6 | `supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql` | `31f525111c01f12bf250eaa9a7134975fd7d987a` | `f75e2d58438f925f78d3309ef167101c3945d37289638d3aabeb1ad04889f4ec` |
| 7 | `supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql` | `96ce47615ed013934f70e9b439064e0aecf762c2` | `2c9ad22c3183da751acc718f5a80fd6fbf1cb16dee2438b8b69e23dc9d1caf01` |
| 8 | `supabase/migrations/20261006140000_customer_project_center_pilot_env_hardening.sql` | `740b4149717a34b62aef96d3ecfdae1b05d8990c` | `a7960fa80d3294ca70b180bcfe45b066e03b9fa9fbd66bb3015df5c34f1cc5a0` |
| 9 | `supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql` | `0ab44fb7bf63d4e23d36fcebdb2506d910e4fd4d` | `9581cfc72897dd0088023f98ea672740b8dee9c550b68436555a56dcb1cae143` |

The withdrawn PR #57 migration is excluded.

## Reproducible Integrity Check

Run these read-only checks from the repository root before Gate A:

```bash
set -euo pipefail

paths=(
  supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql
  supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql
  supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql
  supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql
  supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql
  supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql
  supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql
  supabase/migrations/20261006140000_customer_project_center_pilot_env_hardening.sql
  supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql
)

for path in "${paths[@]}"; do
  test -f "$path"
  git hash-object "$path"
  shasum -a 256 "$path"
done
```

The `git hash-object` output for each path must equal the Git blob SHA in the
Frozen Candidate table. The SHA-256 output must equal the SHA-256 in the same
row. If the reviewed execution environment has the candidate commit object, also
verify that the candidate commit is exactly
`2ec626b3bc0eaf751248db0f449065bad573196a` before using `git ls-tree` to compare
the nine paths.

## Static Destructive-Statement Scan

The scan removes SQL comments before evaluating executable text. It checks for
`DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, `DELETE FROM`, and
`DISABLE ROW LEVEL SECURITY`. The nine candidate files do not contain those
executable statements. The literal words `DROP` and `TRUNCATE` appear only in
safety comments.

```bash
node - <<'NODE'
const fs = require('node:fs');
const paths = [
  'supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql',
  'supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql',
  'supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql',
  'supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql',
  'supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql',
  'supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql',
  'supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql',
  'supabase/migrations/20261006140000_customer_project_center_pilot_env_hardening.sql',
  'supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql',
];
const patterns = [
  [/\bDROP\s+(?:TABLE|SCHEMA)\b/i, 'DROP TABLE/SCHEMA'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'DISABLE ROW LEVEL SECURITY'],
];
let failed = false;
for (const path of paths) {
  const executable = fs.readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
  for (const [pattern, label] of patterns) {
    if (pattern.test(executable)) {
      failed = true;
      console.error(`${path}: found ${label}`);
    }
  }
}
process.exit(failed ? 1 : 0);
NODE
```

## Production Preflight Before File 1

All checks are read-only. Any failed check is a stop condition.

1. Target identity:
   - Project name must be `hongda-new-media`.
   - Project ref must be `amqpvxrurenevniilhtl`.
   - The target must not be `hongda-review-dev` or `xulmpqaknlwqqculbsek`.
   - Record the human operator, timestamp, project URL, and console/SQL evidence.
2. CPC absence:
   - `public` tables whose names begin with `cpc_` must be absent.
   - `public` functions whose names begin with `cpc_` must be absent.
   - No CPC RLS policy, grant, or trigger may exist.
3. Migration-history baseline:
   - `supabase_migrations.schema_migrations` must contain zero rows for all nine
     candidate versions listed below.
   - `20261001143000`, `20261002024500`, `20261002033500`,
     `20261002050000`, `20261002065000`, `20261002073000`,
     `20261002090000`, `20261006140000`, `20261007020000`.
4. Legacy dependencies:
   - `public.profiles` and `public.organizations` exist.
   - `public.profiles(id, org_id)` has a unique constraint or unique index.
   - `public.profiles` includes the active actor fields used by the RPCs:
     `id`, `org_id`, `user_id`, `role`, and `is_active`.
   - `public.auth_profile_id()` returns `UUID`.
   - `public.auth_org_id()` returns `TEXT`.
   - `public.auth_has_role(TEXT)` returns `BOOLEAN`.
   - `public.set_updated_at()` exists and is usable as a trigger function.
5. Role and grant baseline:
   - Snapshot table and routine ACLs for `PUBLIC`, `anon`, and `authenticated`.
   - Snapshot the three auth-helper signatures and their existing EXECUTE ACLs.
   - Do not copy the non-Production baseline as Production truth.
6. Backup and recovery evidence:
   - Confirm the provider and recovery mode, latest successful backup or PITR
     checkpoint, retention window, and recovery objective.
   - Repository status: `UNVERIFIED_IN_REPO`; this evidence must be recorded by
     the Gate A owner before execution.
7. Ownership:
   - Gate A execution owner: named human database owner.
   - Maintenance window owner: named human owner.
   - Rollback/containment owner: named project owner.
   - At least one independent reviewer must verify the integrity table.
8. Feature flag:
   - `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` must remain absent or OFF in
     Production while the database is being migrated.
   - This global public build flag is not a cohort restriction. Do not enable it
     to simulate a cohort boundary.
   - Do not enable the Production UI against a partially applied schema.

## Per-File Post-Apply Assertions

### 1. Phase 5A Core Foundation

Assert all seven tables exist:

`cpc_customer_references`, `cpc_external_profile_mappings`, `cpc_projects`,
`cpc_project_members`, `cpc_project_events`, `cpc_work_items`,
`cpc_audit_log`.

Assert:

- Every listed table has RLS enabled.
- These policies exist:
  `cpc_customer_references_select`,
  `cpc_external_profile_mappings_select_management`,
  `cpc_projects_select`,
  `cpc_project_members_select`,
  `cpc_project_events_select`,
  `cpc_work_items_select`,
  `cpc_audit_log_select_management`.
- `authenticated` has `SELECT` only on each listed table and has no
  `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` table privilege.
- `public.cpc_can_read_project(UUID, UUID)`,
  `public.cpc_can_read_customer_reference(UUID, UUID)`, and
  `public.cpc_can_read_work_item(UUID, UUID)` exist as `STABLE SECURITY
  DEFINER` functions with `search_path = pg_catalog, public`.
- Those three helper functions are executable by `authenticated`, not by
  `PUBLIC` or `anon`.
- Composite foreign keys target `profiles(id, org_id)` and
  `organizations(id)`. No business foreign key targets `auth.users`.
- `uq_cpc_work_item_open_next_action` exists on open `NEXT_ACTION` rows.
- `cpc_project_events.event_seq` and `cpc_audit_log.audit_seq` are identity
  sequences and unique.

### 2. Phase 5B Mutation RPCs

Assert these internal helpers exist and are not executable by `PUBLIC`, `anon`,
or `authenticated`:

`cpc_rpc_error(TEXT, TEXT, JSONB)`,
`cpc_stage_is_valid(TEXT, TEXT)`,
`cpc_event_category(TEXT)`,
`cpc_event_payload_is_valid(TEXT, JSONB)`,
`cpc_work_item_transition_is_valid(TEXT, TEXT)`,
`cpc_project_transition_is_valid(TEXT, TEXT)`.

Assert:

- `cpc_reject_append_only_mutation()` secures
  `trg_cpc_project_events_append_only` and
  `trg_cpc_audit_log_append_only`.
- `cpc_enforce_active_project_invariant()` secures the two deferred constraint
  triggers `cpc_active_project_invariant_project` and
  `cpc_active_project_invariant_work_items`.
- These mutation RPCs exist as `SECURITY DEFINER` with pinned
  `search_path = pg_catalog, public`, derive the actor from
  `auth.uid()` plus active `profiles`, use expected-version checks where
  applicable, and are executable only by `authenticated`:
  `cpc_create_provisional_customer_reference(TEXT, TEXT, UUID)`,
  `cpc_create_project(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID)`,
  `cpc_record_progress(UUID, INTEGER, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID)`,
  `cpc_set_waiting_state(UUID, INTEGER, TEXT, TIMESTAMPTZ, TEXT, UUID)`,
  `cpc_transition_work_item(UUID, INTEGER, TEXT, TEXT, UUID)`,
  `cpc_transition_project(UUID, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID)`.
- Commercial evidence events require a non-empty string
  `evidence_reference`.
- Project `won` requires a canonical customer and a prior `ORDER_CONFIRMED`
  event.
- Direct authenticated table DML remains absent.

### 3. Phase 5D Progress Waiting Event

Assert `cpc_record_progress` still has the exact Phase 5B signature and remains
executable only by `authenticated`.

Assert the replacement body:

- emits `WAITING_RESOLVED` when waiting changes to `none`;
- emits `WAITING_STARTED` when waiting target or check time materially changes;
- requires non-empty human input before entering or updating waiting state;
- records `from_waiting_on`, `to_waiting_on`, `next_check_at`, and `reason`;
- uses `COALESCE(p_occurred_at, NOW())` for the main progress event;
- remains non-destructive and does not disable RLS.

### 4. Phase 5F Customer Follow-up

Assert these functions exist as pinned `SECURITY DEFINER` functions:

- `cpc_can_follow_customer(UUID, UUID)`
- `cpc_record_customer_follow_up(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TIMESTAMPTZ, TEXT, UUID)`

Assert:

- Both functions are executable by `authenticated`, not `PUBLIC` or `anon`.
- Follow-up authority requires an approved CPC role and one of: provisional
  creator, verified canonical external-owner mapping, or assigned open
  customer-level `FOLLOW_UP`.
- The RPC accepts only `CONTACT_LOGGED` or
  `CUSTOMER_RESPONSE_RECEIVED`.
- A project is not created automatically.
- Customer ownership and external mapping authority are not rewritten.
- Optional current follow-up completion and next follow-up creation are
  transactional and audited in one `CUSTOMER_FOLLOW_UP_RECORDED` record.

### 5. Phase 6B Reschedule

Assert
`cpc_reschedule_work_item(UUID, INTEGER, TIMESTAMPTZ, TEXT, UUID)` exists as a
pinned `SECURITY DEFINER` function executable only by `authenticated`.

Assert:

- only open WorkItems can be rescheduled;
- expected version conflicts return `VERSION_CONFLICT`;
- a new due time and non-empty reason are required;
- status is preserved, including blocked status;
- due time and version are updated without creating a second reschedule table;
- `WORK_ITEM_RESCHEDULED` is appended to `cpc_audit_log` with old/new due time.

### 6. Phase 6C AI Drafts

Assert `cpc_ai_drafts` exists, has RLS enabled, has policy
`cpc_ai_drafts_select`, and grants `authenticated` `SELECT` only.

Assert `cpc_can_read_ai_draft(UUID, UUID)` exists as a pinned
`SECURITY DEFINER` function executable only by `authenticated`.

Assert these RPCs exist as pinned `SECURITY DEFINER` functions executable only
by `authenticated`:

- `cpc_create_work_item(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID)`
- `cpc_create_ai_work_item_draft(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, UUID)`
- `cpc_accept_ai_draft(UUID, INTEGER, UUID)`
- `cpc_reject_ai_draft(UUID, INTEGER, TEXT, UUID)`

Assert AI drafts remain non-authoritative; acceptance calls the controlled
WorkItem RPC; acceptance/rejection is versioned and strongly audited; expired
drafts are closed without formal work; and no ownership, order, payment, quote,
or customer master state is mutated.

### 7. Phase 7A Reports

Assert `cpc_reports` exists, has RLS enabled, has policy `cpc_reports_select`,
and grants `authenticated` `SELECT` only.

Assert:

- `uq_cpc_report_revision` and partial unique index
  `uq_cpc_report_active_draft` exist.
- `cpc_guard_submitted_report_immutability()` protects
  `trg_cpc_reports_submitted_immutable`.
- `cpc_can_read_report(UUID, UUID)` exists as a pinned `SECURITY DEFINER`
  function executable only by `authenticated`.
- `cpc_build_daily_report_metrics(UUID, UUID, DATE)` is not executable by
  `PUBLIC`, `anon`, or `authenticated`.
- These RPCs exist as pinned `SECURITY DEFINER` functions executable only by
  `authenticated`:
  `cpc_generate_daily_report_draft(DATE, UUID)`,
  `cpc_submit_report(UUID, INTEGER, UUID)`,
  `cpc_create_report_correction(UUID, INTEGER, TEXT, UUID)`.
- Daily metrics use Asia/Shanghai boundaries, submitted snapshots are
  immutable, and corrections create a new draft revision rather than rewriting
  the submitted source.

### 8. Phase 12 Pilot Environment Hardening

Assert the preflight raises and stops unless `cpc_projects`,
`cpc_record_customer_follow_up`, `cpc_reschedule_work_item`,
`cpc_ai_drafts`, `cpc_reports`, and all three base auth helpers are present.

Assert:

- `PUBLIC` and `anon` have no EXECUTE on `auth_has_role(TEXT)`,
  `auth_org_id()`, or `auth_profile_id()`.
- `authenticated` retains EXECUTE on those three helper functions.
- No helper is granted to `PUBLIC` or `anon`.
- The migration contains one `BEGIN`/`COMMIT` transaction.

### 9. Project Create Replay Guard

Assert:

- The preflight rejects duplicate existing
  `(org_id, actor_profile_id, request_id)` rows for `PROJECT_CREATED`.
- Partial unique index `uq_cpc_project_created_request_replay` exists with
  predicate `action = 'PROJECT_CREATED'`, `request_id IS NOT NULL`, and
  `actor_profile_id IS NOT NULL`.
- `cpc_create_project` keeps the exact Phase 5B signature.
- A replay with the same actor and request id returns the existing project,
  version, and next-action id without inserting another Project.
- The exception path rechecks the replay record before re-raising a uniqueness
  violation.
- The function remains executable only by `authenticated`.

## Read-Only Post-Apply Assertions (Production Gate A)

Run these checks in a read-only transaction after the final migration commits.
Gate A permits catalog, ACL, RLS, migration-history, index, and advisor
inspection only. It does not authorize synthetic Project creation,
`cpc_create_project` replay, concurrency proof, or any other write/RPC call in
Production.

All write, replay, and concurrency proof is performed in the disposable
clean room defined by `CLEAN_ROOM_REHEARSAL_PLAN.md`. Any future Production
behavioral write requires a separately approved scope.

1. RLS:
   - Every table below has `relrowsecurity = true`:
     `cpc_customer_references`, `cpc_external_profile_mappings`,
     `cpc_projects`, `cpc_project_members`, `cpc_project_events`,
     `cpc_work_items`, `cpc_audit_log`, `cpc_ai_drafts`, `cpc_reports`.
2. Policies:
   - The nine exact SELECT policies listed in the per-file assertions exist.
   - No INSERT, UPDATE, DELETE, or ALL policy exists on a CPC table.
3. Authenticated RPC EXECUTE:
   - `authenticated` has EXECUTE only for the read helpers and the approved RPC
     list in this manifest.
   - No unexpected SECURITY DEFINER function beginning with `cpc_` is
     executable by `authenticated`.
4. `PUBLIC` and `anon`:
   - Neither can execute any consequential CPC RPC.
   - Neither can execute the three base auth helpers or the CPC read helpers.
   - Function ACL inspection must include the default ACL case; a null `proacl`
     is not accepted as evidence.
5. Direct writes:
   - `authenticated` cannot INSERT, UPDATE, DELETE, or TRUNCATE any CPC table.
   - Trigger-mediated internals and SECURITY DEFINER RPCs are the only write
     path.
6. Replay-guard catalog state:
   - `uq_cpc_project_created_request_replay` is valid and ready.
   - `cpc_create_project` retains the reviewed signature and replay-guard body
     markers.
   - Do not call `cpc_create_project` in Production. The same-request replay
     result, duplicate-prevention proof, and concurrency behavior are
     clean-room evidence only.
7. Advisor review:
   - Run Supabase Security Advisor after apply.
   - Record every new finding attributable to a CPC object.
   - Review anonymous SECURITY DEFINER execution, missing RLS, mutable
     append-only data, and direct authenticated write findings.
   - Pre-existing unrelated findings are recorded separately and are not
     silently changed by this task.

## Stop Conditions

Stop before or during execution if any of these occurs:

- Project identity is ambiguous or is not `amqpvxrurenevniilhtl`.
- Any candidate blob SHA or SHA-256 differs.
- The candidate order differs or any of the nine files is missing.
- A CPC object already exists before file 1.
- Migration history already contains a candidate version before file 1.
- A required legacy dependency or composite profile key is missing.
- Backup/PITR recovery evidence is absent or outside policy.
- A maintenance or rollback owner is not named.
- The Production feature flag is ON while the database is partially migrated.
- A Production write, RPC replay, or concurrency test is requested without a
  separately approved behavioral scope.
- A migration returns an error or leaves an unexpected partial object set.
- A per-file assertion fails.
- A destructive statement is found in executable SQL.
- Any CPC table has RLS disabled.
- `PUBLIC` or `anon` can execute a CPC or base auth helper.
- `authenticated` has direct table DML.
- Security Advisor reports a new critical or high CPC finding that is not
  explicitly resolved or accepted by the gate owner.

## Forward-Only Containment Plan

Do not repair schema history with `DROP`, `TRUNCATE`, or destructive deletion.

1. Stop file application at the first failed assertion.
2. Preserve the migration output, migration-history state, ACLs, RLS state,
   advisor output, and operator timeline.
3. Keep `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER` absent or OFF.
4. Because each candidate file is transactional, a failed file should roll
   back. Verify the actual state rather than assuming rollback.
5. If an earlier file committed successfully, keep it in place and repair
   forward in repository SQL after review.
6. If the schema is complete but the application is not healthy, point
   Production back to the previous application deployment while keeping the
   database forward-only.
7. If corruption is suspected, stop writes, preserve evidence, and use the
   provider recovery process selected by the backup/PITR owner.
8. Resume only after a new bounded review and explicit human approval.

`PRODUCTION_SQL_EXECUTION_MANIFEST = PASS` means this repository plan is
complete. It does not mean Production SQL was executed or approved.
