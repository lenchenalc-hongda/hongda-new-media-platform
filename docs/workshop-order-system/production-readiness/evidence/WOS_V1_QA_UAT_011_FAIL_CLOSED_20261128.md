# WOS V1 QA UAT 011 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED / RECOVERED_WITH_RETAINED_DATA`

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-011
EXECUTION_ID=f5149801-df08-4ce7-b336-df6d449c9aec
EDGE_PROCESS_NONCE=f45beece-2a4a-4c3b-ae7b-d262347a4091
EXACT_HEAD=5a9e62e4254d59cb874f9d84d2911c9b916d04b7
EXACT_HEAD_CI=46110167068
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
OPENED_AT=2026-11-28T05:23:04.300546Z
WRITE_DEADLINE_AT=2026-11-28T05:31:04.300546Z
DB_CLOSED_AT=2026-11-28T05:31:06.745847Z
EDGE_CLOSED_AT=2026-11-28T05:31:06.471161Z
DB_ELAPSED_SECONDS=482.445
EDGE_ELAPSED_SECONDS=482.171
```

The exact Owner Gate, source manifest, QA Preview, Storage baseline, five
identities, closers and credential scope were verified before business writes.
The DB closer and Edge LaunchAgent both armed with real heartbeats. The formal
Edge `arm --load` path completed successfully.

The reviewed QA application wrappers and business gates opened. The resumed
order remained bound to the immutable CREATE receipt. One V2 PRODUCT object was
uploaded for the retained order:

```ini
STORAGE_PATH=organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2/wos/production-order/3ade0180-e6bf-49da-b80b-fd00cd1948a8/images/product/versions/V2/43eaf924-a0c1-48df-a17e-88c8b0069444/source.png
OBJECT_BYTES=1353
OBJECT_VERSION=06342520-97ef-42bc-9a8b-2ebf5a38347c
```

Hosted Edge then returned:

```ini
HTTP_STATUS=409
CODE=PRIVATE_BINARY_UNAVAILABLE
```

## Root Cause

The Edge function had already verified the caller, active profile, organization,
canonical path, open QA closer Gate and immutable Storage object snapshot. It
then read the binary through the caller-scoped Supabase client:

```text
userDb.storage.from('wos-private').download(path)
```

The QA Storage SELECT policy intentionally requires a registered current image
and a non-expired trusted proof. At first upload neither exists, so Storage
correctly returned `Object not found`. This created a circular dependency:

```text
proof requires binary read
binary read requires proof
```

The identical binary download is skipped and no proof or image receipt is
created. The business runner failed closed before Office resubmission or any
material/signoff/release mutation.

## Corrective Source Change

After the canonical path, actor, closer Gate and immutable object snapshot
checks pass, Edge downloads the bytes with the server-only admin client:

```text
admin.storage.from('wos-private').download(path)
```

The user-facing Storage SELECT policy remains unchanged and proof-bound. The
admin client cannot reach this branch until all actor, project, order, path,
Gate and object-snapshot checks have passed.

## Automatic Close

```ini
DB_CLOSE_TIMELY=true
DB_CRON_JOB_ID=10
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
EDGE_WRITES=false
EDGE_READONLY=false
HOSTED_EDGE_WRITE_SOURCE_RESTORED=95942d03618a67201b8b810f1a5075c98a040b9140aa9dd6e06add9f9a70d433
HOSTED_EDGE_WRITE_CORE_RESTORED=9336bf738a550d6e701420d2cedd0a3ce78c9ab16fec690310fede91e3d57b65
HOSTED_EDGE_READONLY_SOURCE_RESTORED=4ce6360bfd077dfb59a2f3e824275134eb706a79fa1db673cb719c6d06ee02ee
VERIFY_JWT=true
```

The retained order remains `NEEDS_INFORMATION / V2 / version 5`. Existing
Runtime counts remain `36/0/6/10/4/9`. The one failed-round V2 object is retained
as evidence; no V2 reference image or proof was created. All six write Gates are
`CLOSED`; UAT-011 cannot be retried.

UAT-012 must use a fresh execution ID, nonce and ARM token and must reverify the
new exact HEAD, CI, QA Preview, SQL, Edge source and all artifacts.
