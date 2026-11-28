# WOS V1 RC-02 Implementation And Offline Audit

Status: `CODE_AND_OFFLINE_PASS / HOSTED_QA_NOT_AUTHORIZED`

No Production write, remote QA SQL installation, Gate activation, Storage
upload, Proof creation, Preview deployment, Edge deployment, PR merge or Ready
transition was performed.

## Implemented Scope

- CREATE authorization is request-bound before order existence and atomically
  records the database-generated order ID in the same transaction.
- One active QA business authorization is enforced by a partial unique index.
- The QA Gate has `AUTHORIZED`, `ORDER_BOUND` and `CLOSED` states with a hard
  maximum TTL of 15 minutes.
- The Gate guards all eight V1 business RPC paths, including readiness,
  submission, inbox, operator, Office revision and review receipt tables.
- Gate checks lock the authorization row so an in-flight write completes before
  closure and a write that starts after closure cannot use stale scope.
- Storage upload is limited to the exact QA organization, bound order, current
  version, four canonical categories, canonical `source.png` paths,
  `wos-private`, real Office JWT and no upsert.
- Orders, reference images, Proofs, material readiness, baselines, baseline
  items, confirmations and status history reject direct authenticated writes.
- Correction supersedes old-version READY images, requires a new current-version
  four-image Proof set, creates one CURRENT baseline and four required items,
  and revalidates the same set before Operator review.
- Office correction UI exposes new-version image upload and blocks resubmission
  unless the current version has exactly the four required READY categories.
- RC02 Recovery refuses an active authorization, restores the original Storage
  policies and removes the dedicated schema without deleting Storage objects,
  orders or history.

## SQL Artifacts

```ini
RC02_FORWARD_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_NOT_AUTHORIZED.sql
RC02_RECOVERY_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_RC02_QA_BUSINESS_GATE_RECOVERY_NOT_AUTHORIZED.sql
```

Exact byte SHA-256 values are pinned in the external Owner Gate after the final
commit.

## Offline Evidence

```ini
RC02_PG17_CONTRACT=PASS
CREATE_ATOMIC_ORDER_BIND=PASS
CREATE_REPLAY_AND_PAYLOAD_CONFLICT=PASS
CREATE_EXPIRY_AND_IDENTITY_SCOPE=PASS
EIGHT_RPC_ORDER_GATE=PASS
DIRECT_TABLE_BYPASS_DENIED=PASS
DIRECT_POSTGREST_BYPASS_DENIED=PASS
STORAGE_SCOPE_AND_NO_UPSERT=PASS
CONCURRENT_SINGLE_ACTIVE_AUTHORIZATION=PASS
CONCURRENT_CREATE_REPLAY=PASS
CURRENT_VERSION_FOUR_IMAGE_PROOF=PASS
CURRENT_VERSION_BASELINE=PASS
RECOVERY_ACTIVE_REFUSAL=PASS
RECOVERY_POLICY_RESTORE=PASS
RECOVERY_PRESERVES_STORAGE_AND_ORDERS=PASS

PG17_M2_FOUR_MATERIALS_AND_DUAL_SIGN=PASS
PG17_M2_INSUFFICIENT_QUANTITY_AND_BLOCKER_REJECTION=PASS
PG17_OLD_PROOF_AND_IMAGE_DRIFT_REJECTION=PASS
PG17_REVISION_CONCURRENCY=PASS

TYPECHECK=PASS
WOS_FULL_SUITE=PASS
NEXT_BUILD=PASS
BUNDLE_SECRET_AUDIT=PASS
PG17_FULL_SCHEMA=PASS
PG17_383_SIGNATURE_PARITY=PASS
PG17_RUNTIME_ROLLBACK_TO_P7_EXACT=PASS
```

The direct PostgREST checks ran against a local disposable PostgreSQL 17
database and a local PostgREST v16.4 process. They are not Hosted Supabase
evidence.

## Not Tested

```ini
HOSTED_RC_BUSINESS_E2E=NOT_AUTHORIZED
QA_REMOTE_RC02_INSTALL=NOT_AUTHORIZED
REAL_OPERATOR_JWT_SIGNOFF=NOT_TESTED
OWNER_GATE_OPEN_CLOSE_EXERCISE=NOT_TESTED
QA_PREVIEW_DEPLOYMENT=NOT_AUTHORIZED
PRODUCTION_DRY_RUN=NOT_AUTHORIZED
```

## Safety State

```ini
ALL_QA_WRITE_GATES=OFF
EDGE_READONLY_FLAG=OFF
CAN_START=false
PR281_DRAFT=YES
PR281_READY_OR_MERGED=NO
PRODUCTION_UNCHANGED=YES
```

The next action is the exact-SHA Owner Gate for QA installation and the
integrated Hosted E2E. Hosted pass cannot be claimed until those external
operations receive separate authorization and produce real HTTP, Storage,
database and closure receipts.
