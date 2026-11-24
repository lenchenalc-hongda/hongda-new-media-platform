# PR #279 Expired Proof Pre-Download Evidence

Status: `SOURCE_AND_OFFLINE_PASS_NOT_DEPLOYED`

## Fix

The request handler performs a full four-image metadata preflight before any
private Storage download:

- canonical category/image path
- Proof presence and current validity
- organization, order and image identity
- Storage bucket/path and declared SHA-256
- Storage object ID and version
- normalized microsecond update time
- current order snapshot immediately before download

Only when all four items pass may the handler call `storage.download`.
Downloaded bytes still pass the existing second Proof/Storage snapshot,
expiry and final order-version checks.

## Request-Level Counters

```ini
FIRST_PROOF_EXPIRED_DOWNLOADS=0
FOURTH_PROOF_EXPIRED_DOWNLOADS=0
MISSING_PROOF_DOWNLOADS=0
STORAGE_METADATA_MISMATCH_DOWNLOADS=0
ORDER_SWITCH_BEFORE_DOWNLOAD_DOWNLOADS=0
FLAG_OFF_DOWNLOADS=0
ALL_FOUR_VALID_DOWNLOADS=4
PROOF_EXPIRED_AFTER_DOWNLOAD_BEGINS=REJECTED
DATABASE_WRITE_CALLS=0
PROOF_RENEWAL_CALLS=0
PROOF_RECORDING_CALLS=0
RENEWAL_SPY_CALLS=0
RECORDING_SPY_CALLS=0
WRITE_SPY_CALLS=0
```

The test invokes the actual request orchestrator with injected read/download
dependencies and asserts independent renewal, recording, database-write and
download counters in the success and rejection paths. It does not use
source-string matching for call-order assertions.

## Safety State

```ini
QA_EDGE_V1_CHANGED=NO
QA_EDGE_REDEPLOYED=NO
WOS_V1_EDGE_READONLY_VERIFY_ENABLED=false
QA_SQL_INSTALLED=NO
QA_PROOF_CHANGED=NO
QA_ORDER_CHANGED=NO
QA_STORAGE_CHANGED=NO
PRODUCTION_CHANGED=NO
PR277_HEAD_CHANGED=NO
PR279_DRAFT=YES
PR279_MERGED=NO
```

The next deployment authorization must bind the final new PR #279 HEAD and
the post-fix core, handler and index SHA-256 values. Hosted
`PROOF_EXPIRED_BEFORE_BYTES` remains `NOT_TESTED` until that separate
deployment and bounded negative window are authorized.
