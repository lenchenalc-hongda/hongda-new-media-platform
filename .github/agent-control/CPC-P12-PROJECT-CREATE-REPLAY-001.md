# CPC Phase 12 Project-Create Replay Guard

TASK_ID = CPC-P12-PROJECT-CREATE-REPLAY-001

## Trigger

Automated controlled-pilot verification on `hongda-review-dev` replayed
`cpc_create_project` with the exact same authenticated actor and
`p_request_id`.

Observed result before this fix:

- first call returned one `project_id`;
- replay with the same `p_request_id` returned a different new `project_id`;
- the replay probe was rolled back, so the duplicate was not persisted.

Phase 12 acceptance explicitly requires a replayed formal mutation to create no
duplicate formal work. A duplicated Project is therefore an S1 pilot blocker.

## Scope

Repository-only fix:

1. Add a forward-only partial unique replay guard for authenticated
   `PROJECT_CREATED` audit rows, scoped by org + actor + request id.
2. Update `cpc_create_project` so a previously completed request returns the
   original project/next-action result.
3. Keep a unique-violation race fallback so two concurrent requests with the
   same request id cannot leave two projects behind.
4. Add Phase 12 static contract coverage.

## Acceptance

- Same org + actor + `PROJECT_CREATED` + non-null request id is unique.
- Replaying the same project-create request id returns the original
  `project_id` and `next_action_id`.
- A concurrent duplicate loses at the unique audit guard and resolves to the
  original result rather than leaving duplicate formal work.
- Existing project creation authorization, stage validation, NEXT_ACTION /
  waiting invariant and audit semantics remain unchanged.
- No destructive SQL.
- No Production execution.
- No customer ownership, finance, order, quotation, or external source-of-truth
  change.

## Safety

PRODUCTION_CHANGED = NO
AUTO_PRODUCTION = false
DESTRUCTIVE_MIGRATION = NO
