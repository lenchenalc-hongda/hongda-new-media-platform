# QA Trusted Proof And Hosted Read-Only Verify Authorization

Status: `NOT_AUTHORIZED / REQUIRES_GUARD_REPLACEMENT_PASS`

Authorization ID:

`WOS-V1-QA-CANONICAL-TRUSTED-PROOF-HOSTED-VERIFY`

## Preconditions

```ini
QA_PROJECT=xulmpqaknlwqqculbsek
ORDER_ID=ba38e41b-8cac-469c-aabd-00b6ada033e2
BASELINE_ID=db30fc83-92c9-4ff8-bf78-3f3ad556db99
MANIFEST_STAGE=FINALIZED
TARGET_READY_IMAGES=4
CURRENT_BASELINES=1
TARGET_PROOFS=0
TARGET_TRUSTED_RECEIPTS=0
ALL_WRITE_GATES=OFF

GUARD_REPLACEMENT=PASS
GUARD_HOSTED_SMOKE=PASS
EDGE=wos-v1-verify-image-readonly
EDGE_BUNDLE_SHA256=d607a0a87969c0501ea37f09e782436cf205222b848d70e782de329241f70368
EDGE_VERIFY_JWT=true
EDGE_READONLY_ENABLED_BEFORE=false
EDGE_WRITES_ENABLED=false
```

## Proof Write Window

```ini
PROOF_INPUTS=docs/workshop-order-system/qa-fixture/WOS_V1_QA_TRUSTED_PROOF_INPUTS.json
PROOF_FUNCTION=public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
)
PROOF_CREATE_COUNT=4
EXPECTED_TOTAL_PROOFS=35
EXPECTED_NEW_TRUSTED_RECEIPTS=4

GATE=M2_OFFICE_WRITES
MAX_GATE_DURATION=600_SECONDS
INDEPENDENT_CLOSE_REQUIRED=YES
RENEW_PROOF=FORBIDDEN
```

The four calls use the fixed image IDs, paths, object IDs, versions,
microsecond timestamps and SHA-256 values in `WOS_V1_QA_TRUSTED_PROOF_INPUTS.json`.
The Gate must be exactly scoped to the fixed Organization, Order and Office
actor. The independent close must be armed and verifiably running before the
Gate opens. Close after the fourth Proof or the first failure.

## Edge Window

Only after:

```ini
PROOFS=35
TRUSTED_PROOF_RECEIPTS=4
M2_GATE=OFF
```

may the read-only Edge switch be enabled:

```ini
READONLY_EDGE_MAX_WINDOW=900_SECONDS
```

Positive verification must finish before the earliest Proof expiry. Natural
expiry verification must start after the latest Proof expiry.

## Required Hosted Tests

```ini
FOUR_VALID_PROOFS_READ=PASS
DOWNLOADED_BYTES_SHA256=PASS
PNG_SIGNATURE_CRC=PASS
STORAGE_IDENTITY_MATCH=PASS
VIEWER_DENIED=YES
CROSS_ORGANIZATION_DENIED=YES
WRONG_ORDER_IMAGE_OR_PROOF_DENIED=YES
PROOF_EXPIRED=HTTP409/PROOF_EXPIRED
EXPIRED_DOWNLOAD_COUNT=0
RENEW_DURING_EXPIRY_TEST=NO
SIGNOFF_CREATED=NO
CAN_START=false
```

After the window, restore the read-only flag false and verify HTTP 503. All
Proof rows and business records must remain intact.

## Exclusions

No Production access, PR merge, RLS/Storage policy change, order status change,
auto-start, Office/Workshop signoff or Gate E execution is authorized by this
source document.
