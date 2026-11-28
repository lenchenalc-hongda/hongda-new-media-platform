# WOS V1 QA UAT 006 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED_BEFORE_BUSINESS_WRITE / NOT_REUSABLE`

## Authorization

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-006
EXECUTION_ID=0e5e6ac1-cf10-4c2c-ba79-6e1619b2e632
PR=283
EXACT_HEAD=5b0efdce99b066fa933be3ca90c8c3a7f24626ce
EXACT_HEAD_CI=46087455200
```

## Result

The exact reviewed QA M2 install completed. The next Storage compatibility
install was rejected by its built-in policy fingerprint guard:

```ini
WOS_V1_QA_UAT_STORAGE_SOURCE_POLICY_FINGERPRINT_MISMATCH
EXPECTED_WOS_POLICY_MD5=a37821a034962478c744062b12b2b433
ACTUAL_WOS_POLICY_MD5=f9759e0644e82ff4264efa42ac54e57c
EXPECTED_NON_WOS_POLICY_MD5=25fa14a4cd8000016cfd61fa3e35bc6a
ACTUAL_NON_WOS_POLICY_MD5=f64fe08ac8669875ee9f7f3d4bbbc60f
```

No Guard was weakened and no retry was attempted under UAT-006.

## Safety State

```ini
STORAGE_COMPAT_INSTALLED=NO
EDGE_DEPLOYED=NO
DB_CLOSER_ARMED=NO
EDGE_CLOSER_ARMED=NO
LAUNCH_AGENT_LOADED=NO
QA_GATE_OPEN=NO
QA_ORDER_CREATED=NO
QA_BUSINESS_WRITES=NO

OPEN_WRITE_GATES=0
ACTIVE_CLOSER_CONTROLS=0
UAT006_CLOSER_CRON_COUNT=0
AUTHENTICATED_APP_RPC_EXECUTE=false
AUTHENTICATED_M2_EXECUTE=false
AUTHENTICATED_ORDERS_DML=false

HOSTED_WRITE_EDGE_VERSION=49
HOSTED_READONLY_EDGE_VERSION=42
VERIFY_JWT=true
```

The retained order remains:

```ini
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
VERSION=5
VERSION_LABEL=V2
WORKFLOW_STATUS=NEEDS_INFORMATION
V2_STORAGE_OBJECTS=0
```

Historical retained counts remained unchanged:

```ini
runtime_proofs=36
orphan_claims=0
create_receipts=6
operator_action_receipts=10
operator_review_receipts=4
office_revisions=9
```

## Root Cause

The prior expected hashes represented the PG17 fixture rather than the live
isolated QA Storage policy definitions. That made the guard fail closed on
the exact environment it was intended to validate.

UAT-007 instead binds a committed read-only live-policy snapshot and a PG17
assertion that recomputes the same MD5 values before exercising the install.

## Next Action

UAT-006 is not reusable. Any new execution requires a new authorization ID,
execution ID, Edge nonce, ARM token, exact HEAD and CI, and a newly generated
Owner Gate.
