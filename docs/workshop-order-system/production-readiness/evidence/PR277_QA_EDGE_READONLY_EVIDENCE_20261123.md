# PR #277 QA Edge Read-Only Evidence

Authorization: `WOS-V1-QA-EDGE-READONLY-20261123`

## Code And Hosted Preview

```ini
PR277_EXACT_HEAD=8c8570f72e28c25e66eefebc42c919e9cd3c0694
PR277_DRAFT=YES
QA_VERCEL_PROJECT=prj_MhozO5QPUuUl8muAAKtkj5napeSp
QA_DEPLOYMENT_ID=dpl_7Lwg2AfAyvM8vri1QC8eFcC4xC6u
QA_DEPLOYMENT_SHA=8c8570f72e28c25e66eefebc42c919e9cd3c0694
QA_DEPLOYMENT_READY=YES
QA_PREVIEW_ORIGIN=https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app
QA_DEPLOYMENT_URL=https://hongda-wos-p00202-qa-preview-k1wrpp0sc-lens-projects-3fc386bd.vercel.app
```

The production Vercel project and the project-wide Ignored Build Step were not
changed. The one Preview build was created by disabling the Ignore Build Step
for that deployment only.

## QA Edge Function

```ini
QA_SUPABASE_REF=xulmpqaknlwqqculbsek
EDGE_FUNCTION=wos-v1-verify-image
EDGE_VERSION=1
EDGE_STATUS=ACTIVE
EDGE_VERIFY_JWT=true
EDGE_BUNDLE_SHA256=0cc25404fdc5b2f718358f2c89c797715f16809f981f4c6f821a31261df75f25
WOS_SUPABASE_ALLOWED_REFS=xulmpqaknlwqqculbsek
WOS_V1_EDGE_ALLOWED_ORIGINS=https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app
WOS_V1_EDGE_WRITES_ENABLED=false
```

Deployed source fingerprints:

```text
c439c387943830df597a00a9007699965c6834bc9381fc15684d7f5cd98dc795  supabase/functions/wos-v1-verify-image/index.ts
f17315be9c9841e020df093b2ae8f835733e21ff6703aa3ec986a4ac62e6a84d  supabase/functions/wos-v1-verify-image/core.ts
fa2690fdb01030f478552aff19893520d94615dd6f52a2b13672448eaa62ecdf  supabase/functions/_shared/wos-png-integrity.ts
```

The existing P7 and MVP functions retained their prior bundle hashes. Secret
rotation did not replace their source.

## Edge Fail-Closed Tests

```ini
ALLOWED_ORIGIN_OPTIONS=204
ALLOWED_ORIGIN_CORS_HEADER=YES
WRONG_ORIGIN_OPTIONS=403
WRONG_ORIGIN_POST=403
MISSING_JWT_POST=401
VALID_PUBLISHER_JWT_POST=503
VALID_PUBLISHER_JWT_CODE=WOS_V1_EDGE_WRITES_DISABLED
REAL_PNG_SHA256_HOSTED_TEST=NOT_PERFORMED
```

The `503` response is the expected writes-off result. It is not evidence that a
real private PNG was downloaded or verified.

## Database Baseline

The same baseline was read before and after the QA Edge deployment and denial
tests:

```ini
QA_ORDERS=84
QA_VERIFIED_PROOFS=31
QA_STORAGE_OBJECTS=87
QA_WRITE_GATES_ENABLED=0
OPERATOR_GATE_OFF=YES
OFFICE_GATE_OFF=YES
M2_OPERATOR_GATE_OFF=YES
M2_OFFICE_GATE_OFF=YES
M2_AUTHENTICATED_EXECUTE=false
TARGET_ORDER_STATUS=WAITING_MATERIAL
TARGET_ORDER_VERSION=7
TARGET_ORDER_LABEL=QA-R6
TARGET_ORDER_UNCHANGED=YES
CAN_START=false
```

No order, Proof, Storage object, Receipt or Gate was created, changed or
deleted by this work.

## Read-Only Byte Verifier Patch

The separate function `wos-v1-verify-image-readonly` was prepared as source
only. It is not deployed and is disabled by default.

```text
0e89fd7e486f471acf952e3bcf64664cd52d72c582f74d45b39aa9567655ff8a  a8f1ab11057021cb8b116d9e17e4a7c4d4867fc9  original pre-Deno-check index
fe97273931416403f6008156df7831a0a4abf8f151793f0258e9f523fa58bdd7  23203ddc55e9a6185f81d8a3a7e401f815445719  supabase/functions/wos-v1-verify-image-readonly/index.ts
6d64bb62cba4239dfccee95d85d7a1c4585efd3f8018aa616b18ccbf44b0625b  260619895828b874abc82fb0ea0f41c8f42cbd6a  supabase/functions/wos-v1-verify-image-readonly/core.ts
960314d3ee47eaf8938452c010eca611245ae479dc5fa701e8505da5262eb3d4  fbce324a40a873f6b09ae0096a2572909f223afc  tests/unit/workshop-order-qa-readonly-byte-verifier.test.ts
132a929d5a7ea3a12a186b465288eeb2323b421e501c384ec9ad8794f43d77de  8e8b5aee247321566c06040b28b98f1a3ca481bf  WOS_V1_READONLY_EDGE_DEPENDENCIES.md
```

