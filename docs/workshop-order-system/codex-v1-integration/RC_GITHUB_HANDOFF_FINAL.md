# WOS V1 GitHub Handoff Final

HISTORICAL_ARCHIVE: YES
PR269_STATUS: CLOSED_UNMERGED
NOT_CURRENT_INSTALL_AUTHORITY: See `RC_QA_INSTALL_PLAN.md` and PR #270.

REPOSITORY: `lenchenalc-hongda/hongda-new-media-platform`
BASE_SHA: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`
RC_CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
RC_DELIVERY_BASELINE_COMMIT: `840b1c78f5c92bf58dc6445a1cb15f26daf442d9`
FINAL_DELIVERY_COMMIT: resolve with `git rev-parse HEAD`; a commit cannot
contain its own stable SHA.
CONTROL_ISSUE: #104
ACTIVE_TASK: `WOS-P2-M2-PROOF-LOCK-001`
ACTIVE_PR: #269
ACTIVE_PR_HEAD: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
ACTIVE_STATE: `WAITING_REVIEW`
REMOTE_PUSH: NOT_AUTHORIZED
NEW_ACTIVE_PR: NOT_AUTHORIZED

## Authoritative File Lists

- `RC_ALLOWED_PATHS.json`: machine-readable full diff path set
- `RC_FILE_DIFF.tsv`: full status with WOS/SHARED classification

The final delivery record adds this handoff file and the final compatibility /
Owner approval files after the `840b1c7` RC delivery commit. Their path entries
must be refreshed into the final JSON before the next local commit.

## PR #269 Overlap

The following five PR #269 blobs exactly match the RC code SHA:

- `docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql`
- `docs/workshop-order-system/nonproduction-only/WOS_P2_M2_SECURITY_AND_QA_AUTHORIZATION_20261120.md`
- `src/lib/workshop-orders/p2-handoff-timeline.ts`
- `tests/unit/workshop-order-p2-handoff-timeline.test.ts`
- `tests/unit/workshop-order-p2-m2-proof-lock.test.ts`

The sixth PR file, `tests/unit/workshop-order-suite.test.ts`, is a strict superset
in the RC because the RC imports additional WOS tests.

## Shared Paths

- `src/app/workspace-home/page.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/lib/constants/navigation.ts`
- `src/middleware.ts`
- `tsconfig.json`

These require separate authorization or a new task that explicitly covers
shared paths. They must not be added to PR #269.

## Current Writer Completion Contract Mechanism

The trusted publication path is:

1. A trusted issue-comment or recovery dispatch triggers
   `workshop-order-system-agent-control.yml`.
2. `scripts/agent-control/project-lane-validate.mjs` accepts only
   `READY_FOR_CODEX` or `FIX_REQUIRED` states and binds task/PR/branch/head.
3. The self-hosted execute job produces a bounded patch.
4. The publish job mints a scoped GitHub App token.
5. `scripts/agent-control/project-lane-publish.sh` commits/pushes and posts the
   App-authored Completion Contract.

It cannot run for Issue #104's current `WAITING_REVIEW` state:

```text
WRITER_COMPLETION_CONTRACT = BLOCKED
REASON = validator supports only READY_FOR_CODEX or FIX_REQUIRED
```

A normal user-authored PR comment is not a legal substitute. This handoff does
not fabricate a bot signature or alter control state.

Owner separately approved a one-time exact-head evidence substitute for the
missing Writer Contract after reviewing both runs:

```text
WRITER_COMPLETION_CONTRACT = OWNER_APPROVED_ONE_TIME_EVIDENCE_SUBSTITUTE
```

See `RC_OWNER_WRITER_CONTRACT_EXCEPTION.md`. The Issue #104 state transition
still follows its normal governance path.

## Independent Reviewer Conditions

- Distinct authorized reviewer, not the PR author.
- Exact PR #269 head and exact RC code/delivery SHA.
- Review of SQL privilege/RLS/Storage/proof replay and supersession threats.
- Verification that two GitHub reviews on PR #269 are not independent because
  both were submitted by the same account as the PR author.
- Written approval or a governance-authorized one-time substitute.

## Legal Integration Sequence

1. Obtain trusted exact-head Completion Contract for PR #269.
2. Obtain independent Reviewer decision.
3. Complete PR #269 under Issue #104 normal governance.
4. Re-fetch live master, registry, active PR and shared-path locks.
5. Register one new WOS V1 RC integration task.
6. Use `RC_ALLOWED_PATHS.json` as the new exact allowlist after review.
7. Create one new branch and one Draft PR; retain local commit history.
8. Run exact-head TypeScript, full WOS suite, PostgreSQL 17 tests, build,
   secret audit and smoke.
9. Review shared paths separately.
10. Merge/deploy only under a later explicit authorization.

## CI And Database Gates

Required code gates:

```text
pnpm typecheck
pnpm exec tsx tests/unit/workshop-order-suite.test.ts
node --check tests/e2e/wos-v1-rc-preview.cjs
pnpm build
secret/bundle audit
smoke
```

Required database gates:

- Exact M2 SQL SHA-256
  `3f356f7b12d385b1fff370cad7f064649eb4e90ddb193c79d13fa0f35524e298`
- Fresh PostgreSQL 17 installed transaction
- Positive double-sign and four-category proof test
- Tamper/expiry/supersession/version-conflict negatives
- Rollback before any receipt
- Post-install QA metadata verification

## Safe Work While PR #269 Remains Open

Allowed:

- Read-only QA metadata inspection.
- Local offline tests.
- Documentation and evidence generation.
- Git bundle and patch generation.
- Preparing exact path/SQL hashes.
- Preparing a one-page Owner request.

Not allowed:

- Push to PR #269.
- Create a second active WOS PR.
- Modify Issue #104 machine JSON outside its workflow.
- Install QA SQL or open QA gates.
- Merge, force-push or deploy.

## Rollback

The handoff bundle is immutable by SHA. The QA install rollback is valid only
before any M2 receipt exists:

```text
rc-sql/qa_m2_install_rollback.sql
```

After receipt creation, rollback means fail-close + revoke app EXECUTE + keep
audit tables/columns, not destructive deletion.
