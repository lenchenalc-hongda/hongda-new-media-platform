# WOS V1 QA Closer-Only Remote Rehearsal Owner Gate

Status:
`CONSUMED_FAIL_CLOSED / NO_ARM / HISTORICAL_ONLY`

This `...-002` execution record was consumed on
`c20728f984458c2ab109a74c33f5cb2eb5ac6846`. The dedicated Edge probe secret
was unavailable because the reserved project secret value did not match the
current legacy API key and could not be overwritten. No DB/Edge ARM occurred.
See `WOS_V1_QA_CLOSER_REMOTE_FAIL_CLOSED_20261127.json`. A new authorized
source and execution record are required.

Owner execution record:
`WOS-V1-PRODUCTION-M2-QA-CLOSER-REHEARSAL-20261127-02`

Technical authorization ID:
`WOS-V1-PRODUCTION-M2-QA-UAT-002`

The prior `WOS-V1-PRODUCTION-M2-QA-UAT-001` execution is consumed. It must not
be reused. This record authorizes at most one closer-only remote rehearsal and
does not authorize business UAT, Gate opening, order creation, Production
changes or PR merge.

## Exact Source

```ini
REPOSITORY=lenchenalc-hongda/hongda-new-media-platform
PR=283
SOURCE_FREEZE_HEAD=TO_BE_BOUND_IN_FINAL_OWNER_COMMENT
EXACT_HEAD_CI=TO_BE_BOUND_IN_FINAL_OWNER_COMMENT
BRANCH=codex/wos-v1-production-m2-signoff-20261126
```

The Owner approval must quote the final Draft PR HEAD and its completed CI run.
A source mismatch blocks every remote action.

## QA Scope

```ini
QA_PROJECT=xulmpqaknlwqqculbsek
QA_ORGANIZATION=0ff53d93-2b9e-48b9-8113-a4768c39cdd2
QA_PREVIEW_PROJECT_ID=prj_MhozO5QPUuUl8muAAKtkj5napeSp
QA_PREVIEW_DEPLOYMENT_ID=dpl_FnCwe8fuwfhjCdtYt8r8fbJcDrDC
EXECUTION_ID=f502bd0b-c132-4588-ae46-8ec2ae71bffd
EDGE_PROCESS_NONCE=6fbcd563-819c-4935-9643-c4ebbf42b0c7
ARM_TOKEN_STORAGE=KEYCHAIN_ONLY_NOT_COMMITTED
```

The execution ID is fresh. The arm token must be generated during the
authorized run and stored only in Keychain. Reusing the earlier execution ID,
nonce or arm token is forbidden.

## Credentials

Required Keychain services:

```text
WOS_V1_QA_DB_CLOSER_DSN
WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY
WOS_V1_QA_DB_CLOSER_ARM_TOKEN
```

The DB DSN must target only `xulmpqaknlwqqculbsek`. The Edge credential must be
the exact legacy service-role JWT for that project. The Admin RPC key is
separate and is read by the Edge runtime from `SUPABASE_SECRET_KEYS.default`,
with legacy `SUPABASE_SERVICE_ROLE_KEY` only as compatibility fallback.

No secret value may be printed, committed or sent through chat.

## Exact Artifacts

```ini
CLOSER_ONLY_INSTALL_SQL=docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_INSTALL_NOT_AUTHORIZED.sql
CLOSER_ONLY_INSTALL_SQL_SHA256=f74d8257e01adf78e02577269926c378b369707997f4ee5a3b61e9a34cb936f4

CLOSER_ONLY_ROLLBACK_SQL=docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_ROLLBACK_NOT_AUTHORIZED.sql
CLOSER_ONLY_ROLLBACK_SQL_SHA256=127652defc0034f720755f187695f9597e1fb3d85ca080959173ec5fbe7f93e7

DB_CLOSER=scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs
DB_CLOSER_SHA256=27625bb9cb73fbcf915eee032f8e80446da89974357bb5fb616f0fdd8ee3a224

EDGE_CLOSER=scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs
EDGE_CLOSER_SHA256=e41fa8f63b565ecedfe02893d5f54e3ede529e5fade30965a1a3ba4b83a38196

EDGE_INDEX=supabase/functions/wos-v1-verify-image/index.ts
EDGE_INDEX_SHA256=ef5762b9ba49cd4a5930eaab8803ad942561bfd4558f77ee9cc269a65771b2a2

EDGE_CORE=supabase/functions/wos-v1-verify-image/core.ts
EDGE_CORE_SHA256=a079487792b9afab8d6d1ebd916edde805484c77e34cdc3a9fc15a0d0d3b7e45

EDGE_PNG_INTEGRITY=supabase/functions/_shared/wos-png-integrity.ts
EDGE_PNG_INTEGRITY_SHA256=fa2690fdb01030f478552aff19893520d94615dd6f52a2b13672448eaa62ecdf
```

