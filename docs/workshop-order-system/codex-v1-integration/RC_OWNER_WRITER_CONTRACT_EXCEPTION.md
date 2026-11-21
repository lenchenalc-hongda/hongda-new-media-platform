# Owner-approved Writer Contract Evidence Exception

OWNER_DECISION_DATE: `2026-11-21`
TARGET_PR: #269
TARGET_EXACT_HEAD: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
EXCEPTION_SCOPE: Missing trusted Writer Completion Contract only
RESULT: APPROVED_ONE_TIME_EVIDENCE_SUBSTITUTE

This is an explicit Owner-approved review exception. It is not a forged bot
contract and does not replace independent security review.

## Approved Evidence

### Business CI

- Run: #44753061064
- Repository: `lenchenalc-hongda/hongda-new-media-platform`
- Event: `pull_request`
- Run head SHA: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
- Run conclusion: `success`
- Jobs:
  - `lint-and-audit`: SUCCESS
  - `glh-stage1-postgres-synthetic`: SUCCESS

Important qualification:

The PR checkout used synthetic merge commit `ae9608c`, so this run is
supplemental evidence, not an exact-tree checkout proof by itself.

### Independent Attestation Repository

- Repository: `lenchenalc-hongda/hongda-wos-p1-handoff-attestation`
- Run: #44753662457
- Run head: `94d6cd6b0250162ebbdf521d12a5bf08b32f7c27`
- Run conclusion: `success`
- Subjob `wos-p2-public-snapshot-ci`: SUCCESS

The subjob explicitly fetched and checked out business SHA
`cb46d2380062a2d286fb2d0e56a0a2a51debdcce` and verified `git rev-parse HEAD`
before executing tests.

Verified markers:

```text
WOS_P2_BUSINESS_SNAPSHOT_SHA=cb46d2380062a2d286fb2d0e56a0a2a51debdcce
WOS_M2_OFFLINE_DEFAULT_DENY=PASS
WOS_M2_OFFLINE_CLOSED_GATE=PASS
WOS_M2_OFFLINE_MATERIAL_CAS_IDEMPOTENCY=PASS
WOS_M2_OFFLINE_VIEWER_FOREIGN_DENIED=PASS
WOS_M2_MISSING_CUSTOMER_APPROVED_SAMPLE_REJECTED=PASS
WOS_M2_OFFLINE_BASELINE_CURRENT_OFFICE=PASS
WOS_M2_OFFLINE_EXPIRED_IMAGE_REJECTED=PASS
WOS_M2_OFFLINE_CHANGED_OBJECT_VERSION_REJECTED=PASS
WOS_M2_OFFLINE_CHANGED_PROOF_SHA_REJECTED=PASS
WOS_M2_OFFLINE_DUAL_SIGN_NO_AUTO_START=PASS
WOS_M2_FINAL_FILM_FRESH_PROOF_PASS=PASS
WOS_M2_FINAL_SIGNED_SAMPLE_FRESH_PROOF_PASS=PASS
WOS_M2_POST_SIGNOFF_STORAGE_CHANGE_DENIED=PASS
WOS_M2_POST_SIGNOFF_CATEGORY_CHANGE_DENIED=PASS
WOS_M2_POST_SIGNOFF_SHA_CHANGE_DENIED=PASS
WOS_M2_STALE_SIGNOFF_NUMERIC_CAS_DENIED=PASS
WOS_M2_OFFLINE_ATOMIC_ROLLBACK=PASS
WOS_M2_OFFLINE_EXPIRED_GATE=PASS
WOS_M2_ISOLATED_PG17_TRANSACTION_E2E=PASS
WOS_M2_OFFLINE_CONCURRENT_CAS=PASS
workshop-order-suite.test.ts: PASS
WOS_P2_M2_ATOMIC_SQL_PROPOSAL_CODE_CI=PASS
```

Evidence directory:

```text
rc-evidence/github/runs/
```

Only allowlisted log markers were retained. Raw logs and secrets were not
committed.

## Decision

The exact SHA, independent checkout, PostgreSQL 17 transaction suite, full WOS
suite, TypeScript check, build, secret audit and concurrent CAS evidence are
sufficient as a one-time substitute for the missing trusted Writer Completion
Contract.

```text
WRITER_COMPLETION_CONTRACT = OWNER_APPROVED_ONE_TIME_EVIDENCE_SUBSTITUTE
TASK_STATUS = NOT_CHANGED
CONTROL_ISSUE_MACHINE_STATE = NOT_CHANGED
```

## Explicit Limits

- Valid only for PR #269 and exact head
  `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`.
- Does not authorize merge.
- Does not authorize QA SQL, Gate activation or QA data write.
- Does not authorize deployment.
- Does not satisfy independent security review.
- Does not create a reusable exception for another PR or SHA.
