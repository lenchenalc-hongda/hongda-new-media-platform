# WOS V1 QA UAT-016 Fail-Closed Receipt

Status: `CONSUMED_FAIL_CLOSED`

## Result

UAT-016 resumed the retained order at
`WAITING_MATERIAL / V2 / version 7`. The Preview and both automatic closers
were valid. Before any material write, the first same-image Proof refresh was
denied by the Hosted Edge:

```text
HTTP_STATUS=403
CODE=STATUS_DENIED
```

The Edge state machine permits `WAITING_MATERIAL / V2` only for the dedicated
QA-R revision flow. The retained V2 order therefore could not renew its expired
Proofs through the approved public path.

## Impact

```text
CREATE_CALLS=0
NEW_ORDERS=0
IMAGE_UPLOADS=0
IMAGE_REGISTRATIONS=0
MATERIAL_WRITES=0
BASELINE_WRITES=0
SIGNOFF_WRITES=0
RELEASE_WRITES=0
```

The order remained:

```text
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
VERSION=7
VERSION_LABEL=V2
WORKFLOW_STATUS=WAITING_MATERIAL
CURRENT_IMAGES=4
RESOURCE_ROWS=0
```

## Automatic Close

```text
OPENED_AT=2026-11-28T10:01:22.445675+00:00
WRITE_DEADLINE_AT=2026-11-28T10:09:22.445675+00:00
DB_CLOSED_AT=2026-11-28T10:09:24.025012+00:00
EDGE_CLOSED_AT=2026-11-28T10:09:29.096871+00:00
EDGE_CLOSE_HTTP=503
EDGE_CLOSE_CODE=WOS_V1_QA_EDGE_CLOSED
CRON_JOB_ID=15
CRON_UNSCHEDULED=YES
LAUNCHD_UNLOADED=YES
```

## Recovery

```text
DB_RECOVERY=PASS
STORAGE_ROLLBACK=PASS
PROOF_MIRROR_ROLLBACK=PASS
IMAGE_REGISTER_ROLLBACK=PASS
PROOF_GUARD_ROLLBACK=PASS
APP_DEACTIVATE=PASS
M2_ROLLBACK=PASS
OPEN_GATES=0
UAT016_CRON_JOBS=0
EDGE_WRITES_ENABLED=false
EDGE_READONLY_VERIFY_ENABLED=false
```

All order, image, Proof, receipt, Storage and closer audit rows were retained.

## Correction

UAT-017 adds a QA-only current-order Proof refresh path. It is available only
when the runtime hostname is the fixed QA Supabase project, the order is
`WAITING_MATERIAL` or `READINESS_CHECK` with `V2+`, and the existing exact QA
UAT control/order/organization/actor gate passes. Production and ordinary QA
revision behavior are unchanged.
