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
- a cheap pre-gate rejects obvious untrusted events before checkout or dependency
  installation
- the cheap gate reads the runner-provided `GITHUB_EVENT_PATH`
- the heavy validation job requires `needs.gate.outputs.trusted == 'true'`
- permissions are limited to `contents: read`, `issues: read`, and
  `pull-requests: read`
- concurrency group: `agent-control-dry-run-${{ github.repository }}` with
  `cancel-in-progress: false`
- Issue #10 machine-readable state remains authoritative; trigger-comment text
  cannot override it
- live master and PR facts are validated against control state
- missing active PR metadata is `INVALID_PR_STATE`, while transport/auth/rate
  limit failures remain `RUNTIME_ERROR`
- no persistent claim or lock marker is written yet
- idempotency key is computed but not persisted
- dry-run results: `READY`, `NOT_EXECUTABLE`, `UNTRUSTED_TRIGGER`,
  `INVALID_STATE`, `STALE_MASTER`, `STALE_PR_HEAD`, `INVALID_PR_STATE`
- no Codex/model invocation, OpenAI auth, or GitHub mutation
- real `issue_comment` execution can be verified only after this workflow exists
  on the default branch; PR verification relies on unit tests and normal CI
- live acceptance is required after merge before AUTO-PHASE-3 begins

### AUTO-PHASE-3

- Codex audit-mode invocation
- read-only workspace
- no GitHub write token

### MAC-3

- runs only for the explicitly authorized MAC-3 task after validated READY and routing proof
- uses the same dedicated self-hosted label set
- runs the installed bundled Codex binary with `codex exec`
- enforces `-s read-only`, `-c 'approval_policy="never"'`, and `--ephemeral`
- uses a fixed default-branch prompt and a portable strict Structured Outputs schema
- keeps the model-facing schema to the required common subset; exact acceptance identity is enforced again after generation
- requires exact top-level `task_id` and `acceptance_sentinel` key/value matches
- strips GitHub and application credentials from the Codex process environment
- checks `codex login status` in the same minimal environment and emits only availability, never auth output
- classifies failed Codex runs into bounded failure categories and emits only the last event type, never raw event/error logs
- performs before/after HEAD, status, and diff verification even when Codex exits non-zero
- emits only bounded proof fields and never prints the credential, raw diagnostic logs, or full environment

### MAC-2

- dedicated runner label set: `self-hosted`, `macOS`, `X64`,
  `hongda-agent-control`
- self-hosted proof job runs only after the cloud validator returns `READY`
- exact validated SHA checkout with `persist-credentials: false`
- self-hosted checkout action pinned to an immutable full commit SHA
- no Codex/model invocation
- no package installation
- no GitHub write permission
- repository integrity checks fail closed on HEAD/status/diff mismatch

### MAC-4

- first write-enabled phase is a fixed canary acceptance only; arbitrary PM task prose is not yet forwarded to Codex
- owner-approved runner user model remains the current `lenchen` macOS user with the existing isolated runner workdir
- Codex runs with `workspace-write`, approval policy `never`, ephemeral mode, ignored user config/rules, and a minimal environment
- Codex receives no GitHub App private key, installation token, `GITHUB_TOKEN`, PAT, application secret, DB secret, or Production credential
- the fixed canary permits exactly one path: `docs/agent-control/mac4-acceptance.md`
- HEAD plus a parent-shell hash of git control state (refs, local config, hooks, HEAD metadata, exclude/attributes), staged state, worktree shape, regular-file type, exact content hash, and structured output are verified before any GitHub write credential is minted
- GitHub write identity is a repository-scoped GitHub App installation token
- repository variable: `AGENT_CONTROL_APP_CLIENT_ID`
- repository secret: `AGENT_CONTROL_APP_PRIVATE_KEY`
- token creation uses immutable-pinned `actions/create-github-app-token` and explicitly requests only `contents: write` and `pull-requests: write`
- the installation token is minted only after Codex exits and passes all local checks; it is used only by the trusted default-branch wrapper
- wrapper uses a fixed system PATH, disables Git hooks for switch/commit/push, may push only deterministic `codex/agent-control-mac4-accept-<sha>` branches, and may create only a Draft PR
- wrapper never pushes `master`/`main`, never merges, never writes Issue #10, and never touches Production/DB/RLS
- branch existence is the first persistent idempotency guard for the live canary; an existing deterministic branch fails closed
- `AUTO_MERGE=false` and `AUTO_PRODUCTION=false` remain mandatory
- dynamic task execution and bounded automatic fix loops remain deferred to MAC-5

### AUTO-PHASE-4

- isolated write-enabled automation
- dedicated branch/Draft PR/comment identity
- `workspace-write` sandbox
- no merge and no Production

### AUTO-PHASE-5 / MAC-5

