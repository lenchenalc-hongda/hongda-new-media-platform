# Agent Control Protocol

## Purpose

Agent Control provides a deterministic handoff between a human owner, ChatGPT PM
reviewer, and Codex engineer while preserving human gates for merge, Production,
sensitive data, and external communication.

GitHub Issue #10 is the control plane for the Customer Project Center. Repository
code may parse and validate that control plane, but explanatory prose must not
control automation.

## Actor roles

- **Human Owner**: approves business decisions, merges, Production changes,
  destructive actions, customer ownership changes, financial source-of-truth
  changes, and external publishing.
- **ChatGPT PM Reviewer**: publishes the active task, reviews real diffs/CI, and
  moves work between review states.
- **Codex Engineer**: executes only the active task, runs tests, pushes only to
  the authorized branch, posts a Completion Contract, and stops.
- **GitHub Control Plane**: stores state, task comments, PR facts, CI results,
  completion contracts, and audit history.

## Status machine

States:

- `READY_FOR_CODEX`
- `CODEX_WORKING`
- `WAITING_REVIEW`
- `FIX_REQUIRED`
- `NEEDS_DECISION`
- `APPROVED_FOR_MERGE`
- `MERGED`
- `BLOCKED`
- `FAILED`

Allowed transitions:

- `READY_FOR_CODEX -> CODEX_WORKING`
- `FIX_REQUIRED -> CODEX_WORKING` while `fix_round <= max_fix_rounds`
- `CODEX_WORKING -> WAITING_REVIEW | FAILED | BLOCKED | NEEDS_DECISION`
- `WAITING_REVIEW -> FIX_REQUIRED | APPROVED_FOR_MERGE | NEEDS_DECISION`
- `APPROVED_FOR_MERGE -> MERGED` only through explicit human action
- any state -> `BLOCKED` on safety, auth, concurrency, or unrecoverable failure

`MERGED`, `BLOCKED`, `NEEDS_DECISION`, and `FAILED` are not executable.

## Active task semantics

- One active task per repository.
- Only `READY_FOR_CODEX` and `FIX_REQUIRED` are executable.
- The active task ID must match between control state and the newest PM task.
- Stale task ID, branch, or head fails closed.
- Completed `TASK_ID + HEAD_SHA` pairs are never replayed.
- `FIX_REQUIRED` requires `fix_round >= 1`.
- More than `MAX_AUTO_FIX_ROUNDS = 3` requires human attention.

## Machine-readable state

Issue #10 contains exactly one delimited JSON block:

````text
<!-- AGENT_CONTROL_STATE_START -->
```json
{ ... }
```
<!-- AGENT_CONTROL_STATE_END -->
````

The JSON block is the routing source. Human-readable Markdown explains it but
does not override it. The parser rejects missing, duplicate, malformed, or
unknown schema data instead of coercing it.

Parser guarantees:

- no YAML
- no dynamic code execution
- no network access
- exactly one start marker and one end marker
- exactly one fenced JSON object between markers
- strict unknown-field rejection
- `auto_merge = false` and `auto_production = false` in schema v1

## Source precedence

1. Issue #10 machine-readable control state selects the active task and status.
2. The newest PM task comment defines task scope and expected base/head.
3. The active PR provides actual head, CI, and completion history.
4. Explanatory prose cannot override machine state.

If those sources disagree, Codex must fail closed and report `BLOCKED` or
`NEEDS_DECISION` rather than guessing.

## Completion Contract

Every completed task posts one structured Completion Contract containing:

- task ID and task status
- branch and head SHA
- PR number or explicit no-PR status
- files changed
- tests executed and results
- database, migration, RLS, and Production safety flags
- known limitations
- readiness for PM review

The PM review uses the real diff and CI, not the Completion Contract alone.

## Human Gates

Explicit human approval is required before:

- merging any PR
- Production SQL
- Production RLS
- Production environment changes
- destructive data changes
- customer ownership changes
- financial source-of-truth changes
- external publishing

`AUTO_MERGE = false`

`AUTO_PRODUCTION = false`

## Stale-head behavior

Before mutation:

- verify expected task ID
- verify expected branch
- verify live PR head equals `verified_head`
- verify no existing completion contract for the idempotency key

If verification fails, do not mutate code and report stale state.

## Idempotency and concurrency

Schema v1 idempotency key:

`repository:current_task_id:verified_head`

Future trigger automation must combine that key with:

- workflow concurrency group
- one active task per repository
- trigger comment identity
- existing Completion Contract detection
- no retry loop beyond the configured limit

## Future automation phases

### AUTO-PHASE-1

- root AGENTS.md
- durable protocol
- versioned control state
- parser/schema validator
- idempotency helper
- dry-run CLI and tests
- no Codex invocation or model call

### AUTO-PHASE-2

- trusted read-only `issue_comment.created` and `workflow_dispatch` trigger
- exact repository: `lenchenalc-hongda/hongda-new-media-platform`
- exact Issue: `#10`
- allowlist: `lenchenalc-hongda`
- standalone trigger sentinel: `AGENT_CONTROL_TRIGGER_V1`
- edited comments do not trigger
- permissions are limited to `contents: read`, `issues: read`, and
  `pull-requests: read`
- concurrency group: `agent-control-dry-run-${{ github.repository }}` with
  `cancel-in-progress: false`
- Issue #10 machine-readable state remains authoritative; trigger-comment text
  cannot override it
- live master and PR facts are validated against control state
- no persistent claim or lock marker is written yet
- idempotency key is computed but not persisted
- dry-run results: `READY`, `NOT_EXECUTABLE`, `UNTRUSTED_TRIGGER`,
  `INVALID_STATE`, `STALE_MASTER`, `STALE_PR_HEAD`, `INVALID_PR_STATE`
- no Codex/model invocation, OpenAI auth, or GitHub mutation
- real `issue_comment` execution can be verified only after this workflow exists
  on the default branch; PR verification relies on unit tests and normal CI

### AUTO-PHASE-3

- Codex audit-mode invocation
- read-only workspace
- no GitHub write token

### AUTO-PHASE-4

- isolated write-enabled automation
- dedicated branch/Draft PR/comment identity
- `workspace-write` sandbox
- no merge and no Production

### AUTO-PHASE-5

- ChatGPT Work PR activity trigger, configured account-side
- bounded automatic FIX_REQUIRED loop
- human merge gate remains mandatory

## Auth boundaries

- Phase 1 uses no model, GitHub write, or OpenAI credential.
- Future GitHub writes should use a least-privilege GitHub App installation token.
- Future OpenAI execution should use officially supported workload identity
  federation when available, otherwise a protected-environment credential.
- Never pass service-role or application provider secrets into Codex automation.
- Never print secret values.

Current external facts for later phases:

- GitHub Actions OIDC workload identity federation is supported for OpenAI API.
- Codex workload identity federation is documented but beta for managed ChatGPT
  workspaces and requires workspace enablement.
- ChatGPT Work can use account-side GitHub PR event triggers for eligible
  accounts; repository code cannot silently configure that account integration.

## PM-maintained control state

ChatGPT PM maintains the live machine-readable block in Issue #10. The repository
parser must remain compatible with schema v1.
