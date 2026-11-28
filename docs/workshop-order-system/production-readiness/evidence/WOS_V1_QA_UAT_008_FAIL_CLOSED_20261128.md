# WOS V1 QA UAT 008 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED_BEFORE_BUSINESS_WRITE / NOT_REUSABLE`

## Authorization

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-008
EXECUTION_ID=f07cec5d-48f6-4f3f-9cc4-54bd013263f0
EDGE_PROCESS_NONCE=167df9ca-b5de-48b5-957a-160595b3905b
EXACT_HEAD=2718994aff37b6f338455dce8e34b63d7f53d54b
EXACT_HEAD_CI=46100177848
PREVIEW_DEPLOYMENT_ID=dpl_F33yEB6AU5cunu62iayM1phxitRe
```

## Result

The exact-HEAD Preview became `READY`. Health returned HTTP 200 with the exact
build SHA, and both QA/Production write routes returned their expected 503
disabled codes.

QA M2 and Storage compatibility installation passed. The DB closer armed and
created `pg_cron` job `7`. The Edge closer completed credential preflight and
LaunchAgent heartbeat, then failed at the open probe:

```ini
WOS_V1_QA_EDGE_OPEN_PROBE_EXCEPTION
```

Both controls closed before any business Gate opened. No request reached the
order workflow and no order or business record was changed.

## Closeout

```ini
DB_ARMED=PASS
EDGE_CREDENTIAL_PREFLIGHT=PASS
EDGE_LAUNCHD_HEARTBEAT=PASS
EDGE_OPEN_PROBE=FAIL_CLOSED

GATE_OPENED_AT=2026-11-28T03:02:57.216843Z
EDGE_CLOSED_AT=2026-11-28T03:03:25.957928Z
DB_CLOSE_REQUESTED_AT=2026-11-28T03:03:32.198008Z
DB_CLOSE_TIMELY=PASS
DB_CRON_UNSCHEDULED=PASS

BUSINESS_GATES_OPENED=0
QA_ORDER_CREATED=NO
QA_BUSINESS_WRITES=NO
LAUNCH_AGENT_LOADED=NO
```

## Recovery

```ini
STORAGE_COMPAT_ROLLBACK=PASS
STORAGE_POLICY_AND_BUCKET_RESTORED=PASS
QA_UAT_WRAPPER_REMOVED=PASS
AUTHENTICATED_APP_RPC_EXECUTE=false
QA_CLOSER_CRON_COUNT=0
OPEN_WRITE_GATES=0

HOSTED_WRITE_EDGE_VERSION=58
HOSTED_READONLY_EDGE_VERSION=49
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

The open probe was a Node HTTP-layer exception rather than a permission
decision. The next source revision adds three bounded probe attempts with a
30-second individual timeout. No authorization, Gate, deadline or credential
check was weakened.

UAT-008 is consumed and cannot be reused.
