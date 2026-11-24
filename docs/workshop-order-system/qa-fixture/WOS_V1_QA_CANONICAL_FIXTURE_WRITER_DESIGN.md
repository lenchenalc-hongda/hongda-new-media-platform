# WOS V1 Canonical QA Fixture Writer

Status: `SOURCE_ONLY / INSTALL_NOT_AUTHORIZED`

## Scope

This QA-only design supplies two functions and one private metadata table:

```text
public.wos_qa_create_canonical_v1_fixture(jsonb)
public.wos_qa_rollback_canonical_v1_fixture(uuid,uuid)
public.wos_qa_canonical_fixture_manifests
```

The table stores only the immutable fixture manifest fingerprint required for
exact rollback. It is not business data, is not readable by browser roles and
is deleted by the exact fixture rollback. Neither function creates Proof,
Receipt, signoff, resource readiness, Storage policy, Gate or
production-release state.

The package is stored under `docs/` and is not a migration. It must never be
automatically installed by application deployment.

## Permissions

Both functions use `SECURITY INVOKER`. This is intentional:

- only `service_role` receives EXECUTE;
- PUBLIC, anon and authenticated receive none;
- the functions receive no privilege beyond the already privileged
  `service_role` caller;
- no new database-owner or BYPASSRLS role is created;
- no dynamic SQL is used;
- `search_path` is fixed to empty and every object is schema-qualified.

The manifest table has RLS enabled with no client policies. PUBLIC, anon and
authenticated have no table privilege. service_role receives only the
SELECT/INSERT/UPDATE/DELETE privileges needed by the reviewed functions.

Both functions use `CREATE FUNCTION`, not `CREATE OR REPLACE`; installation
fails if a same-signature object already exists. Function and table creation
and exact ACL changes occur in one transaction.

The function body also requires:

```text
request.jwt.claim.role = service_role
```

The SQL ACL and the runtime claim are independent checks.

## PREPARE Contract

Exact keys:

```text
operation
requestId
orderId
organizationId
officeProfileId
```

The operation creates only one order:

```text
order_number = QA-NONPROD-{requestId}
workflow_status = WAITING_MATERIAL
version = 1
version_label = QA-R1
```

The organization is fixed to:

```text
0ff53d93-2b9e-48b9-8113-a4768c39cdd2
```

The Office Profile must be active, admin/manager, in that organization and
have a non-null Auth user ID.

All QA Gates must be OFF. The order number is derived, not caller supplied.
Repeating the same request returns `REPLAYED`; any conflict is rejected.
PREPARE also creates exactly one private manifest row in stage `PREPARED`.

A partial unique index over the private manifest table permits only one active
fixture in the approved QA project. A global transaction advisory lock
serializes PREPARE and rollback. Concurrent PREPARE calls with different
request/order IDs produce one success and one
`FIXTURE_ACTIVE_LIMIT_REACHED`; the rejected transaction leaves no order.

## Storage Middle Phase

PREPARE does not upload or register images.

A separate Owner authorization must:

1. open one exact-order/organization/Profile M2 Office Gate;
2. use the real Office JWT;
3. upload four canonical `source.png` objects through the Storage API;
4. close the Gate;
5. verify object owner, ID, version, updated time, MIME, size, CRC and SHA-256.

No direct `storage.objects` INSERT or Storage Policy modification is allowed.

## FINALIZE Contract

Exact top-level keys:

```text
operation
requestId
orderId
organizationId
officeProfileId
baselineId
images
```

Each of the four image objects must contain exactly:

```text
category
imageId
storagePath
storageObjectId
storageObjectVersion
storageObjectUpdatedAt
sha256
```

The function requires exactly one image for each category:

```text
PRODUCT
FILM_PATTERN
CUSTOMER_APPROVED_SAMPLE
SIGNED_SAMPLE
```

For every image it validates:

- unique image ID, path and SHA-256 declaration;
- exact canonical `source.png` path;
- real `storage.objects` row in `wos-private`;
- owner ID equals the Office Auth user;
- non-null object ID and non-empty object version;
- exact object version and microsecond update time;
- PNG MIME and 60-byte to 20-MiB size bounds.

SQL cannot prove downloaded byte content. `sha256` is manifest evidence, not a
Proof. FINALIZE returns:

```text
byteVerification=EXTERNAL_REQUIRED_NOT_PROVEN
```

Only after all four objects pass may one transaction insert four reference
images, one CURRENT baseline and four required baseline items.

The same transaction changes the private manifest row to `FINALIZED` and stores
the canonical image IDs, paths, object IDs, versions, microsecond timestamps,
declared SHA-256 values, baseline ID and SHA-256 fingerprint.

The baseline fields remain:

```text
office signoff = NULL
workshop signoff = NULL
proof-set digests = NULL
post-order versions = NULL
```

The transaction rejects partial pre-existing fixture data and any unexpected
Proof or Receipt.

## Rollback Contract

Input is exactly:

```text
p_request_id
p_order_id
```

The function locks and validates the persisted manifest fingerprint, then
requires exact equality with:

- four image IDs, categories, paths and object identities;
- storage object version/update-time and Office owner;
- one baseline ID;
- four exact baseline-item IDs and display order;
- zero extra READY or non-READY image rows;
- zero extra required or optional baseline items.

For a `PREPARED` fixture it instead requires no reference images, baseline,
baseline items, Proof, Receipt, business reference, or canonical Storage
object under the fixture order prefix. A PREPARED rollback deletes only its
manifest and order. Any Storage object causes
`FIXTURE_STORAGE_OBJECTS_REMAIN`; cleanup must occur separately through the
Storage API.

It refuses rollback if it finds:

```text
Proof
submission Receipt
M2 Receipt
confirmation
blocker
status history
resource readiness
baseline signoff or proof-set digest
```

It deletes only baseline items, baseline, reference images, the manifest row and
the fixture order. Storage objects are never removed through SQL. Their
canonical paths are returned for a separately authorized Storage API cleanup.

## Concurrency

All operations use a global transaction-scoped fixture advisory lock, followed
by an exact-order lock where applicable. PREPARE is idempotent and limited to
one active fixture by both the lock and unique index. Concurrent FINALIZE calls
must produce one `CREATED` and one `REPLAYED`, or a single fail-closed conflict.

## Installation Boundary

Installation is not authorized by source delivery. A later Owner gate must bind:

```text
QA project = xulmpqaknlwqqculbsek
function SHA-256 values
service_role-only EXECUTE ACL
install transaction and rollback
post-install fingerprints
```

The package must not be copied into `supabase/migrations/`.
