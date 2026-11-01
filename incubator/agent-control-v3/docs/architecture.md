# AC-V3-001: architecture and invariants (2026-11-01)

Owner authorization: P0-P3 only, no Production mutations or automatic merge of old blocked PRs. Track the source in HongdaOS issue #204.

## Authoritative components

- **Control DB:** dedicated Supabase/Postgres project, schema `ac_control`, private and not exposed by PostgREST. The DB is the *only* authoritative state for task selection, approvals, leases and transition history.
- **Event ingestion:** verify GitHub HMAC-SHA256 delivery, deduplicate by immutable delivery ID; treat webhook payload as untrusted evidence and reconcile against fresh GitHub API facts.
- **Planner:** deterministic selection exclusively from human-approved epics and predeclared acceptance contracts. LLM can suggest a draft but cannot approve its own work or enlarge allowed paths.
- **Transactional outbox:** DB transaction atomically reserves task + lease epoch + event + outgoing dispatch intent; a separate worker publishes idempotently.
- **GitHub Actions:** retains Coding/CI jobs, never becomes the authority for which task is allowed. Task-scoped OIDC JWT attests allowed workflow/repository/job, not comment authorship.
- **Release policy:** separate issuer verifies exact HEAD, merged SHA and CI evidence; P4 release feature gate stays off during P0-P3.
- **Mirror:** GitHub issue comments and dashboard are projections. Writes to human issue text NEVER act as machine-state CAS or task approval.

## State machine

`DRAFT -> QUEUED -> DISPATCHING -> CODING -> PM_REVIEW -> (FIX_REQUIRED -> QUEUED) | MERGE_ELIGIBLE -> MERGED -> RELEASE_VERIFIED`.

`RECONCILING` is entered for ambiguous dispatch acknowledgements, elapsed leases, or uncertain external states. It is **not** immediately redispatched. `HUMAN_GATE`, `BLOCKED`, `CANCELLED` and `COMPLETE` have explicit entry gates.

Completed task (`RELEASE_VERIFIED`) does not mean entire project is complete. Planner examines approved dependency DAG and may enqueue the next independently approved task.

## Critical safety invariants

1. `task_id + lease_epoch + op_key` is the idempotency identity for every dispatch attempt.
2. DB transactions serially allocate global coding slots and file-scope locks; no two active writers overlap. Default capacity is 2 Coding tasks, NOT 2 outstanding PRs.
3. A stale lease worker cannot advance task status. Lease expiry moves to RECONCILING until GitHub run provenance is established.
4. Whole-body GitHub Issue PATCH is forbidden as a state update mechanism.
5. Event processing and DB transitions are idempotent; outbox must be persisted within the same transaction as task claim.
6. Outbox HTTP 204 is not sufficient evidence a GitHub workflow ran; no second dispatch until run correlation is unambiguous.
7. OIDC validation must bind issuer, audience, immutable repo ID, exact workflow path/ref, event, branch, SHA, run ID and temporal claims. Bot username is not proof.
8. The reviewer cannot be the writer or grant its own merge permission; all evidence is re-fetched from GitHub using exact SHA.
9. No successful phase completion triggers an unapproved task. No Git-connected Production deployment is classified as merely a code-only no-op.
10. GitHub App/Runner credentials stay outside the code repository; token write scopes are minimal and independently audited.

## P0-P3 planned acceptance

- **P0** architecture, threat model, independent repository and DB cost/ownership, rollback specification.
- **P1** actual PostgreSQL concurrent worker claim test, stale epoch test, resource/path collision test, privileged role/RLS validation, crash after commit / before HTTP send.
- **P2** test GitHub webhook duplicates and invalid signatures, OIDC impersonation, HTTP-accepted dispatch with unknown Run, runner failure and recovery without double execution.
- **P3** approved-epic DAG planning, capped retries, 10 sequential nonprod tasks, no Production release, independent PM review, verified heartbeats/alerts.

## Implementation priority

P1 atomic state and Outbox before P2 dispatch. P2 evidence-based dispatch before P3 planner. V2 remains the sole live runner during shadow operation. Never register V3 against the same writable control Issue while V2 owns it.

## Attestation service boundary

The OIDC validator is a service-side mandatory prerequisite of calling
`ac_control.bind_verified_workflow_run`; a SQL digest alone is NOT proof of
identity. No SQL function may be granted to a coding agent that would let it
claim arbitrary OIDC verification. The attestation service requires an approved
GitHub App, a pinned JWKS trust source and dedicated least-privilege DB role.
The external dispatch adapter remains disabled until these are configured.
