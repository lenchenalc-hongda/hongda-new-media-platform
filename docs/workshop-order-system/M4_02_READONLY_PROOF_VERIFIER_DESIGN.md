# M4-02 Office-Only Read-Only Proof Verifier

Status:

`OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED / SOURCE_REVIEW_FIX_REQUIRED_P1 / QA_SQL_NOT_INSTALLED`

Issue: `#274`

This is a bounded fallback on PR #275. It replaces the previous attempt to add
an M4 Storage policy with reuse of the existing QA P7 Storage RLS. It does not
authorize SQL installation, hosted Storage changes, Gate activation, QA writes
or Production deployment.

## Decision

The existing QA policies already allow an active same-organization
`admin`/`manager` to read `wos-private` objects for a same-organization
production order at `READINESS_CHECK`. No order-status `SUBMITTED` restriction
applies to those two roles.

The fallback cannot preserve the required exact object timestamp standard:

- Pinned Storage server source commit
  `c0d596a798f8b21a9a5808875e6bfcdc02ca54a7` returns
  `last_modified: obj.updated_at` from `InfoRenderer`.
- That service pins `pg@8.23.1` with `pg-types@2.2.0`. It overrides only INT8,
  so `timestamptz` uses the default JavaScript `Date` parser.
- `Date`/JSON serialization retains milliseconds only. A database value with
  microseconds such as `.123456Z` is exposed as `.123Z`.
- The reviewed design requires an exact six-digit microsecond commitment, not
  a rounded or fuzzy comparison. Therefore a true object with a non-zero
  sub-millisecond component is deterministically rejected.

This is fail-closed, not a security bypass, but it cannot support a usable
positive verification without changing the approved identity/version evidence
standard. No such downgrade is authorized in this task.

Final decision:

`OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED`

Keep the historical Proof state `UNVERIFIED`, `reviewReady=false` and
`canStart=false`. Stop this Storage-owner/metadata loop.

The pinned Storage SDK still correctly maps `last_modified` to `lastModified`,
and raw `download(path)` remains a GET without image transforms. The blocker is
the trusted service's timestamp precision, not the browser request path.

Independent review corrections retained in the source:

- Activation pins the approved snapshot and private bridge function
  definitions by SHA-256.
- Storage metadata parsing now requires `archivedAt === null` and
  `isDeleteMarker === false`; missing safety fields fail closed.

## Role Boundary

First-stage verifier roles:

- `admin`: allowed for the same active organization and QA order.
- `manager`: allowed for the same active organization and QA order.
- `operator`: denied and remains `UNVERIFIED` until separately supported.
- `sales`: denied in this phase.
- `viewer`: denied.
- anonymous: denied in both the route, RPC and Storage RLS.
- cross-organization Admin/Manager: denied by the RPC and Storage path/org RLS.

The route verifies the active Profile and derives organization/profile identity
from `auth.uid()`. Client-supplied organization, role or actor IDs are not
accepted.

## Database Snapshot

The uninstalled RPC is:

`public.wos_qa_m4_readonly_proof_snapshot(p_order_id uuid, p_expected_version integer, p_version_label text)`

It is `SECURITY DEFINER`, owned by the NOLOGIN
`wos_m4_proof_verifier_owner`, has `search_path=''`, and is not executable by
`authenticated` until the separate activation phase. A private installer-owned
bridge returns the real `auth.uid()` only to the dedicated owner.

The function verifies:

1. One active same-organization Admin/Manager Profile.
2. A `QA-NONPROD-` order at the requested numeric version and version label.
3. `READINESS_CHECK`.
4. Exactly one CURRENT, non-superseded baseline.
5. Exactly four baseline items and four distinct reference-image IDs.
6. Exactly one image for each category:
   `PRODUCT`, `FILM_PATTERN`, `CUSTOMER_APPROVED_SAMPLE`, `SIGNED_SAMPLE`.
7. Every image belongs to the order, organization, current production version,
   is READY, non-superseded, in `wos-private`, and has the canonical path.
8. Exactly one unexpired Proof per image with matching organization, order,
   bucket and path.
9. Distinct active Office and Workshop signers, matching proof-set digests and
   expected post-order versions.
