# WOS P1 QA Cloud Reaper — isolated observation-only review slice

## Scope and ownership

This is a **non-deployable source-only audit candidate**. It is deliberately NOT the merged/authorized runtime Cloud Reaper. The review branch is `review/wos-p1-cloud-reaper-observation-20261119`, and this documentation and its code/test paths are wholly within the existing WOS registry prefixes (`docs/workshop-order-system/`, `src/lib/workshop-orders/`, `tests/unit/workshop-order-`).

The existing `tests/unit/workshop-order-suite.test.ts` imports an explicit TypeScript bridge that runs the 20 Python unit tests. This permits the already-existing protected CI WOS suite to exercise the code at a new PR HEAD **without editing shared `.github/workflows/**` or `.github/agent-control/**` paths**.

## Locked infrastructure lane stays locked

- Issue #160 remains BLOCKED with lock owner PR #202 (Draft/unmerged, HEAD `b3f382976049eacabefc7965cbb90312fd6903cc`).
- PR #258 remains Draft/unmerged, HEAD `06696e2bad4c6e0b2da49e4c43f9b59095c9c568`, with its OLD unsafe workflow and OLD `tools/wos/**` files untouched.
- Issue #104 is POSTMERGE_VERIFY and has not registered the PR #258 task. This review PR is **not** a trusted WOS task registration, Completion Contract, lock handoff, or merge approval.
- The shared infra path checker requires exactly one open `infra/` PR with matching Issue machine state, head, branch and master. A comment/full Issue-body PATCH is NOT atomic CAS.

## Safety properties

The observation-only implementation makes only GET requests to the fixed QA Environment Secret **metadata** and public lease variable, and intentionally contains **no DELETE/PUT/PATCH/POST HTTP path**. Old behavior has a genuine secret-rotation race: GET lease, then unconditional DELETE can remove a new credential. Stale/orphaned lease now raises `CLOUD_REAPER_DELETE_DISABLED_UNSERIALIZED_WRITERS`, preserving fail-closed behavior without claiming deletion succeeded.

GitHub App `Environments: write` is **repository-level Environment authority**, not a single-secret scoped grant. Future observation workflow must explicitly mint `permission-environments: read`, but until independently reviewed, DO NOT install the App, configure it, enable the repo variable, mint tokens or run the workflow. App key already present in an Environment does not constitute installation or permission proof.

The Supabase QA Cron Sentinel is a separate revocation layer. Observation-only GET cannot replace revocation or guarantee deletion SLA; use no QA password/credential for tests.

## Required independent handoff and future work

1. Have an actually independent reviewer audit a dedicated serialized handoff design, the exact Issue #160 / PR #202 states, GitHub token/write provenance and concurrent-writer cases. Reviewer must issue a separate traceable PASS or BLOCKED result, not merely a comment by the same implementer.
2. Do NOT change Issue #160 status/lock until atomic and exclusive handoff is demonstrated and separately authorized. A stale master/HEAD or multiple active infra PRs must abort.
3. After safe and authorized handoff, a separate infra-owned change can revise PR #258's workflow path, change token requested permission from write to read, and wire the observation implementation. Do not silently treat this code-only review PR as the workflow.
4. Even with new exact-head CI, both this review PR and PR #258 MUST remain Draft and unmerged until new independent authorization. No App install, Secret write/delete, real QA database credentials, P1/P2 Gate, Production or V3 change.

## CI evidence criteria

The **new** GitHub-hosted PR CI must show execution of `Workshop Order System full contract suite` and log marker `WOS_P1_CLOUD_REAPER_OBSERVATION_ONLY_PYTHON_TESTS=PASS count=20`. A general GitHub check marked green without these steps is insufficient.