- MAC-5 repository automation handles only existing-PR `FIX_REQUIRED` states; it does not create new feature PRs from `READY_FOR_CODEX`
- Issue #10 remains the routing source and must name the active PR, active branch, exact verified head, task ID, and fix round
- maximum automatic fix rounds is exactly 3; a fourth round is not executable
- the active PR must be open, based on `master`, and its live head/branch must exactly match Issue #10 before Codex runs
- the newest trusted PM fix task must be a PR conversation comment authored by `lenchenalc-hongda` with standalone marker `AGENT_CONTROL_FIX_TASK_V1`
- the trusted task comment must contain exact `TASK_ID`, `TASK_STATUS = FIX_REQUIRED`, `EXPECTED_HEAD`, and `FIX_ROUND = n / 3` values matching control state
- task comments larger than 20 KB or comments from any other author are rejected
- Codex receives the trusted task text but no GitHub token, GitHub App key/token, application secret, database secret, or Production credential
- Codex remains `workspace-write`, approval policy `never`, ephemeral, with user config/rules ignored and a minimal process environment
- before any GitHub write credential is minted, the wrapper requires unchanged HEAD/git control metadata, no staged changes, a non-empty diff, no symlink/submodule/mode escalation, and at most 40 changed paths
- protected paths are fail-closed: `.github/`, root Agent Control/tooling/config files, `docs/agent-control/`, `scripts/`, `src/lib/agent-control/`, Agent Control tests, `supabase/`, every `*.sql` file, `.env*`, package manifests/lockfiles, `tsconfig.json`, `vercel.json`, and `next.config.*`
- after local checks pass, the same repository-scoped GitHub App identity from MAC-4 may mint only `contents: write` + `pull-requests: write`
- publisher must re-read the remote active branch and require it still equals the verified head both before commit publication and immediately before push
- publisher may only fast-forward the existing `codex/...` active PR branch; force push, master/main push, branch creation for new work, PR creation, merge, and Issue #10 mutation are prohibited
- manual GitHub publisher transport is pinned to HTTP/1.1; remote-head reads get at most one bounded retry, and an ambiguous failed push is checked against the remote commit before any single retry so an already-successful push is never blindly repeated
- Completion Contract POST also uses HTTP/1.1 with bounded connect/total timeouts; POST is not automatically retried to avoid duplicate comments after ambiguous responses
- publisher posts one structured Completion Contract to the active PR and stops
- normal CI and PM review determine whether the result becomes another bounded `FIX_REQUIRED`, `APPROVED_FOR_MERGE`, `NEEDS_DECISION`, or `BLOCKED`
- `AUTO_MERGE=false` and `AUTO_PRODUCTION=false` remain mandatory
- ChatGPT Work PR activity triggering remains account-side configuration; repository code cannot enable it
- until that account-side trigger is configured and verified, PM review is not claimed to be automatic even though the repo-side fix loop is ready

### CPC-AUTO-002 / READY bootstrap

- the READY bootstrap path is separate from MAC-5 and runs only for the dedicated canary task
  `CPC-AUTO-002-READY-BOOTSTRAP-ACCEPT-001`
- the trusted task source is the newest Issue #10 comment by the allowlisted owner with
  standalone marker `AGENT_CONTROL_NEW_TASK_V1`
- the task comment must contain `TASK_ID = <control state task>` and
  `BASE_MASTER_SHA = <control state master_sha>` with no duplicate key values
- machine state must be `READY_FOR_CODEX`, `active_pr = null`,
  `active_branch = null`, `fix_round = 0`, and
  `verified_head = master_sha = live master`
- the first live acceptance may change exactly one fixed canary file:
  `docs/agent-control/acceptance/ready-bootstrap.md`
- arbitrary task prose is never forwarded into the write-enabled process; Codex receives only
  the task ID, base SHA, fixed path, and fixed content contract
- Codex runs on the existing isolated Mac runner with workspace write, approval policy `never`,
  ephemeral mode, ignored user config/rules, and no GitHub App, database, Production, or
  application credential
- the wrapper verifies unchanged HEAD, unchanged git control metadata, no staged changes,
  exactly one new regular file, exact content, and structured output before minting credentials
- the GitHub App token is least-privilege and is minted only after Codex and local checks pass
- the publisher rejects an existing deterministic branch or open PR for that branch, creates only
  one `codex/agent-control-ready-bootstrap-<task>-<sha12>` branch, pushes without force, and opens
  one Draft PR
- publisher posts one bounded Completion Contract to the new Draft PR and never writes Issue #10
- `AUTO_MERGE=false` and `AUTO_PRODUCTION=false` remain mandatory

#### Work v2 PR-opened race

The bootstrap starts from Issue #10 state with `active_pr = null`. The PR-opened event therefore
occurs before Issue #10 can contain the new PR number or head. Work v2 Path A must not be claimed
to have bound the new PR automatically from that event.

After the Draft PR exists, account-side PM automation may bind it only after the owner/PM updates
Issue #10 control state to the exact `active_pr`, `active_branch`, and `verified_head` written in
the PR Completion Contract, while keeping `master_sha` pinned to the live base. Until that
account-side binding is configured and verified, review remains manual.

#### DeepSeek runner proof

A separate later task must prove an isolated DeepSeek runner before any provider migration:

- model identity is recorded without exposing credentials
- structured output and patch-tool behavior are verified
- provider failures have bounded classifications
- no personal API key is copied into GitHub, repository files, logs, or Codex process
  environment
- the current automated Codex provider/auth configuration is unchanged until that proof passes

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
