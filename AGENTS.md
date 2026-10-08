# Repository Agent Rules

These rules apply repository-wide. A nested `AGENTS.md` is more specific for its
path, but the global safety gates below still apply.

## Agent Control source of truth

- GitHub is the handoff layer for all Agent Control projects in this repository.
- Registered projects and their control issues live in `.github/agent-control/project-registry.json`.
- Each project has exactly one control issue and one machine-readable control state.
- Customer Project Center uses Issue #10.
- Global Lead Hub uses Issue #72.
- The machine-readable control block in the matching control issue controls automation.
- Explanatory prose does not override machine state.
- The active PM task defines the exact work scope for that project.
- If control state, task ID, branch, head, project identity, path ownership, or lock state is stale or ambiguous, fail closed.
- Do not replay a completed task at the same or a newer head.

## Required execution behavior

1. Resolve the project from the registered control issue.
2. Read that project's current Agent Control state.
3. Read the newest active PM task for that project.
4. Verify `PROJECT`, `TASK_ID`, expected branch, base, head, and allowed paths.
5. Execute only the active `READY_FOR_CODEX` or `FIX_REQUIRED` task for that project.
6. Never expand scope silently.
7. Never write outside that task's exact allowed paths.
8. Run the required tests.
9. Commit and push only to the task-authorized branch.
10. Post the structured Completion Contract to the matching PR.
11. Stop for PM review.

## Multi-project concurrency rules

- `ONE_ACTIVE_TASK_PER_PROJECT = true`.
- `MAX_PARALLEL_PROJECTS = 2` until the owner explicitly raises the limit.
- Different projects may execute concurrently only when their allowed paths do not overlap.
- `SHARED_PATH_LOCK = true`.
- Shared repository paths must never be edited concurrently by two projects.
- If a task requires a shared path, PM must serialize that shared-path task or explicitly assign the lock to one project before execution.
- A project-owned task must fail closed if another active task owns an overlapping exact path or shared path.
- Separate self-hosted runner work directories are required for true concurrent GitHub jobs. Never point two runner processes at the same runner work directory.

Typical project-owned roots:

- Customer Project Center: `src/app/customer-projects/`, `src/lib/customer-projects/`, `docs/customer-project-center/`, CPC-specific tests and migrations.
- Global Lead Hub: `src/app/global-lead-hub/`, `src/app/api/global-lead-hub/`, `src/lib/global-lead-hub/`, `src/components/global-lead-hub/`, `docs/global-lead-hub/`, GLH-specific tests and migrations.

Typical shared paths include root application/layout/configuration, shared navigation/components,
`package.json`, lockfiles, root middleware, root auth, common Supabase helpers, `.github/`,
`AGENTS.md`, and generic Agent Control infrastructure. A project lane may not change these
unless PM grants the shared-path lock through a separate bounded task.

## Global safety gates

Never autonomously:

- merge a pull request outside the standing PM merge authorization for the matching project control state
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

- `ONE_ACTIVE_TASK_PER_PROJECT = true`
- `MAX_PARALLEL_PROJECTS = 2`
- `SHARED_PATH_LOCK = true`
- `MAX_AUTO_FIX_ROUNDS = 3`
- `AUTO_MERGE = false`
- `AUTO_PRODUCTION = false`
- no force push
- stale task/head/project/path lock fails closed

## Project data rules

- Formal Customer Project Center or Global Lead Hub data must not use `localStorage`, `site_data`, or generic `/api/data` as source of truth.
- Business profile FKs use `profiles.id`.
- AI proposals are drafts; AI proposal != business fact.
- External canonical customer ownership and payment sources remain authoritative unless an explicit integration decision changes that contract.
- Do not repair legacy `leads`, `site_data`, or `ai_jobs` security debt inside unrelated tasks.

## Agent Control protocol

See:

- `docs/agent-control/PROTOCOL.md` for the original Agent Control protocol.
- `docs/agent-control/MULTI_PROJECT_PROTOCOL.md` for project lanes, path ownership, shared locks, runner-pool concurrency, and migration from single-repo serialization.

## Production boundary

Parallel development does not relax Production safety. Production SQL/RLS/env/secrets,
Production data writes/deletes/overwrites, destructive migrations, real Meta/WhatsApp Production
cutover, customer ownership truth, finance source-of-truth, and external publishing remain explicit
human gates.
