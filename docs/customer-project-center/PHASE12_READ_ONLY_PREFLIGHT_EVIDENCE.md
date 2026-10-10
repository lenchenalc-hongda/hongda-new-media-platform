# Customer Project Center Phase 12 Read-Only Preflight Evidence

## Evidence Contract

- Captured at: `2026-10-09T19:01Z`
- Repository base: `c0f89a407968cb97c65c2bfbe983b5b834451cdb`
- Production project: `hongda-new-media / amqpvxrurenevniilhtl`
- Non-Production pilot: `hongda-review-dev / xulmpqaknlwqqculbsek`
- `DATABASE_CHANGED = NO`
- `RLS_CHANGED = NO`
- `MIGRATION_REPAIR_EXECUTED = NO`
- `VERCEL_PRODUCTION_CHANGED = NO`
- `PRODUCTION_CHANGED = NO`

All database statements used to capture this evidence were read-only catalog or
aggregate queries. No business row values, credentials, keys, passwords, or
tokens were recorded.

## Production Baseline

Read-only catalog inspection of `amqpvxrurenevniilhtl` returned:

- PostgreSQL `17.6`;
- `public.organizations` and `public.profiles` exist with RLS enabled;
- `uq_profiles_id_org` exists as a unique index on `profiles(id, org_id)`;
- `auth_profile_id()`, `auth_org_id()`, `auth_has_role(text)`, and
  `set_updated_at()` exist;
- zero `public.cpc_%` tables;
- zero `public.cpc_%` functions;
- `supabase_migrations.schema_migrations` is absent.

The three base auth helpers are currently executable by `PUBLIC`, `anon`,
and `authenticated`. This is expected to remain a Gate A observation: the
eighth candidate file is the staged hardening step that revokes `PUBLIC` and
`anon` while retaining `authenticated`. No grant was changed during this
inspection.

## Non-Production Pilot Inventory

Read-only inspection of `xulmpqaknlwqqculbsek` returned:

- PostgreSQL `17.6`;
- nine CPC tables:
  `cpc_customer_references`, `cpc_external_profile_mappings`,
  `cpc_projects`, `cpc_project_members`, `cpc_project_events`,
  `cpc_work_items`, `cpc_audit_log`, `cpc_ai_drafts`, and
  `cpc_reports`;
- RLS enabled on all nine tables;
- nine SELECT policies, one for each CPC table;
- no `anon`, `authenticated`, or `PUBLIC` table grant other than SELECT;
- `PUBLIC` and `anon` cannot execute the three base auth helpers;
- `authenticated` retains EXECUTE on the three base auth helpers;
- the replay index `uq_cpc_project_created_request_replay` exists;
- the expected report immutability, append-only, updated-at, and active-project
  invariant triggers exist.

The only CPC routine reported executable by `PUBLIC` or `anon` was
`cpc_guard_submitted_report_immutability()`. It is a trigger function, not a
client RPC; PostgreSQL rejects direct invocation of trigger-returning
functions. The consequential CPC RPC review remains separate and must continue
to fail closed.

Aggregate row counts show the pilot is not empty: 8 customer references,
8 projects, 12 work items, 6 project events, 18 audit rows, 2 AI drafts,
1 report, and no project-member or external-profile-mapping rows. No row
contents were read. These counts are evidence only and do not justify migration
history repair.

## Migration History Drift

The Supabase migration listing contains only three CPC records, with remote
versions:

- `20261006121127 / customer_project_center_phase5a_core_foundation`
- `20261006121130 / customer_project_center_phase5b_mutation_rpcs`
- `20261006121134 / customer_project_center_phase5d_progress_waiting_event`

The repository candidate uses the canonical nine file versions documented in
`PRODUCTION_SQL_EXECUTION_MANIFEST.md`. Live pilot objects include later
phases despite their missing history rows. This confirms history drift; it does
not authorize replay or repair. The criteria in
`DEV_MIGRATION_HISTORY_RECONCILIATION.md` still require exact object/body/ACL
comparison, synthetic-data confirmation, independent review, and explicit PM
approval before any repair.

## Advisor Snapshot

The Security Advisor returned no CPC RLS-without-policy finding. Existing
project-wide findings include legacy non-CPC RLS/policy notices and a mutable
search path on `public.auth_user_id`; these are outside this CPC evidence
change. SECURITY DEFINER notices for authenticated CPC RPCs require
contract-by-contract review because authenticated execution is intentional for
the narrow RPC surface.

## Clean-Room Provisioning Status

Supabase reports no development branches for the Production project. Current
Supabase documentation states that branch creation replays migration history
and does not copy Production data; it also warns that a project without
migration history will not reproduce the live schema automatically.

The hourly branch cost was previously approved at USD `0.01344`. During this
capture, the connector exposed branch listing but returned `UNAVAILABLE` for
both cost lookup and cost confirmation, so no branch was created. The
clean-room rehearsal remains pending and must not be replaced by the populated
pilot project or by Production.

Before applying the nine CPC files, the disposable branch must be given only
the minimum legacy baseline in `CLEAN_ROOM_REHEARSAL_PLAN.md`, using
repository-reviewed DDL and synthetic identities. Do not assume branch creation
alone reproduces that baseline.

## Result

- `PRODUCTION_READ_ONLY_PREFLIGHT = PASS_WITH_OBSERVATIONS`
- `DEV_READ_ONLY_INVENTORY = PASS_WITH_HISTORY_DRIFT`
- `CLEAN_ROOM_REHEARSAL_PASS = NOT_RUN`
- `PRODUCTION_GATE = CLOSED`
- `OWNER_ACTION_REQUIRED = NO`

Next safe action: provision the isolated branch when the cost-confirmation
interface is available, establish the minimum legacy baseline, apply the exact
nine files in order with stop-on-failure assertions, run synthetic behavior and
advisor checks, then capture cleanup evidence.
