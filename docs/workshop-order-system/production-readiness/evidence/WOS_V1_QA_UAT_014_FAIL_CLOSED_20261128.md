# WOS V1 QA UAT 014 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED / RECOVERED_WITH_RETAINED_DATA`

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-014
EXECUTION_ID=e646bb29-0fb2-47e5-ad4e-d59428d3ca22
EDGE_PROCESS_NONCE=c11f5f16-4bc0-4d43-94f2-1c8b6a2d5ff7
EXACT_HEAD=c0132a49683be7f7186e0b3482fdebf31e79480a
EXACT_HEAD_CI=46124515723
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
OPENED_AT=2026-11-28T08:24:45.563433Z
WRITE_DEADLINE_AT=2026-11-28T08:32:45.563433Z
DB_CLOSED_AT=2026-11-28T08:32:48.038801Z
DB_ELAPSED_SECONDS=482.475
EDGE_CLOSED_AT=2026-11-28T08:32:47.135102Z
EDGE_ELAPSED_SECONDS=481.572
```

The Owner Gate, exact HEAD and CI, exact Preview, independent review, five
identities, retained order, unused V2 image IDs and all source hashes passed.
The QA Preview, QA SQL and Hosted Edge were bound to UAT-014 before writes.

## Business Result

All four current V2 PNG files received trusted Edge proofs and were registered:

```ini
V2_PRODUCT_IMAGE_ID=16eef570-9940-4661-9f04-c48ebfaac513
V2_FILM_PATTERN_IMAGE_ID=41bb8791-60ed-4fcc-a707-795967330065
V2_CUSTOMER_APPROVED_SAMPLE_IMAGE_ID=443077ce-1c21-4d7d-b592-3e89a3a10f79
V2_SIGNED_SAMPLE_IMAGE_ID=98506522-729f-4feb-9789-2a630aaee54a
EDGE_PROOF_COUNT=4
REGISTERED_IMAGE_COUNT=4
REGISTER_IMAGE_RESULT=PASS
```

The next formal Office resubmission failed closed:

```ini
RESUBMIT_HTTP=400
RESUBMIT_CODE=TRUSTED_PNG_PROOF_REQUIRED
```

## Root Cause

The QA Edge writes proofs to `wos_qa_verified_image_proofs`, while the formal
Office submission image-set guard reads `wos_verified_image_proofs`.

At the failure state:

```ini
QA_PROOFS_FOR_NEW_IMAGES=4
FORMAL_PROOFS_FOR_NEW_IMAGES=0
ORDER_VERSION=5
ORDER_LABEL=V2
ORDER_STATUS=NEEDS_INFORMATION
```

No resubmission, review, material, baseline, signoff or release was created.

## Independent Close Result

```ini
DB_AUTOMATIC_CLOSE=PASS
DB_CLOSE_WITHIN_540S=PASS
DB_CRON_UNSCHEDULED=PASS
EDGE_AUTOMATIC_CLOSE=PASS
EDGE_CLOSE_WITHIN_840S=PASS
EDGE_LAUNCHD_UNLOADED=PASS
OPEN_WRITE_GATES=0
MANUAL_CLOSE_USED=NO
EDGE_FROZEN_SOURCE_SHA256=93930d69b652935e8d6d2ec3c195324ecec632e737d0358cde16b3fae92a1df1
```

This confirms the immutable per-execution Edge closer snapshot works: source
rebinding was no longer required and the real scheduled launchd close completed.

## Recovery

```ini
QA_APP_DEACTIVATE=PASS
VERIFIED_PROOF_MIRROR=NOT_INSTALLED
V2_IMAGE_REGISTER_COMPAT_ROLLBACK=PASS
V2_PROOF_GUARD_COMPAT_ROLLBACK=PASS
STORAGE_COMPAT_ROLLBACK=PASS
M2_DATA_RETAINING_ROLLBACK=PASS
REGISTER_IMAGE_SOURCE_RESTORED=f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187
HOSTED_EDGE_WRITE_SOURCE_RESTORED=95942d03618a67201b8b810f1a5075c98a040b9140aa9dd6e06add9f9a70d433
HOSTED_EDGE_WRITE_CORE_RESTORED=9336bf738a550d6e701420d2cedd0a3ce78c9ab16fec690310fede91e3d57b65
HOSTED_EDGE_READONLY_SOURCE_RESTORED=4ce6360bfd077dfb59a2f3e824275134eb706a79fa1db673cb719c6d06ee02ee
VERIFY_JWT=true
EDGE_WRITES=false
EDGE_READONLY=false
M2_AUTHENTICATED_EXECUTE=false
PRODUCTION_M2_AUTHENTICATED_EXECUTE=false
PRODUCTION_START_AUTHENTICATED_EXECUTE=false
```

The retained order remains `NEEDS_INFORMATION / V2 / version 5`. The four
UAT-014 V2 image rows and four QA trusted proofs are retained. The order now has
11 Storage objects. The six Runtime retention counts remain `36/0/6/10/4/9`.

## Corrective Source For UAT-015

- A QA-only AFTER INSERT trigger mirrors the exact QA trusted proof into the
  formal proof table only while the matching QA UAT control and Edge gate are
  armed.
- The mirror copies verified and expiry timestamps without renewal.
- The V2 registration compatibility now supersedes the previous READY image of
  the same order/version/category and records `supersedes_image_id`.
- Register rollback still restores the original hosted function definition.
- The proof mirror uses an independently verified install and rollback package.

UAT-014 cannot be retried. UAT-015 requires a new exact HEAD, CI, Preview,
execution ID, nonce, ARM token and Owner approval.
