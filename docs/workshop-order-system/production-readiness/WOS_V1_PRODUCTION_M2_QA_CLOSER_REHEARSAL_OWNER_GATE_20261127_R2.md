# WOS V1 QA Closer-Only Remote Rehearsal Owner Gate R2

Status:
`PREPARED_FOR_OWNER_DECISION / NOT_AUTHORIZED / NOT_RUN`

## Prior Attempt

```ini
PRIOR_RECORD=WOS-V1-PRODUCTION-M2-QA-CLOSER-REHEARSAL-20261127-02
PRIOR_HEAD=c20728f984458c2ab109a74c33f5cb2eb5ac6846
PRIOR_RESULT=FAIL_CLOSED_BEFORE_ARM
PRIOR_FAILURE=WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE
PRIOR_RECOVERY=PASS
```

The prior execution is consumed and must not be reused.

## Proposed Owner Execution

```ini
OWNER_EXECUTION_RECORD=WOS-V1-PRODUCTION-M2-QA-CLOSER-REHEARSAL-20261127-03
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-003
AUTHORIZATION=ONE_BOUNDED_QA_CLOSER_ONLY_EXECUTION
QA_PROJECT=xulmpqaknlwqqculbsek
QA_ORGANIZATION=0ff53d93-2b9e-48b9-8113-a4768c39cdd2
EXECUTION_ID=9d375980-42f3-4f94-85cf-f45652d1501b
EDGE_PROCESS_NONCE=6aa2c612-0e33-4918-b156-9b1bb3fee1d1
ARM_TOKEN_STORAGE=KEYCHAIN_ONLY_NOT_COMMITTED
```

## Source

```ini
PR=283
EXACT_HEAD=TO_BE_BOUND_IN_FINAL_OWNER_COMMENT
EXACT_HEAD_CI=TO_BE_BOUND_IN_FINAL_OWNER_COMMENT
ARTIFACT_MANIFEST_SHA256=TO_BE_BOUND_IN_FINAL_OWNER_COMMENT
```

## Exact Artifacts

```ini
CLOSER_ONLY_INSTALL_SQL_SHA256=50cbe2d52f606825bbc2f119e126e17362c42677b1f873f4e8b12d0fccfa0d40
CLOSER_ONLY_ROLLBACK_SQL_SHA256=127652defc0034f720755f187695f9597e1fb3d85ca080959173ec5fbe7f93e7
DB_CLOSER_SHA256=33b8abe7c32ebc9a4098b2d355b87242695ba0c7c87ab0e3b990ad7517670d8e
EDGE_CLOSER_SHA256=0a36de3557f383ff39845d823345cb791c66cce3bbb56523ebca4bb3ae1409aa
EDGE_INDEX_SHA256=de7a0e9e1afa995d5ca5afe08b2ed91de5c5a17fd3f7e80c183291516726e4fb
EDGE_CORE_SHA256=9f242dca3200d694cf4993acffe57208b6106a0817c69fe1d343bcbdde6b57f9
EDGE_PNG_INTEGRITY_SHA256=fa2690fdb01030f478552aff19893520d94615dd6f52a2b13672448eaa62ecdf
```

## Edge Credential Fix

The Edge runtime must set this dedicated non-reserved secret to the exact QA
legacy service-role JWT:

```text
WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY
```

The reviewed source prefers this secret for closer probe equality and retains
`SUPABASE_SERVICE_ROLE_KEY` only as a compatibility fallback. The Admin RPC key
remains separate through `SUPABASE_SECRET_KEYS.default`.

## Hosted Baseline

```ini
HOSTED_FUNCTION=wos-v1-verify-image
HOSTED_VERSION_BEFORE=38
HOSTED_BUNDLE_SHA256=21fd1a8d31508662c6c0790e9304b793e864ffb321de5b77bcc8145e91f18450
HOSTED_VERIFY_JWT=true
HOSTED_WRITES_ENABLED=false
HOSTED_READONLY_VERIFY_ENABLED=false
WOS_SUPABASE_ALLOWED_REFS=xulmpqaknlwqqculbsek
WOS_V1_EDGE_ALLOWED_ORIGINS=https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app
verify_jwt=true
RECOVERY_SOURCE=docs/workshop-order-system/production-readiness/evidence/WOS_V1_QA_EDGE_V34_SOURCE_20261127
```

## Authorized Scope

If approved, exactly one closer-only rehearsal may:

1. Re-run all exact-source, Keychain, QA database, Cron and Hosted v38 checks.
2. Install the exact closer-only SQL and verify the existing empty tables.
3. Set the dedicated Edge closer JWT secret and deploy the exact reviewed Edge
   source with writes disabled and `verify_jwt=true`.
4. Verify the Hosted closer probe reaches the DB Gate state and returns closed
   before ARM.
5. ARM exactly one DB `pg_cron` job and one Edge LaunchAgent.
6. Prove independent DB close within 540 seconds and Edge close within 840
   seconds.
7. Verify Hosted `503 / WOS_V1_QA_EDGE_CLOSED`, remove Cron, unload LaunchAgent,
   run closer-only Recovery and restore Hosted v38 bytes.

## Prohibitions

```ini
QA_BUSINESS_GATE_OPEN=FORBIDDEN
QA_ORDER_CREATE=FORBIDDEN
QA_BUSINESS_WRITES=FORBIDDEN
M2_AUTHENTICATED_EXECUTE=FORBIDDEN
PRODUCTION_SQL=FORBIDDEN
PRODUCTION_DEPLOYMENT=FORBIDDEN
PR_MERGE=FORBIDDEN
PR283_MERGE=FORBIDDEN
CAN_START=false
```

## Owner Approval Block

```ini
OWNER_DECISION=AUTHORIZE_ONE_QA_CLOSER_ONLY_REHEARSAL=YES/NO
OWNER_EXECUTION_RECORD=WOS-V1-PRODUCTION-M2-QA-CLOSER-REHEARSAL-20261127-03
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-003
EXACT_HEAD=<final PR #283 head>
EXACT_HEAD_CI=<completed CI run>
SOURCE_MANIFEST_SHA256=<final manifest hash>
PRODUCTION_WRITES=FORBIDDEN
PR_MERGE=FORBIDDEN
CAN_START=false
```
