# WOS V1 QA UAT 012 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED / RECOVERED_WITH_RETAINED_DATA`

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-012
EXECUTION_ID=c32a81d1-b997-4cfa-a346-871461a1af47
EDGE_PROCESS_NONCE=dc068291-4ec1-426a-ae2d-bec50a32c937
EXACT_HEAD=7d8d18d950115d9e7f65e46fb5ba8e0fe6905ecb
EXACT_HEAD_CI=46113622077
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
OPENED_AT=2026-11-28T06:48:35.974120Z
WRITE_DEADLINE_AT=2026-11-28T06:56:35.974120Z
DB_CLOSED_AT=2026-11-28T06:56:39.467375Z
EDGE_CLOSED_AT=2026-11-28T06:56:40.141929Z
DB_ELAPSED_SECONDS=483.493
EDGE_ELAPSED_SECONDS=484.168
```

The exact Owner Gate, source manifest, Preview, five identities, unused V2
image IDs and both independent closers were verified before business writes.
Both closers armed with real heartbeats. The QA wrappers and Edge proof flags
were then activated.

The fixed Edge binary-read path passed. UAT-012 uploaded one new V2 PRODUCT
object and reached the trusted-proof write, which failed closed with:

```ini
HTTP_STATUS=503
CODE=WOS_V1_PROOF_WRITE_UNAVAILABLE
DATABASE_ERROR=QA_PROOF_ORDER_NOT_EDITABLE
```

## Root Cause

The order was at `NEEDS_INFORMATION / V2 / version 5`, which is the required
Office correction state. The hosted QA trusted-proof function and existing QA
proof trigger still accepted only:

- `DRAFT / V1+`
- `WAITING_MATERIAL` or `READINESS_CHECK` with `QA-R`

They did not accept the formal `NEEDS_INFORMATION / V2+` revision state. The
production-neutral runtime proof function already accepted this state, so the
QA dependency layer was stale and inconsistent with the formal contract.

No proof, image registration, resubmission, material, signoff or release was
created.

## Corrective Source

- Hosted QA trusted-proof function now accepts `NEEDS_INFORMATION / V2+`.
- Hosted QA renewal function uses the same state contract.
- Added a QA-only compatibility package that upgrades the existing live proof
  function and trigger with exact source hashes.
- Compatibility rollback restores the exact captured function definitions.
- PG17 regression now proves a `NEEDS_INFORMATION / V2` order can receive a
  trusted proof.

## Automatic Close

```ini
DB_CLOSE_TIMELY=true
DB_CRON_JOB_ID=11
DB_CRON_UNSCHEDULED=true
EDGE_CLOSE_TIMELY=true
EDGE_LAUNCHD_UNLOADED=true
CLOSED_PROBE_HTTP=503
CLOSED_PROBE_CODE=WOS_V1_QA_EDGE_CLOSED
OPEN_WRITE_GATES=0
```

No manual close was used as a substitute for automatic timer evidence.

## Recovery

```ini
QA_APP_DEACTIVATE=PASS
M2_DATA_RETAINING_ROLLBACK=PASS
STORAGE_COMPAT_ROLLBACK=PASS
V2_PROOF_GUARD_COMPAT=NOT_INSTALLED
EDGE_WRITES=false
EDGE_READONLY=false
HOSTED_EDGE_WRITE_SOURCE_RESTORED=95942d03618a67201b8b810f1a5075c98a040b9140aa9dd6e06add9f9a70d433
HOSTED_EDGE_WRITE_CORE_RESTORED=9336bf738a550d6e701420d2cedd0a3ce78c9ab16fec690310fede91e3d57b65
HOSTED_EDGE_READONLY_SOURCE_RESTORED=4ce6360bfd077dfb59a2f3e824275134eb706a79fa1db673cb719c6d06ee02ee
VERIFY_JWT=true
```

The retained order remains `NEEDS_INFORMATION / V2 / version 5`. Existing
Runtime counts remain `36/0/6/10/4/9`. Two historical V2 PRODUCT objects remain
in Storage, and no V2 reference image or proof exists. All six write Gates are
`CLOSED`; UAT-012 cannot be retried.

UAT-013 must use a fresh execution ID, nonce and ARM token and include the
reviewed V2 proof-guard compatibility package in installation and Recovery.
