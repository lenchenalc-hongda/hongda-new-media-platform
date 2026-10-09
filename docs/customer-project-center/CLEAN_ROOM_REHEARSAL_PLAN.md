# Customer Project Center Clean-Room Rehearsal Plan

## Status

- Repository-only plan
- `REHEARSAL_EXECUTED = NO`
- No disposable database was created or used for this task.
- No Production database, schema, RLS, migration history, data, or environment
  was accessed.
- Creating a Supabase Branch or project may incur cost and requires separate
  user cost confirmation. This repository task must not create one.

## Goal

Rehearse the exact nine-file Production candidate in a disposable
non-Production database before Gate A. The rehearsal proves that the SQL,
assertions, RLS, RPC privileges, and replay behavior work from the required
legacy baseline without using real business data.

Production Gate A remains read-only. All candidate-file writes,
`cpc_create_project` replay/idempotency tests, stale-version and concurrency
proofs, and every other behavior test are performed only in this disposable
clean room. Do not execute a synthetic write or RPC in Production under this
plan. A Production behavioral write would require a separate explicitly
approved scope.

## Environment Contract

The clean room must:

- be a disposable Supabase project or branch, never Production;
- be separate from `hongda-review-dev` and `hongda-new-media`;
- be built from the required legacy schema and auth helper baseline;
- contain no Production customer, ownership, order, payment, quotation,
  conversation, or finance data;
- use synthetic identities and synthetic organizations only;
- use an obvious prefix such as `CLEANROOM-NONPROD`;
- be destroyed or retired after evidence capture, subject to owner approval.

Minimum legacy baseline:

- `public.profiles`
- `public.organizations`
- `public.profiles(id, org_id)` uniqueness
- `public.auth_profile_id()`
- `public.auth_org_id()`
- `public.auth_has_role(TEXT)`
- `public.set_updated_at()`

The rehearsal owner must record the exact Postgres version and Supabase project
or branch identifier. Do not use the Production project ref.

## Rehearsal Steps

1. Provision the disposable clean room after separate cost approval.
2. Record a schema snapshot of the clean baseline.
3. Apply the exact nine files in the order and with the integrity checks in
   `PRODUCTION_SQL_EXECUTION_MANIFEST.md`.
4. Stop after each file and run that file's post-apply assertions.
5. Do not continue after a failed assertion.
6. Create synthetic organizations, profiles, customer references, Projects,
   WorkItems, events, AI drafts, and reports only.
7. Run RLS, ACL, write, replay, concurrency, report, and AI review checks only
   against the clean room.
8. Capture migration history, schema, ACL, RLS, trigger, index, and advisor
   evidence.
9. Compare the final schema contract with the non-Production pilot contract.
10. Record PASS or FAIL and retire the clean room.

## Per-File Verification

Use the per-file assertions in `PRODUCTION_SQL_EXECUTION_MANIFEST.md`.

The rehearsal must explicitly record:

- object creation after each file;
- RLS status after Phase 5A, 6C, and 7A;
- helper and RPC ACLs after Phase 5B, 5F, 6B, 6C, and 7A;
- hardening privilege results after file 8;
- replay index validity and duplicate preflight after file 9;
- migration-history rows after the complete sequence.

## Final Behavioral Checks

Use synthetic users for these roles: `admin`, `manager`, `sales`, and a denied
unrelated role if available.

### RLS and ACL

- Every CPC table has RLS enabled.
- The nine exact SELECT policies exist.
- No client table write grant exists.
- `authenticated` has only the approved helper/RPC EXECUTE set.
- `anon` and effective `PUBLIC` cannot execute consequential CPC RPCs.
- Base auth helpers are revoked from `PUBLIC` and `anon`, retained by
  `authenticated`.

### Create and Replay

- Create a synthetic Project with a next action.
- Repeat the same actor/request id and verify the same Project is returned.
- Verify replay creates no second Project, initial WorkItem, or
  `PROJECT_CREATED` audit row.
- Verify a stale expected version returns `VERSION_CONFLICT`.

### Progress and Waiting

- Record meaningful progress with a synthetic event.
- Enter waiting with reason and check time.
- Resolve waiting and verify `WAITING_STARTED`, `WAITING_RESOLVED`, and
  `STAGE_CHANGED` events are emitted only when material state changes.
- Verify active Project cannot be stranded without a next action or waiting
  state.

### WorkItem and Follow-up

- Complete or replace the current next action through an approved path.
- Reschedule an open WorkItem and verify old/new due times, reason, version, and
  preserved status in audit.
- Record customer-level follow-up without creating a Project.
- Verify duplicate open follow-up is rejected.

### AI Draft

- Create a synthetic WorkItem AI draft.
- Verify draft creation does not create formal work.
- Accept once and verify the controlled WorkItem RPC created the task.
- Verify replay or stale rejection does not duplicate formal work.
- Reject a separate draft and verify only the draft state changes.

### Reports

- Generate a synthetic daily draft with deterministic metrics.
- Verify future dates are rejected.
- Submit and verify the submitted snapshot is immutable.
- Create a correction and verify a new draft revision is created instead of
  changing the submitted source.
- Verify the internal metric builder is not callable by client roles.

## Evidence Package

Record:

- clean-room project or branch identifier and Postgres version;
- exact candidate SHA, nine Git blob SHAs, and SHA-256 values;
- command or operator log with secrets redacted;
- per-file assertion results;
- final migration-history rows;
- normalized schema snapshot;
- RLS, policy, index, trigger, function signature, and ACL queries;
- Security Advisor output before and after;
- synthetic scenario results;
- write, replay/idempotency, stale-version, and concurrency proof results;
- comparison notes against the non-Production pilot contract;
- explicit PASS or FAIL;
- cleanup or retirement evidence.

Never record Supabase keys, service-role keys, connection passwords, access
tokens, cookies, or Production data.

## Comparison to Non-Production Pilot Contract

After rehearsal, compare the clean-room final contract with the verified
`hongda-review-dev` pilot contract:

- table and column inventory;
- constraints and indexes;
- function identity arguments, `prosecdef`, and pinned search path;
- RLS and policy names;
- trigger names and behavior;
- table and routine grants;
- replay guard and `cpc_create_project` body markers.

Differences caused only by test data or ephemeral sequence values are not schema
differences. Any schema difference requires PM review before Production Gate A.

## PASS Criteria

`CLEAN_ROOM_REHEARSAL_PASS` requires all of:

- all nine files applied in order from the required baseline;
- no destructive statement or RLS weakening;
- every per-file assertion passed;
- all final RLS and ACL assertions passed;
- create-project replay returned the original result with no duplicate;
- stale-version and unauthorized paths failed closed;
- AI and report flows remained non-authoritative or immutable as designed;
- advisor findings attributable to CPC were reviewed and accepted or resolved;
- schema contract matched the approved non-Production pilot contract;
- no real business data or secret value appeared;
- evidence package is complete.

## FAIL and Stop Conditions

Stop and mark FAIL if:

- a candidate hash differs;
- a file fails before or during apply;
- a schema object is missing or has a different signature;
- RLS is disabled on any CPC table;
- direct authenticated DML is present;
- `PUBLIC` or `anon` can execute a CPC or base auth helper;
- replay creates duplicate formal work;
- authorization or stale-version checks fail open;
- submitted reports can be mutated;
- a real customer, ownership, finance, order, quote, conversation, or other
  business record appears;
- a secret value is exposed;
- advisor findings are unresolved;
- the clean room cannot be isolated from Production.

Do not repair Production based on this plan. A successful rehearsal is evidence
for PM review, not Production approval.
