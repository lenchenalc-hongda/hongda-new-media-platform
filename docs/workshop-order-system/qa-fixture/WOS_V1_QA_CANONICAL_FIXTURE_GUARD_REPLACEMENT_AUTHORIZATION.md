# Proposed QA Fixture Writer Guard Replacement Authorization

Status: `NOT_AUTHORIZED`

Proposed authorization ID:

`WOS-V1-PR280-QA-FUNCTION-GUARD-REPLACEMENT`

## Exact Target

```ini
REPOSITORY=lenchenalc-hongda/hongda-new-media-platform
PR=280
QA_PROJECT=xulmpqaknlwqqculbsek
QA_ORGANIZATION=0ff53d93-2b9e-48b9-8113-a4768c39cdd2

REPLACEMENT_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_GUARD_REPLACEMENT_NOT_AUTHORIZED.sql
REPLACEMENT_SHA256=5ff796ccaff9b4dac62af5a2e401d29391707904e749f058f496cd158f08c158
REPLACEMENT_GIT_BLOB=7d3a54de93e12a372daa5cd6d0d5bfc0f9aaba40

RECOVERY_SQL=docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_GUARD_RECOVERY_NOT_AUTHORIZED.sql
RECOVERY_SHA256=a85e105d2e7f86610bc96e7bea5d5b09edab51167ec1f8e54f0154e6083d26db
RECOVERY_GIT_BLOB=fcd4afd34f6c832c3be14cefdb3f600a14ca5c41
```

The final Owner authorization must reissue and bind the exact PR HEAD and its
successful exact-head CI run. This source document does not authorize itself.

## Replacement Preconditions

```ini
SINGLE_TRANSACTION=true
CREATE_TABLE=false
CREATE_INDEX=false
MODIFY_RLS=false
MODIFY_STORAGE_POLICY=false
MODIFY_MANIFEST_DATA=false
MODIFY_BUSINESS_DATA=false
OPEN_GATE=false
CREATE_ORDER=false
```

The replacement SQL verifies:

- exact old CREATE and rollback function definition SHA-256 values;
- function owner `postgres`;
- `SECURITY INVOKER`;
- empty `search_path`;
- exact function ACL containing only owner and `service_role`;
- exact private manifest table and valid unique index;
- manifest table RLS enabled and no client access;
- zero manifest rows;
- every QA write Gate OFF.

It replaces only:

```text
public.wos_qa_create_canonical_v1_fixture(jsonb)
public.wos_qa_rollback_canonical_v1_fixture(uuid,uuid)
```

Expected postflight definitions:

```text
CREATE=faac9cc998d00d1341321815eb1874a379bbc94d0f2f8545281785a3d28ab1f8
ROLLBACK=bc7fcd6e5b5d88e54acbbcea24ddda0fb665021f0c364a3bce7b19ef3225c7e4
```

## Hosted Read-Only Smoke

Only after replacement postflight passes, execute:

```text
tests/live/wos-v1-qa-fixture-guard-smoke.mjs
```

Required explicit authorization values:

```ini
WOS_QA_FIXTURE_GUARD_SMOKE=YES
WOS_QA_FIXTURE_GUARD_SMOKE_AUTHORIZATION=WOS-V1-PR280-QA-FUNCTION-GUARD-REPLACEMENT
WOS_QA_SUPABASE_URL=https://xulmpqaknlwqqculbsek.supabase.co
```

Required credentials must come from the existing secure credential store and
must not be printed or committed:

```text
WOS_QA_SERVICE_ROLE_KEY
WOS_QA_AUTHENTICATED_JWT
WOS_QA_ANON_KEY
```

Expected results:

```ini
AUTHENTICATED_JWT_VALID=PASS
SERVICE_PREPARE_NULL=HTTP400 / 22023 / INVALID_FIXTURE_INPUT
SERVICE_ROLLBACK_NULLS=HTTP400 / 22023 / INVALID_ROLLBACK_INPUT
AUTHENTICATED=DENIED
ANON=DENIED
SERVICE_APIKEY_WITH_USER_JWT=DENIED
WRITES=0
```

The script only sends `p_input=null` and two NULL rollback UUIDs. It must never
send a valid PREPARE payload.

Before and after the HTTP smoke, separately record read-only Management API
evidence for:

```ini
QA_ORDERS=84
QA_REFERENCE_IMAGES=86
QA_PROOFS=31
QA_STORAGE_OBJECTS=87
QA_MANIFESTS=0
QA_WRITE_GATES_ENABLED=0
WOS_V1_EDGE_READONLY_VERIFY_ENABLED=false
CAN_START=false
```

Any drift stops the gate. The smoke does not create or modify a Storage object.

## Failure Recovery

If replacement or hosted smoke fails, keep all Gates OFF and execute the exact
recovery SQL. Verify restored definitions:

```text
CREATE=7029025994cfdb7818f4abcaf6545467fa2b43a4a57546e581563ec119cc83b0
ROLLBACK=cb683cce21792cf186a32310ddd3ad8f05e59f5abfd2a68ec01ac75e73fb2b1f
```

Recovery replaces only the two functions. It does not uninstall the manifest
table, modify Storage or RLS, or delete business data.

## Exclusions

This gate does not authorize a valid PREPARE, Gate B retry, Gate C upload,
Storage mutation, Proof, Receipt, FINALIZE, Edge deployment, PR merge or
Production change. Gate B must be requested again after the replacement and
read-only hosted smoke both pass.
