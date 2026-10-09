# Customer Project Center Dev Migration History Reconciliation

## Scope

- Non-Production project: `hongda-review-dev / xulmpqaknlwqqculbsek`
- Production project: `hongda-new-media / amqpvxrurenevniilhtl`
- This task executes no migration repair.
- Non-Production history must never be copied to Production as schema truth.
- `MIGRATION_REPAIR_EXECUTED = NO`.

## Known Drift

The known non-Production state as of `2026-10-08` is:

- Migration history records only Phase 5A, 5B, and 5D:
  `20261001143000`, `20261002024500`, `20261002033500`.
- Live CPC runtime objects include later-phase tables and functions.
- Later migration versions are therefore absent from history even though some
  or all of their objects are present.
- This is history drift, not proof that Production should adopt the
  non-Production history.

Production remains the separate authority for the future release. Production
currently has zero CPC migration records and no `cpc_%` public tables or
routines.

## Why Blind Replay Is Unsafe

The later files are not uniformly idempotent:

- Phase 6C and Phase 7A use plain `CREATE TABLE` for new CPC objects.
- Phase 5F, 6B, and 7A `CREATE OR REPLACE FUNCTION` calls can overwrite a live
  function body even when history is missing.
- Phase 12 hardening assumes earlier tables and functions exist and raises if
  they do not.
- Phase 12 replay guard adds a unique index and replaces `cpc_create_project`
  with replay behavior.

Blind replay can fail on existing tables, overwrite a newer live body, or mark
history from an incomplete object contract. History repair is justified only
after object-by-object and signature-by-signature verification proves the
required repository contract is already present.

## Read-Only Inventory Procedure

Run against `xulmpqaknlwqqculbsek` only. Do not use the Production ref.

Record:

1. Migration rows:

```sql
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20261001143000',
  '20261002024500',
  '20261002033500',
  '20261002050000',
  '20261002065000',
  '20261002073000',
  '20261002090000',
  '20261006140000',
  '20261007020000'
)
order by version;
```

2. Table shape, constraints, indexes, and RLS:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name like 'cpc_%'
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'cpc_%'
order by c.relname;

select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'cpc_%'
order by tablename, policyname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename like 'cpc_%'
order by tablename, indexname;
```

3. Function signatures, SECURITY DEFINER, and pinned search path:

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef,
  p.proconfig,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'cpc_%'
order by p.proname, identity_arguments;
```

4. Trigger definitions:

```sql
select
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table like 'cpc_%'
order by event_object_table, trigger_name, event_manipulation;
```

5. Table and routine grant state:

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'cpc_%'
order by table_name, grantee, privilege_type;

select routine_name, specific_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name like 'cpc_%'
order by routine_name, grantee, privilege_type;
```

## Object-by-Object Mapping

Each migration is compared against the exact repository contract before any
history action.

| Migration | Required live object and signature evidence |
| --- | --- |
| `20261001143000` Phase 5A | Seven tables: `cpc_customer_references`, `cpc_external_profile_mappings`, `cpc_projects`, `cpc_project_members`, `cpc_project_events`, `cpc_work_items`, `cpc_audit_log`; seven SELECT policies; RLS enabled; three `(UUID, UUID)` read helpers; SELECT-only authenticated grants; composite `profiles(id, org_id)` and `organizations(id)` foreign keys. |
| `20261002024500` Phase 5B | Six internal helper signatures; `cpc_reject_append_only_mutation()`; `cpc_enforce_active_project_invariant()`; append-only and deferred invariant triggers; six mutation RPC signatures; exact authenticated-only EXECUTE grants; no direct table DML. |
| `20261002033500` Phase 5D | `cpc_record_progress` identity arguments must equal `UUID, INTEGER, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, UUID`; body must include material-change `WAITING_STARTED`, `WAITING_RESOLVED`, required waiting reason, and server default occurrence handling. |
| `20261002050000` Phase 5F | `cpc_can_follow_customer(UUID, UUID)` and `cpc_record_customer_follow_up(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TIMESTAMPTZ, TEXT, UUID)`; strict follow-up authority; only contact/response events; no automatic Project; authenticated-only grants. |
| `20261002065000` Phase 6B | `cpc_reschedule_work_item(UUID, INTEGER, TIMESTAMPTZ, TEXT, UUID)`; open-item and version checks; due/version update without status reset; `WORK_ITEM_RESCHEDULED` audit; authenticated-only grant. |
| `20261002073000` Phase 6C | `cpc_ai_drafts` table, RLS, `cpc_ai_drafts_select`, `cpc_can_read_ai_draft(UUID, UUID)`, `cpc_create_work_item(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID)`, `cpc_create_ai_work_item_draft(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, UUID)`, `cpc_accept_ai_draft(UUID, INTEGER, UUID)`, `cpc_reject_ai_draft(UUID, INTEGER, TEXT, UUID)`, SELECT-only table grant. |
| `20261002090000` Phase 7A | `cpc_reports` table, RLS, `cpc_reports_select`, revision and active-draft indexes, submitted immutability trigger, `cpc_can_read_report(UUID, UUID)`, `cpc_build_daily_report_metrics(UUID, UUID, DATE)`, `cpc_generate_daily_report_draft(DATE, UUID)`, `cpc_submit_report(UUID, INTEGER, UUID)`, `cpc_create_report_correction(UUID, INTEGER, TEXT, UUID)`, SELECT-only table grant, metric builder revoked from all client roles. |
| `20261006140000` hardening | No new CPC object is expected. Verify the five required CPC objects and three auth helpers; verify `PUBLIC` and `anon` have no EXECUTE on `auth_has_role(TEXT)`, `auth_org_id()`, or `auth_profile_id()`; verify `authenticated` retains EXECUTE. |
| `20261007020000` replay guard | Verify partial unique index `uq_cpc_project_created_request_replay`; verify `cpc_create_project` retains the 12-argument signature and includes replay lookup, same-request return, unchanged authorization rules, and duplicate preflight. |

If any signature is absent, any body marker is absent, or any policy/grant/RLS
contract differs, the migration is not eligible for history repair.

## Migration Repair Criteria

Migration repair means inserting or updating only the Supabase migration-history
marker after the schema has already been proven to match the repository
contract. It does not apply SQL.

A repair is justified only when all of these are true:

1. The target is confirmed as `hongda-review-dev / xulmpqaknlwqqculbsek`.
2. The version is absent or in the known drift set.
3. Every required object, signature, body marker, policy, index, trigger, and
   grant from that migration already exists and matches repository truth.
4. Live CPC data is empty or the PM confirms only synthetic pilot data exists.
5. No destructive statement or object replacement is required.
6. A human maintains a before/after migration-history record.
7. A reviewer independently repeats the object inventory.
8. The PM explicitly approves repair for that exact version.

Do not repair when:

- history says applied but a required object is missing;
- a table exists with a different shape or missing constraints;
- a function has a different identity-argument signature;
- a function body does not contain the required phase markers;
- RLS or grants differ;
- real business data is present;
- the version mismatch cannot be explained.

Example command form, for future human use only:

```bash
supabase migration repair --status applied <VERSION> --project-ref xulmpqaknlwqqculbsek
```

This command is not executed by this task.

## Production Boundary

- Production has a separate baseline and must not import dev history.
- A repair in `hongda-review-dev` proves only the dev object contract.
- The Production plan applies the exact nine repository files in order after
  Production preflight and Gate A approval.
- If Production history and object state diverge, fail closed and return to PM
  review.
