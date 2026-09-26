# Repository Agent Rules

These rules apply repository-wide. A nested `AGENTS.md` is more specific for its
path, but the global safety gates below still apply.

## Agent Control source of truth

- GitHub Issue #10 is the Customer Project Center control plane.
- The machine-readable control block controls automation. Explanatory prose does not.
- The active PM task defines the exact work scope.
- If control state, task ID, branch, or head is stale or ambiguous, fail closed.
- Do not replay a completed task at the same or a newer head.

## Required execution behavior

1. Read the current Agent Control state.
2. Read the newest active PM task.
3. Verify `TASK_ID`, expected branch, base, and head.
4. Execute only the active `READY_FOR_CODEX` or `FIX_REQUIRED` task.
5. Never expand scope silently.
6. Run the required tests.
7. Commit and push only to the task-authorized branch.
8. Post the structured Completion Contract.
9. Stop for PM review.

## Global safety gates

Never autonomously:

- merge a pull request
- push directly to `master` or `main`
- execute Production SQL
- change Production RLS
- change Production environment variables
- delete or overwrite Production data
- alter customer ownership truth
- alter financial source-of-truth
- publish externally on behalf of Hongda
- print or log secret values
- use service-role secrets for Agent Control automation

Additional hard stops:

- `ONE_ACTIVE_TASK_PER_REPO = true`
- `MAX_AUTO_FIX_ROUNDS = 3`
- `AUTO_MERGE = false`
- `AUTO_PRODUCTION = false`
- no force push
- stale task/head fails closed

## Project data rules

- Formal Customer Project Center data must not use `localStorage`, `site_data`, or
  generic `/api/data` as source of truth.
- Business profile FKs use `profiles.id`.
- AI proposals are drafts; AI proposal != business fact.
- External canonical customer ownership and payment sources remain authoritative.
- Do not repair legacy `leads`, `site_data`, or `ai_jobs` security debt inside
  unrelated tasks.

## Agent Control protocol

See `docs/agent-control/PROTOCOL.md` for actor roles, state transitions,
Completion Contract semantics, auth boundaries, and staged automation phases.
