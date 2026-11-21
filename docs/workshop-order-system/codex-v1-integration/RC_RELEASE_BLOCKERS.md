# WOS V1 RC Release Blockers

HISTORICAL_ARCHIVE: YES
PR269_STATUS: CLOSED_UNMERGED
NOT_CURRENT_INSTALL_AUTHORITY: See `RC_QA_INSTALL_PLAN.md` and PR #270.

RC_CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
BASE_MASTER_SHA: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`

## Status Summary

| Gate | Status |
| --- | --- |
| RC source pinned | PASS |
| Local E2E artifacts collected | PASS |
| Local security audit | PASS_WITH_P1_REVIEW_BLOCKERS |
| SQL SHA-256 recorded | PASS |
| QA schema compatibility | PARTIAL_COMPATIBLE_REQUIRES_INSTALL |
| QA install plan | READY |
| QA rollback verification | PASS in fresh PG17 |
| GitHub integration plan | READY |
| Remote branch/PR | NOT_CREATED |
| Independent Reviewer | BLOCKED |
| QA install | NOT_AUTHORIZED |
| Real QA E2E | NOT_RUN |
| Vercel Preview | NOT_RUN |
| Production deployment | NOT_AUTHORIZED |

## P0 Blockers

None identified in this self-audit.

## P1 Blockers

### RC-BLOCK-001: Active PR/task legal closure

Issue #104 still has `WOS-P2-M2-PROOF-LOCK-001` / PR #269 as the active task.
The RC has 93 files and cannot be pushed into that six-file PR. No new PR can be
created until the current task reaches its legal terminal state.

Writer contract substitute: APPROVED one time for exact PR head by
`RC_OWNER_WRITER_CONTRACT_EXCEPTION.md`.

Still required:

- Independent distinct Reviewer decision.
- Owner/PM decision on the existing task.
- Fresh live control-state check before creating the RC integration task.

### RC-BLOCK-002: QA install authorization

The QA project is structurally compatible for additive M2 installation, but no
SQL may be executed until Owner approval binds:

- Exact SQL Git blob and SHA-256.
- QA project.
- Gate window.
- Synthetic order/organization scope.
- Reviewer identity and review result.
- Rollback/fail-close plan.

### RC-BLOCK-003: Real QA Edge/Storage trust review

The reviewer must inspect whether a privileged object mutation followed by
metadata restoration can defeat proof immutability under the real QA
Edge/Storage chain. Ephemeral PostgreSQL cannot prove a compromised
service-role/DBA threat is impossible.

### RC-BLOCK-003A: Signed technical audit attempt failed

The Owner-authorized one-time audit reused the existing exact-source workflow,
but overall Run #44753662457 attempt 2 failed at
`oidc-pr-diagnostic` with `PR_OIDC_DIAGNOSTIC_DENIED_RUNTIME_GITHUB_RUN_ATTEMPT`.
The exact-source security job passed, but the signed diagnostic gate did not.

Additionally, the private audit repository has only the PR author's account as
collaborator. The separate OIDC proof run verifies execution identity but logs
`INDEPENDENT_REVIEWER=NOT_YET_VERIFIED`.

### RC-BLOCK-004: Preview deployment not authorized

No Vercel deployment has been created or approved. The executable Preview E2E
script is syntax-checked but not run.

### RC-BLOCK-005: Local-only revision upload must remain excluded from QA

The local `WAITING_MATERIAL` revision-image helper is required for local E2E but
incompatible with QA's DRAFT-only proof guard. It is not part of the QA package.

## P2 Follow-Ups

- Existing QA has a redundant reference-image INSERT RLS policy without a table
  INSERT grant. Do not grant table INSERT.
- The QA proof-write guard is historical and DRAFT-only; a future general
  multi-version workflow must not reuse local-only bypasses.
- `RC_ALLOWED_PATHS.json` should be reviewed for path grouping before dispatch;
  shared paths may be split into a separate shared-path lock task if required.

## Shortest Legal Next Actions

1. Independent Reviewer or separately approved signed audit inspects PR #269
   exact head `cb46d238...`.
2. Use the Owner-approved one-time Writer Contract evidence substitute.
3. Owner/PM closes or transitions the active task under normal control workflow.
4. Re-read Issue #104, live master, registry and PR state.
5. Register one new WOS V1 RC integration task with the exact allowlist.
6. Only after merge and a separate Owner decision, install QA SQL.
7. Only after install verification, authorize a protected Preview deployment.
8. Run `tests/e2e/wos-v1-rc-preview.cjs` with a 15-minute Gate.
9. Fail-close immediately and independently verify terminal database state.

## Safety State

```
RC_SOURCE_PINNED = PASS
LOCAL_E2E_EVIDENCE_VERIFIED = PASS_WITH_ARTIFACTS
LOCAL_SECURITY_AUDIT = PASS_WITH_P1_REVIEW_BLOCKERS
SQL_SHA256_RECORDED = PASS
QA_SCHEMA_COMPATIBILITY = BLOCKED
QA_INSTALL_PLAN_READY = YES
QA_ROLLBACK_VERIFIED = PASS
GITHUB_INTEGRATION_PLAN_READY = YES
WRITER_COMPLETION_CONTRACT = OWNER_APPROVED_ONE_TIME_EVIDENCE_SUBSTITUTE
INDEPENDENT_REVIEW = BLOCKED
SIGNED_TECHNICAL_AUDIT = FAIL
QA_INSTALL_AUTHORIZED = NO
REAL_QA_E2E = NOT_RUN
PRODUCTION_DEPLOYMENT = NOT_AUTHORIZED
```