10. Four continuous M2 receipts with recomputed receipt digests.
11. `canStart=false`.

The safe response contains only order/version/baseline identifiers, expiry and
fingerprint fields, the four image IDs/categories/SHA-256 values, irreversible
object commitments and invariant booleans. It contains no Storage path,
Storage object ID, signed URL, token, raw Proof/Receipt row or organization ID.

## Object Commitment

The SQL function and trusted server use one canonical byte sequence:

```text
wos-m4-storage-object-v1
bucket=wos-private
path=<canonical-private-path>
id=<lowercase-storage-object-uuid>
version=<storage-version>
lastModified=<UTC YYYY-MM-DDTHH:MM:SS.ffffffZ>
```

The UTF-8 bytes, including the final newline, are SHA-256 hashed. SQL uses:

```sql
to_char(storage_object_updated_at AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
```

The server accepts only an ISO-8601 `Z` or numeric-offset timestamp with one to
six fractional digits, normalizes it to exactly six UTC fractional digits, and
requires an exact commitment match. It does not parse or compare timestamps
with millisecond precision.

## Server Verification Sequence

`GET /api/workshop-orders/m4/proof-verifier?orderId=<uuid>`:

1. Resolves the real Supabase identity and active Profile.
2. Loads the order through the caller RLS and requires exact organization,
   QA order, version, label and `READINESS_CHECK`.
3. Calls the snapshot RPC with the caller client.
4. Loads the four reference-image paths through caller RLS and revalidates the
   order, organization, entity type, version, category, READY state,
   non-superseded state and canonical path.
5. Calls `storage.info(path)` for every image with the caller JWT, rejects
   archived/delete-marker/invalid records, and recomputes the object commitment.
6. Requires the Storage `id`, `version` and exact microsecond `lastModified` to
   match the database commitment. When `size` is present, it must equal the
   downloaded byte count.
7. Calls `storage.download(path)` without transforms, recomputes SHA-256 over
   the raw bytes and compares it to the signed Proof SHA.
8. Repeats `storage.info(path)` and rejects any identity/version/time drift.
9. Repeats the database snapshot and rejects fingerprint, digest, expiry or
   immutable DTO drift.
10. Rechecks proof expiry against the server clock and returns `canStart=false`.

Every Storage, RPC and malformed-snapshot failure fails closed. The route never
falls back to a synthetic order, fabricated image or last-known valid detail.

## Failure Codes

Stable fail-closed outcomes include `FORBIDDEN`, `ORDER_NOT_AVAILABLE`,
`PROOF_ORDER_NOT_READY`, `VERSION_CONFLICT`, `PROOF_EXPIRED`,
`PROOF_OBJECT_CHANGED`, `PROOF_OBJECT_UNAVAILABLE`, `PROOF_SHA_MISMATCH`,
`SNAPSHOT_CHANGED` and `PROOF_VERIFIER_TIMEOUT`.

The public result never contains private object identity or proof evidence.

## SQL Isolation

The QA-only draft consists of:

- `/api` source route and verifier library;
- Forward phase 1: public database objects, owner role and snapshot RPC;
- Forward phase 2: activation of authenticated EXECUTE on the safe snapshot;
- Deactivate rollback: close authenticated EXECUTE first;
- Database rollback: drop only the fallback functions, policies, grants and
  role.

There is no Storage-policy forward or rollback file in the active path. The old
Storage-owner drafts are retained only as historical P0 evidence and are marked
`HISTORICAL_SUPERSEDED`.

The installer does not need USAGE on schema `storage`, SELECT on
`storage.objects`, membership in `supabase_storage_admin`, or any `service_role`
credential.

## Remaining Gates

No SQL installation or QA Preview is requested for this fallback.

Any future attempt needs a newly authorized design that obtains the exact
PostgreSQL object identity/version/update representation from a trusted,
order-scoped read path without exposing raw private metadata to the browser.
Alternatively, Owner could explicitly authorize a different millisecond
evidence standard, but that would be a security-standard change and is not
part of this task.

Next gate:

`STOP_OR_REDESIGN_EXACT_OBJECT_METADATA_READ`
