# Bounded general READY task contract, v1

## Scope of this change

The existing READY publisher recognizes two fixed acceptance tasks. The general
READY path now combines the pure parser and file policy with a fail-closed,
isolated Mac runner and a separately credentialed publisher. The existing fixed
acceptance path remains unchanged.

## Trusted task format

The newest Issue #10 task comment must be authored by the repository owner.
Its entire body is exactly seven lines, plus an optional final newline:

```text
AGENT_CONTROL_READY_TASK_V1
TASK_ID = CPC-AUTO-004-EXAMPLE-001
TASK_STATUS = READY_FOR_CODEX
BASE_MASTER_SHA = <40 lowercase hex characters>
ALLOWED_PATHS_JSON = ["docs/customer-project-center/WORKFLOW_V1.md"]
CHECKS = typecheck,agent-control
OBJECTIVE_B64 = <canonical base64 of UTF-8 task text>
```

The Issue machine state must separately select the same task ID and live master
SHA. The future workflow must use the newest owner task comment; an older valid
comment cannot override a newer invalid or different task. Duplicate or extra
fields fail closed. The objective is data for the isolated Codex process and
must never be interpolated into shell commands.

Paths are exact filenames, not patterns. At most six distinct paths are
accepted, under `docs/customer-project-center/`,
`src/lib/customer-projects/`, or `tests/unit/customer-project-*.test.ts`.
Hidden path segments, traversal, symlinks, submodules, renames, executable
files, and any changed path outside the list must be rejected before the
publisher receives a GitHub App token. The objective is capped at 4 KB.

Checks are selected from a fixed list, never arbitrary commands. Typecheck and
Agent Control checks are always required. Tasks touching code or tests also
require Customer Project Center tests, build, and secret audit. The future
runner must fail closed if any required check is absent or fails.

## Workflow wiring

1. Validate Issue state, newest trusted comment, master SHA and task fields on
   the cloud runner. Pass only normalized values to the isolated Mac job.
2. Run Codex without GitHub App, database, Production, or personal model keys.
   Record the clean base, git control state, file types and exact allowed diff.
3. Recheck live master and deterministic task branch before push and PR POST.
   Publish one Draft PR and authentic Completion Contract, with no force push.
4. PM verifies the live diff and same-HEAD CI/Vercel, then waits for explicit
   owner approval to merge. A PR-opened event may precede its Contract or CI;
   the hourly reviewer must resume without inventing a PASS.

The cloud validator exports only the normalized objective, exact paths, fixed
check names, task ID, base SHA and trusted comment ID. Codex executes under
`env -i` without a GitHub token, database credential, Production credential or
personal model key. It cannot stage, commit or push. The runner rejects any
extra path, rename, symlink, submodule, executable/mode change or git-control
mutation, then runs only repository-owned commands selected by validated names.

Only after all checks pass does the workflow mint a contents/PR GitHub App
token. The publisher revalidates Issue #10, the newest trusted task and live
master, uses a deterministic branch, never force-pushes, and creates or resumes
exactly one identical Draft PR. Conflicting remote state fails closed.

General READY execution remains **UNVERIFIED** until this wiring is merged and a
fresh bounded task creates a bot Draft PR that passes same-HEAD CI/Vercel and PM
review. No Customer Project Center database table, SQL, RLS, Production,
financial source, or customer ownership change is authorized.
