# WOS V1 QA UAT 013 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED / RECOVERED_WITH_RETAINED_DATA`

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-013
EXECUTION_ID=d9627b1e-5a75-454a-9489-4fbb602c8b46
EDGE_PROCESS_NONCE=6a95f3bb-4513-4cae-84d9-10656b861589
EXACT_HEAD=c50bae4c7234c690e33d47450f4ce7aee599b385
EXACT_HEAD_CI=46120751785
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
OPENED_AT=2026-11-28T07:41:38.072611Z
WRITE_DEADLINE_AT=2026-11-28T07:49:38.072611Z
DB_CLOSED_AT=2026-11-28T07:49:40.747203Z
DB_ELAPSED_SECONDS=482.675
EDGE_EMERGENCY_CLOSED_AT=2026-11-28T07:50:19.988852Z
EDGE_ELAPSED_SECONDS=521.916
```

The exact Owner Gate, source manifest, Preview, five identities, retained order,
unused V2 image IDs and both closer installations were verified before writes.
The DB and Edge closers produced real ARM receipts and heartbeats. The QA app
and Edge proof flags were then activated only for the bounded execution.

## Business Result

The corrected Edge binary path issued the first V2 trusted proof:

```ini
ORDER_STATE=NEEDS_INFORMATION
VERSION_LABEL=V2
ORDER_VERSION=5
EDGE_PROOF_HTTP=200
EDGE_PROOF_CODE=WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED
IMAGE_ID=1fd6ab38-4b0d-46e3-8b9a-50634fbae41c
SHA256=0a69f87137a41049dd734cbdc720abd2d3dd231167bb90414e0317c110e770be
```

The next registration RPC failed closed:

```ini
REGISTER_IMAGE_HTTP=400
REGISTER_IMAGE_CODE=UNSUPPORTED_ORDER_VERSION
```

## Root Cause

The hosted QA function
`wos_register_uploaded_reference_image(uuid,uuid,text,text)` still accepted only
`DRAFT`, even though the formal correction contract, Storage compatibility,
trusted-proof path and M2 workflow support `NEEDS_INFORMATION / V2+`.

The exact hosted definition hash was:

```ini
LIVE_REGISTER_IMAGE_SHA256=f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187
```

No reference image, resubmission, material, baseline, signoff or release was
created. The single Storage object and trusted proof created by the permitted
Edge request were retained as audit evidence.

## Corrective Source

A QA-only compatibility package now changes only the registration state guard:

```ini
SOURCE_SHA256=f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187
TARGET_SHA256=40231c055eae538f101ca7394880e1f746adcccb8265b07a832909238b678f0d
SUPPORTED_STATES=DRAFT_V1_PLUS_AND_NEEDS_INFORMATION_V2_PLUS
```

The rollback restores the captured live definition byte-for-byte. Local PG17
proves the old function rejects `NEEDS_INFORMATION / V2`, the compatibility
install accepts and registers the exact current V2 image, and rollback restores
the original source hash while retaining the new QA image row.

The Edge closer now freezes its executable source into a private per-execution
snapshot before loading launchd. Its plist runs that immutable snapshot and the
watch loop verifies the snapshot hash on every tick. Later edits to the repository
source therefore cannot change or invalidate an already-armed UAT process.

## Closer Result

```ini
DB_AUTOMATIC_CLOSE=PASS
DB_CLOSE_WITHIN_540S=PASS
DB_CRON_UNSCHEDULED=PASS
EDGE_AUTOMATIC_CLOSE=FAIL
EDGE_CLOSE_WITHIN_840S=PASS
EDGE_EMERGENCY_CLOSE=USED
LAUNCH_AGENT_LOADED=NO
OPEN_WRITE_GATES=0
```

The active Edge LaunchAgent was reading its source file on every tick. During
the open window the source default was advanced to UAT-014, so the running
UAT-013 process rejected its own state as out of scope and stopped heartbeating.
It did not produce an automatic Edge close receipt. An audited emergency close
then changed Edge state to `CLOSED` and verified the exact server timestamp.
This authorization therefore cannot claim independent Edge closers as PASS.

For the next run, the closer source must remain byte-stable for the entire open
window. Any source rebinding must occur before ARM or after final Recovery.

## Recovery

```ini
QA_APP_DEACTIVATE=PASS
STORAGE_COMPAT_ROLLBACK=PASS
V2_PROOF_GUARD_COMPAT_ROLLBACK=PASS
V2_IMAGE_REGISTER_COMPAT=NOT_INSTALLED
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

The retained order remains `NEEDS_INFORMATION / V2 / version 5`. The six
Runtime retention counts remain `36/0/6/10/4/9`; Storage retains seven objects
for this order, including the single UAT-013 V2 object, and the UAT-013 QA
trusted proof remains present. All write Gates are closed.

UAT-013 cannot be retried. UAT-014 requires a new exact HEAD, CI, Preview,
execution ID, nonce, ARM token and Owner approval.