The final approval comment must carry the completed SHA-256 values and the
artifact manifest hash.

## Existing Hosted Baseline

```ini
HOSTED_FUNCTION=wos-v1-verify-image
HOSTED_VERSION_BEFORE=36
HOSTED_BUNDLE_SHA256=21fd1a8d31508662c6c0790e9304b793e864ffb321de5b77bcc8145e91f18450
HOSTED_VERIFY_JWT=true
HOSTED_WRITES_ENABLED=false
WOS_SUPABASE_ALLOWED_REFS=xulmpqaknlwqqculbsek
WOS_V1_EDGE_ALLOWED_ORIGINS=https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app
verify_jwt=true
RECOVERY_SOURCE=docs/workshop-order-system/production-readiness/evidence/WOS_V1_QA_EDGE_V34_SOURCE_20261127
```

Before overwrite, re-download the Hosted bytes and require the recorded v36
bundle/source closure. After rehearsal, redeploy the preserved baseline source,
set `WOS_V1_EDGE_WRITES_ENABLED=false`, re-download the source, verify
`verify_jwt=true`, and record the newly assigned version number.

## Authorized Remote Steps

1. Reverify final HEAD, CI, local hashes, QA structure, existing QA traffic,
   Hosted v36 bytes, Keychain uniqueness and all write switches `OFF`.
2. Install only the closer-only SQL. Do not install or activate full M2 and do
   not grant authenticated business-wrapper execution.
3. Deploy the reviewed Edge source with `WOS_V1_EDGE_WRITES_ENABLED=false` and
   `verify_jwt=true`.
4. ARM exactly one DB `pg_cron` job and verify its real heartbeat and receipt.
5. Load exactly one LaunchAgent and verify its real heartbeat and receipt.
6. Require matching authorization ID, execution ID, nonce, code SHA, DB and Edge
   ARM receipts, fresh heartbeats and the same server deadline.
7. Let both closers trigger independently. DB must close no later than 540
   seconds; Edge must close no later than 840 seconds.
8. Verify the SQL probe status transitions to `CLOSED` and the Hosted closure
   probe returns `503 / WOS_V1_QA_EDGE_CLOSED` with the exact execution ID and
   non-zero close timestamp.
9. Confirm the cron job is absent and the LaunchAgent is unloaded.
10. Run closer-only Recovery, remove temporary public RPCs, preserve all audit
    rows and restore the Hosted v36 source closure with writes disabled.

No manual close may replace the required scheduled trigger evidence.

## Permanent Prohibitions

```ini
QA_BUSINESS_GATE_OPEN=FORBIDDEN
QA_ORDER_CREATE=FORBIDDEN
QA_BUSINESS_WRITES=FORBIDDEN
M2_AUTHENTICATED_EXECUTE=FORBIDDEN
PRODUCTION_SQL=FORBIDDEN
PRODUCTION_DEPLOYMENT=FORBIDDEN
PRODUCTION_WRITES=FORBIDDEN
PR281_MERGE=FORBIDDEN
PR283_MERGE=FORBIDDEN
CAN_START=false
```

## Owner Approval Block

```ini
OWNER_DECISION=AUTHORIZE_ONE_QA_CLOSER_ONLY_REHEARSAL=YES/NO
OWNER_EXECUTION_RECORD=WOS-V1-PRODUCTION-M2-QA-CLOSER-REHEARSAL-20261127-02
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-002
EXACT_HEAD=<final PR #283 head>
EXACT_HEAD_CI=<completed CI run for that head>
SOURCE_MANIFEST_SHA256=<final manifest hash>
EXPECTED_DB_CLOSE_MAX_SECONDS=540
EXPECTED_EDGE_CLOSE_MAX_SECONDS=840
PRODUCTION_WRITES=FORBIDDEN
PR_MERGE=FORBIDDEN
CAN_START=false
```
