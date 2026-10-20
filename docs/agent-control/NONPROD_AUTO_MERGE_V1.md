# Agent Control — Restricted Non-Production Auto-Merge Authorization (V1)

Authorized by the owner on 2026-10-20 for **ordinary development changes in non-Production integration only**.

## Isolation invariant

The current `master` branch is connected to Vercel **Production** and the existing Agent Control Runner creates PRs with `base=master`. A merge to `master` is a Production deployment trigger even if the PR author says "development". Consequently, this standing authorization **never authorizes merging to `master`**.

The only eligible automatic merge base in V1 is:

`integration/hongda-dev`

No change to Vercel's Production branch, domains, deployments, SQL, RLS, env, secrets or actual customer data is authorized. Approval of an ordinary PR does not imply approval of production rollout.

## Mandatory gates — ALL must pass

1. PR is from the same repository, `open`, `draft=false`, and **base exactly** `integration/hongda-dev`. Reject release, master/main, and any unknown base.
2. PR must have a registered project matching its **control Issue**, current task ID, head branch, and live 40-character HEAD SHA.
3. Control Issue machine state must be `APPROVED_FOR_MERGE`, `pm_review=PASS`, and `pm_review_head` exactly equal to the PR's live HEAD. `auto_production` and `production_execution_authorized` must be false. HUMAN_GATE or stale status fails closed.
4. Exact-head CI (typecheck, build, smoke, secret audit) and relevant PDF QA are all successful, with no failed/cancelled/pending checks. A status on an old SHA never counts.
5. Changes must be within the registry's project-owned prefixes (WOS/GLH/CPC, or later separately registered quotation project). **Always reject** `.github/`, `scripts/agent-control/`, `docs/agent-control/`, root configs/lockfiles, auth, shared navigation, migrations/RLS/SQL, secrets and any shared/unowned path.
6. Enforce one active task/PR per project, max 2 heavy execution lanes, and cross-project shared path locks. No merge on ambiguity.
7. Merge with GitHub `expected_head_sha` lease (no force push) and recheck PR base/HEAD/CI just before merge.
8. Write exact PR, task ID, head SHA, checks and merge SHA to an audit record. Preserve source snapshots; never overwrite earlier history.

## Explicit exclusions

- Production/master merge; Production deployment; database migrations including test migrations unless separately authorized; RLS/permissions/env/auth changes; secrets.
- Real WhatsApp/Meta integrations, external publishing, customer/financial source-of-truth modifications, irreversible operations.
- Large/unreviewed dependencies, shared paths, security architecture, ambiguous change categories, PR with `HUMAN_GATE` or `NEEDS_DECISION`.
- Any PR based on `master` until intentionally moved to an isolated integration lane **with its machine state, runner, CI and reconciliation updated together**.

## Rollout

**Phase 0**: Record owner authorization in Agent Control Issue #109; create this isolated branch; implement and test fail-closed merge guards in isolation. The original production-linked workflows keep `AUTO_MERGE=false`.

**Phase 1**: Bring PR publishing, validator, CI, watchdog and PM control-state reconciliation into a coherent integration-branch lane; run one pilot and prove no Vercel Production redeploy.

**Phase 2**: Enable automatic gated merge of ordinary eligible PRs targeting this integration branch, and continue non-Production tasks from the integrated state. A **separate owner-approved release PR into master** is always required.

This document grants authority but does not falsely assert the GitHub Actions auto-merger is deployed. Policy does not silently modify unrelated running PRs.
