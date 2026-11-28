# WOS V1 QA UAT 007 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED_BEFORE_BUSINESS_WRITE / NOT_REUSABLE`

## Authorization

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-007
EXECUTION_ID=a36e5a05-8403-45ef-a700-1440046949ba
EDGE_PROCESS_NONCE=7b33278a-d694-4275-a537-05552f8d8c84
EXACT_HEAD=453856c463fc5bac8a29f328be740c13231763fd
EXACT_HEAD_CI=46090357082
PREVIEW_DEPLOYMENT_ID=dpl_3C7s9Pwp8tWmTgpsfsPot8cBia6q
```

## Result

The exact-HEAD QA Preview became `READY`, and health returned HTTP 200 with
build `453856c463fc5bac8a29f328be740c13231763fd`. Both app write routes
returned their expected 503 disabled codes.

The QA M2 and Storage compatibility installs passed. The DB closer armed and
created its real `pg_cron` job. The Edge closer then failed before launchd:

```ini
WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_PREFLIGHT_FAILED_WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISSING
```

The Hosted Edge did not contain the dedicated legacy service-role secret.
Business Gates were never opened and no order was touched.

## Closeout

```ini
DB_CLOSER_ARMED=PASS
DB_CRON_JOB_ID=6
GATE_OPENED_AT=2026-11-28T02:44:13.533692Z
DB_CLOSE_REQUESTED_AT=2026-11-28T02:44:40.367986Z
DB_CLOSE_TIMELY=PASS
DB_CRON_UNSCHEDULED=PASS

EDGE_ARM=FAIL_CLOSED
EDGE_CONTROL_CLOSED_AT=2026-11-28T02:44:31.840365Z
LAUNCH_AGENT_LOADED=NO
BUSINESS_GATES_OPENED=0
QA_ORDER_CREATED=NO
QA_BUSINESS_WRITES=NO
```

DB closure was a recovery action after Edge ARM failure. It is not represented
as independent automatic timer proof for UAT-007.

## Recovery

```ini
APPLICATION_RPC_DEACTIVATED=PASS
STORAGE_COMPAT_ROLLBACK=PASS
STORAGE_POLICY_AND_BUCKET_RESTORED=PASS
QA_UAT_WRAPPER_REMOVED=PASS
AUTHENTICATED_APP_RPC_EXECUTE=false
QA_CLOSER_CRON_COUNT=0
OPEN_WRITE_GATES=0

HOSTED_WRITE_EDGE_VERSION=54
HOSTED_READONLY_EDGE_VERSION=46
VERIFY_JWT=true
RESTORED_SOURCE_MATCHES_PRE_GATE_V49_V42_BYTES=PASS
PROTECTION_BYPASS_COUNT=0
```

The retained order and historical counts remained:

```ini
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
VERSION=5
VERSION_LABEL=V2
WORKFLOW_STATUS=NEEDS_INFORMATION

runtime_proofs=36
orphan_claims=0
create_receipts=6
operator_action_receipts=10
operator_review_receipts=4
office_revisions=9
```

## Corrective Action

The missing dedicated Hosted Edge secret was configured from the existing
protected Mac Keychain credential. Source and tests are rebound to UAT-008.

UAT-007 is consumed and cannot be reused.