The patch uses the caller JWT for identity and Storage download, uses the
trusted client only for exact Proof/snapshot reads, compares real bytes with
PNG/CRC/SHA-256, requires stable dual Proof and Storage snapshots, rechecks the
order version, and never calls renewal, recording or business-write RPCs.

## Offline Verification

```ini
TYPE_CHECK=PASS
WOS_SUITE=PASS
BUILD=PASS
SECRET_AUDIT=PASS
READONLY_BYTE_TEST=PASS
DENO_CHECK=PASS_WITH_SLOPPY_IMPORTS_FOR_NODE_TEST_ENTRY
INDEPENDENT_AI_SECURITY_REVIEW=PASS_NO_BLOCKING_FINDINGS
PG17=NOT_APPLICABLE_NO_SQL_CHANGE
SQL_INSTALLED=NO
NEW_PATCH_DEPLOYED=NO
```

## Browser QA

```ini
OFFICE_READ=PASS
OFFICE_PROFILE=GLH-Test-Admin / admin
OFFICE_TARGET_READ=WAITING_MATERIAL / v7 / QA-R6 / UNVERIFIED
OFFICE_WRITE_CAPABILITY=false
OPERATOR_READ=PASS
OPERATOR_PROFILE=WOS QA Operator / operator
TARGET_MATERIALS=0/4
TARGET_CURRENT_BASELINE=0
TARGET_EXISTING_IMAGE=PRODUCT / V1 / READY
TARGET_CURRENT_PROOF=UNVERIFIED
VIEWER_DENIED=YES
CROSS_ORG_DENIED=YES
ANONYMOUS_DENIED=YES
ALL_WRITE_POSTS_DISABLED=YES
STALE_ORDER_SWITCH_GUARD=SOURCE_CONTRACT_ONLY
NETWORK_FAILURE_READY_STATE=NOT_LIVE_SIMULATED
REFRESH_GREEN_SIGNOFF=NOT_LIVE_SIMULATED
HISTORICAL_M2_DB_EVIDENCE=PASS
HISTORICAL_M2_UI=PASS_WITH_FLAG
HISTORICAL_M2_FLAG_DEPLOYMENT=dpl_3T7jPqrNwgjuXEJJQBtSCNaiLAxy
HISTORICAL_M2_FLAG_RESTORED=REMOVED_DEFAULT_OFF
HISTORICAL_M2_FLAG_OFF_DEPLOYMENT=dpl_8SdeQug9MLb4ZHNUnbp2GfxuYQta
HISTORICAL_M2_FLAG_OFF_FAIL_CLOSED=PASS
OLD_VERSION_INHERITANCE=NOT_TESTED_HOSTED
NETWORK_INTERRUPTION=NOT_TESTED_HOSTED
BROWSER_QA_RESULT=PARTIAL_OLD_VERSION_AND_NETWORK_NOT_TESTED
```

The Office, Operator, Viewer and cross-organization Sales sessions were
established by the user through the normal login page. No password, OTP,
access token or service-role impersonation was captured or used by the agent.

Viewer results:

```ini
VIEWER_PROFILE=QA Viewer / viewer
VIEWER_WORKSHOP_PAGE=404_DENIED
VIEWER_V1_QA_API=403_FORBIDDEN
VIEWER_LEGACY_INBOX=503_NONPRODUCTION_READ_ONLY_DISABLED
VIEWER_HISTORICAL_UI=404_DENIED
```

Cross-organization Sales results:

```ini
FOREIGN_SALES_PROFILE=GLH QA Foreign Sales / sales
FOREIGN_SALES_ORG=fbdb0989-ae25-4ba4-92f9-3266cc845977
TARGET_ORDER_VISIBLE=NO
TARGET_ORDER_ID_VISIBLE=NO
FOREIGN_SALES_ORDER_LIST=EMPTY
FORGED_ORDER_READ=403_FORBIDDEN
FORGED_ORG_PARAM=400_INVALID_READ_QUERY
LEGACY_INBOX=503_NONPRODUCTION_READ_ONLY_DISABLED
RETURNS_API=503_NONPRODUCTION_READ_ONLY_DISABLED
```

Anonymous page and API requests both redirect to `/login`; the Edge function
rejects a request without a JWT with `401 UNAUTHORIZED_NO_AUTH_HEADER`.

The dedicated historical M2 browser page is fail-closed because
`WOS_P2_QA_HANDOFF_READONLY_ENABLED` is currently removed for the PR branch.
Before closeout, the flag was enabled only on that branch and the page passed
Office and Operator browser verification. Viewer and foreign Sales remained
denied. The final closeout deployment restores the flag-off page and confirms
that it returns `QA 只读入口未授权`.

Historical M2 database evidence:

```ini
HISTORICAL_ORDER=953d2204-3e65-4b75-b10e-c6e97f1bbb56
HISTORICAL_STATUS=READINESS_CHECK
HISTORICAL_VERSION=11
HISTORICAL_LABEL=QA-R6
HISTORICAL_RESOURCES=4
HISTORICAL_CURRENT_BASELINES=1
HISTORICAL_BASELINE_IMAGES=4
HISTORICAL_DISTINCT_CATEGORIES=4
HISTORICAL_DISTINCT_SIGNERS=YES
HISTORICAL_PROOF_SET_DIGEST_MATCH=YES
HISTORICAL_M2_RECEIPTS=4
HISTORICAL_M2_VERSION_CHAIN=7->8,8->9,9->10,10->11
HISTORICAL_CAN_START=false
```
