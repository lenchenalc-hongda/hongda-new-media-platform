# Phase 12 Controlled Pilot Environment Runbook

## Purpose

Prepare and verify an isolated **non-Production** environment for the Customer Project Center pilot.

Approved pilot cohort:
- 叶展龙
- 刘士玮
- 黄文强

Approved non-Production Supabase project:
- name: `hongda-review-dev`
- project ref: `xulmpqaknlwqqculbsek`
- expected URL: `https://xulmpqaknlwqqculbsek.supabase.co`

Production Supabase is explicitly forbidden:
- name: `hongda-new-media`
- project ref: `amqpvxrurenevniilhtl`

The pilot must use Vercel **Preview**, never the Production deployment.

## Permanent safety rules

- Never execute this runbook against Production.
- Never copy Production customer, ownership, payment, order, quotation, conversation, or financial data.
- Pilot application data must use obvious `PILOT-NONPROD` synthetic identifiers.
- Do not use destructive reconciliation: no DROP TABLE, TRUNCATE, DELETE-based reset, or data overwrite.
- Do not weaken RLS.
- Do not expose direct authenticated table write DML.
- If environment identity or migration state is ambiguous, STOP and resolve the mismatch before continuing.

## 1. Read-only preflight

### 1.1 Verify project identity outside SQL

Confirm the connected Supabase project is exactly:

`xulmpqaknlwqqculbsek / hongda-review-dev`

If the project ref is `amqpvxrurenevniilhtl`, STOP immediately.

Confirm Vercel Preview resolves `NEXT_PUBLIC_SUPABASE_URL` to:

`https://xulmpqaknlwqqculbsek.supabase.co`

Confirm `NEXT_PUBLIC_FEATURE_CUSTOMER_PROJECT_CENTER=true` exists only in Preview for the controlled pilot.

### 1.2 Read migration history

Run read-only SQL:

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
  '20261006140000'
)
order by version;
```

Expected repository sequence:

1. `20261001143000_customer_project_center_phase5a_core_foundation.sql`
2. `20261002024500_customer_project_center_phase5b_mutation_rpcs.sql`
3. `20261002033500_customer_project_center_phase5d_progress_waiting_event.sql`
4. `20261002050000_customer_project_center_phase5f_customer_followup.sql`
5. `20261002065000_customer_project_center_phase6b_reschedule_rpc.sql`
6. `20261002073000_customer_project_center_phase6c_ai_drafts.sql`
7. `20261002090000_customer_project_center_phase7a_reports.sql`
8. `20261006140000_customer_project_center_pilot_env_hardening.sql`

### 1.3 Read CPC object inventory

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'cpc_%'
order by table_name;

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'cpc_record_customer_follow_up',
    'cpc_reschedule_work_item',
    'cpc_create_ai_work_item_draft',
    'cpc_generate_daily_report_draft'
  )
order by p.proname;
```

Required late-phase objects before hardening:
- `public.cpc_projects`
- `public.cpc_ai_drafts`
- `public.cpc_reports`
- `public.cpc_record_customer_follow_up`
- `public.cpc_reschedule_work_item`

### 1.4 Confirm CPC data is empty before pilot seeding

```sql
select 'cpc_customer_references' as table_name, count(*) from public.cpc_customer_references
union all select 'cpc_projects', count(*) from public.cpc_projects
union all select 'cpc_project_events', count(*) from public.cpc_project_events
union all select 'cpc_work_items', count(*) from public.cpc_work_items
union all select 'cpc_ai_drafts', count(*) from public.cpc_ai_drafts
union all select 'cpc_reports', count(*) from public.cpc_reports;
```

Unexpected real-looking rows are a STOP condition.

## 2. Migration reconciliation decision

For each required migration in order:

### Case A — migration history present + expected objects present
No action.

### Case B — migration history absent + expected objects absent
Apply that repository migration in chronological order.

### Case C — migration history absent + expected objects already present
Do **not** blindly rerun a non-idempotent historical migration.

1. Verify the exact required tables/functions/RLS contracts against the repository migration.
2. Verify there is no real business data.
3. Only after PM verification, repair the non-Production migration history for that version.
4. Continue to the next migration.

Example CLI form for an already-verified non-Production version:

```bash
supabase migration repair --status applied <VERSION> --project-ref xulmpqaknlwqqculbsek
```

Never use the Production project ref.

### Case D — migration history present + expected objects missing
STOP. This indicates schema/history corruption and must not be auto-repaired.

## 3. Apply the hardening migration last

After Phases 5A, 5B, 5D, 5F, 6B, 6C and 7A are verified, apply:

`20261006140000_customer_project_center_pilot_env_hardening.sql`

This migration is forward-only and idempotent. It:
- fails closed if required CPC objects are missing;
- revokes `PUBLIC` and `anon` execution from:
  - `auth_has_role(text)`
  - `auth_org_id()`
  - `auth_profile_id()`
- explicitly preserves `authenticated` EXECUTE needed by approved RLS/application flows.

## 4. Postflight verification

### 4.1 CPC RLS

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'cpc_%'
order by tablename;
```

Every CPC table must report RLS enabled.

### 4.2 Auth-helper privileges

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('auth_has_role', 'auth_org_id', 'auth_profile_id')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by routine_name, grantee;
```

Expected:
- no `PUBLIC` EXECUTE
- no `anon` EXECUTE
- `authenticated` EXECUTE present

### 4.3 Security Advisor

Run the Supabase Security Advisor after hardening.

STOP if a CPC change introduces:
- anonymous SECURITY DEFINER execution;
- disabled/missing CPC RLS;
- direct authenticated CPC table write privileges;
- a new critical/high-risk finding attributable to the pilot migration.

Pre-existing findings in unrelated legacy modules must be recorded separately and must not be silently changed as part of this pilot task.

## 5. Synthetic pilot data only

After postflight passes:

- create a dedicated synthetic organization or use a clearly isolated non-Production organization;
- use dedicated non-Production login identities for the three named testers;
- label synthetic customers/projects with `PILOT-NONPROD`;
- never import Production customer lists, ownership mappings, receipts, orders, quotations, chats, or historical transactions;
- create only enough synthetic projects/tasks/events to exercise the Phase 12 pilot scenarios.

## 6. Stop conditions

Stop the pilot immediately if any of these occur:

- Preview points to Production Supabase;
- Production project ref appears in an execution command;
- RLS is disabled or a CPC table becomes anonymously writable;
- `PUBLIC` or `anon` can execute a hardened auth helper;
- migration history and schema objects disagree in an unexplained way;
- a migration would require destructive repair;
- real customer/ownership/finance/order/quotation/conversation data appears;
- auth, permission, stale-version, replay, or concurrency behavior violates the Phase 12 acceptance contract.

## 7. Rollback / containment

Rollback owner: project owner.

For a pilot defect:
1. stop tester access;
2. disable the Customer Project Center Preview feature flag or retire the Preview deployment;
3. preserve logs/evidence;
4. do not reverse schema with destructive SQL;
5. repair in repository first;
6. recreate/reset only the isolated non-Production environment if a clean reset is required;
7. rerun preflight and postflight before resuming.

## 8. Pilot evidence required for PILOT_PASS

`PILOT_PASS` remains **NO** until human-observed evidence exists for the approved 2–3 project owners covering:
- normal create/update/progress flows;
- authorization boundaries;
- stale-version / replay / concurrency behavior;
- UNKNOWN semantics;
- empty/partial/loading/denied UI states;
- mobile-critical paths;
- manager/team view without ranking or attitude inference;
- stop/rollback procedure.

Production remains closed even after repository readiness. Production requires a separate explicit human gate.
