# Agent Control Reliability V2

## Goal

Agent Control must be unattended by default:

- normal project work continues without owner prompts;
- recoverable infrastructure failures are classified and retried automatically;
- stale control state is reconciled from live GitHub facts;
- genuine Human Gates stop safely;
- exhausted recovery becomes an explicit blocker and owner notification;
- Production remains fail-closed.

## Failure audit (2026-10-09 through 2026-10-16)

Observed failures included:

| Run | Project | Failure | Reliability V2 class |
| --- | --- | --- | --- |
| 38759538582 | WOS | Codex external auth invoked `/usr/bin/security`; exit 36 despite `DEEPSEEK_API_KEY_STATUS=AVAILABLE` | `KEYCHAIN_FAILURE` |
| 38719590595 | GLH | Same external-auth/keychain failure during bounded Codex execution | `KEYCHAIN_FAILURE` |
| 38712603948 | GLH | Validate rejected malformed latest task comment | `STALE_TASK` / contract drift |
| 38712187343 | WOS | GitHub action archive download returned 429 during self-hosted job setup | `NETWORK_FAILURE` |

The control plane also previously observed merged PR / stale Issue state drift. Reliability V2 treats GitHub PR/workflow facts as higher priority than cached machine state.

## Agent-only Codex runtime

The project runner now creates a temporary HOME and CODEX_HOME for every execution.

It never points the automation runtime at the user's Desktop `~/.codex` directory.

The runtime:

1. reads the installed Codex binary version;
2. discovers the installed CLI help surface before execution;
3. copies only an allow-listed DeepSeek provider block from the existing user config;
4. requires `env_key = "DEEPSEEK_API_KEY"`;
5. requires `requires_openai_auth = false`;
6. rejects any provider block containing keychain/external-auth commands;
7. injects the API key only through the process environment;
8. never prints the key;
9. fails if `/usr/bin/security`, keychain, or external-auth resolution appears during execution.

The user's regular Desktop Codex configuration is not modified.

## State separation

Business repair state and infrastructure recovery state are independent.

- `fix_round` is reserved for implementation/test repair.
- `infra_retry_count` is reserved for runner/provider/network recovery.
- `runtime_status` describes current runtime health without overwriting normal project task identity.

External view states:

- `RUNNING`
- `QUEUED`
- `WAITING_OWNER`
- `BLOCKED`
- `COMPLETE`

## Recovery

Each project workflow supports two trusted entry paths:

- owner `AGENT_CONTROL_TRIGGER_V1` issue comment;
- exact-state `workflow_dispatch` used by Reliability V2 recovery.

A failed execute job invokes `project-lane-recover.mjs`.

Recovery:

1. re-reads the live control Issue;
2. classifies the failed run;
3. refuses to retry Human Gates and completed/blocked states;
4. increments `infra_retry_count` without touching `fix_round`;
5. backs off;
6. dispatches the same project workflow;
7. polls GitHub until a real workflow-dispatch run exists;
8. records `RECOVERY_DISPATCHED` only with an actual run ID;
9. after three infrastructure retries, stops and marks the project `BLOCKED`.

## Lost-trigger watchdog

`Agent Control Reliability Watchdog V2` runs every 15 minutes on GitHub-hosted infrastructure.

It:

- scans every project in the registry;
- respects Human Gates;
- detects executable state with no real run;
- re-dispatches lost READY/FIX triggers;
- distinguishes queued/running from blocked;
- reconciles a stale review/merge state when the live PR is already merged.

The watchdog does not perform Production changes or invent new business tasks.

## Code/test failures

When Codex produces bounded edits but a requested typecheck/build/secret-audit/smoke check fails:

- the result is `CODE_FAILURE`, not infrastructure failure;
- the bounded edits are preserved to the same branch/PR;
- the Completion Contract records `TASK_STATUS = FIX_REQUIRED`;
- infrastructure retry count is not consumed.

Unsafe/out-of-scope edits still fail closed and are not published.

## Safety invariants

Reliability V2 does not authorize:

- Production SQL/schema/RLS/data;
- Production Storage policy/bucket mutations;
- Production env or secret changes;
- destructive Production actions;
- authentication boundary weakening;
- customer ownership or finance source-of-truth changes;
- real Meta/WhatsApp cutover;
- external Production publishing.

`AUTO_PRODUCTION=false`, max project concurrency 2, one active task per project, and shared-path serialization remain mandatory.

## Failure-injection contract

`tests/unit/agent-control-reliability-v2.test.ts` covers:

1. keychain failure;
2. transient network failure;
3. provider 401;
4. test failure does not consume infra retries;
5. stale merged PR reconciliation;
6. lost trigger redispatch;
7. Human Gate stop;
8. exhausted infra retry block.

Repository unit tests are necessary but not sufficient. Final V2 acceptance additionally requires a live self-hosted WOS Phase 1 run proving:

`READY_FOR_CODEX -> Codex execute -> files changed -> checks -> branch -> PR`.
