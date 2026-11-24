# WOS V1 QA Read-Only Byte Verifier Patch

Status: SOURCE ONLY / NOT DEPLOYED

Owner authorization: `WOS-V1-QA-EDGE-READONLY-20261123`

## Scope

`wos-v1-verify-image-readonly` is a separate QA-only Edge function. It does
not replace or change the deployed `wos-v1-verify-image` function.

The function is disabled by default:

```ini
WOS_V1_EDGE_READONLY_VERIFY_ENABLED=false
```

When explicitly enabled in a later authorization, it uses all of these
bindings:

```ini
WOS_SUPABASE_ALLOWED_REFS=xulmpqaknlwqqculbsek
WOS_V1_EDGE_ALLOWED_ORIGINS=<reviewed QA Preview HTTPS origin>
```

The function also rejects a runtime whose `SUPABASE_URL` is not exactly the
QA project. It cannot be enabled against Production by changing environment
values alone.

## Verification Flow

1. Require `verify_jwt=true`, an exact approved Origin and a caller JWT.
2. Resolve the caller's active Profile from `auth.uid()`.
3. Allow only active `admin` and `manager` Profiles in the same organization.
4. Require the exact Production Order ID, numeric version and `QA-R` label.
5. Require exactly four distinct image IDs and one image per required category.
6. Derive every canonical private path from the server-side order and image
   identity; caller-supplied order/organization truth is not accepted.
7. Read the existing verified-image Proof with the trusted service client and
   compare organization, order, image, path, bucket, SHA-256, object ID,
   object version, update time and validity window.
8. Download the private object with the caller's own JWT and RLS permissions.
9. Recompute PNG integrity and SHA-256 over the downloaded bytes.
10. Take a second Proof and Storage snapshot and require both to remain
    unchanged for the entire operation.
11. Return only a safe DTO: order identity, categories, stability booleans,
    `reviewReady=false` and `canStart=false`.

The function never calls proof renewal, proof recording, receipt creation or a
business RPC. It does not write the database.

## Expired-Proof Pre-Download Gate

The request flow now separates metadata preflight from byte verification:

1. Resolve the active Profile, organization, order and exact version.
2. Run canonical-path, Proof scope, SHA-256 declaration, Storage object ID,
   object version and microsecond update-time checks for all four images.
3. Reject `PROOF_EXPIRED`, missing Proof, invalid metadata or an order switch
   while the download counter is still zero.
4. Re-read the order snapshot.
5. Only after all four images pass preflight, download the first PNG.
6. Repeat Proof/Storage snapshots after each download and require stable
   objects, valid expiry and order version before returning success.

The request-level behavior test uses injected request dependencies and counts
actual download and mutation invocations. It does not infer ordering from
source strings.

## Security Boundary

The trusted service client is used only for two narrow reads:

- `wos_p7_service_storage_snapshot(text)`
- one exact row from `wos_qa_verified_image_proofs`

The business caller remains the user JWT throughout. No service-role identity
is substituted for the Office user. No Proof path, object ID, signed URL,
access token or raw Proof row is returned to the browser.

This primitive proves private image metadata and byte integrity only. It does
not approve an M4 proof-set, does not provide Office/Workshop signoff and does
not establish Production readiness. Both `reviewReady` and `canStart` remain
false even after successful byte verification.

## Microsecond Identity Hardening

PR #279 adds exact PostgreSQL `timestamptz` microsecond handling. The verifier
parses RFC 3339 timestamps with at most six fractional digits and normalizes
`Z` and numeric UTC offsets to one UTC microsecond integer.

The same normalized representation is used for:

- Proof `storage_object_updated_at` versus Storage snapshot `updatedAt`
- the first and second Proof snapshot
- `verified_at` versus `checked_at`
- `checked_at` versus `expires_at`

Stored Proof and Storage timestamps are compared as exact microseconds. A
runtime `checked_at` with fewer than six fractional digits is treated as an
uncertainty interval spanning the represented precision. The Proof must have
been verified no later than the interval start, and `expires_at` must be later
than the interval end. This prevents a JavaScript millisecond timestamp such
as `.123Z` from accepting a Proof that expires at `.123456Z`.

The expiration boundary is strict: a six-digit check exactly at `expires_at`
is expired, while one microsecond before it remains eligible if all other
checks pass. Equivalent timezone spellings of the same instant compare equal.
A different microsecond in the same millisecond fails closed.

No SHA-256, object ID, object version, organization, order, version, role,
Storage path or read-only constraint was relaxed.

## Offline Coverage

`tests/unit/workshop-order-qa-readonly-byte-verifier.test.ts` covers:

- exact four-category positive verification
- duplicate category with a missing category
- duplicate image ID
- fifth image
- wrong revision label
- Viewer, Operator, Sales, cross-organization and disabled runtime denial
- wrong numeric version and workflow status
- valid PNG/CRC/SHA-256
- content tampering
- object version replacement during verification
- Proof SHA change during verification
- Proof expiry during verification
- same millisecond with different microseconds
- equivalent `Z` and `+08:00` timestamp normalization
- exact `expires_at` boundary rejection and one-microsecond-before acceptance
- production-format millisecond `checked_at` cannot accept a Proof expiring
  later in that same millisecond
- first and fourth expired Proofs reject with zero downloads
- missing Proof and Storage identity mismatch reject with zero downloads
- all four valid images are required before any download
- Proof expiry after download begins rejects the request
- order switch before download rejects with zero downloads
- default-off runtime performs zero downloads
- Storage update without a matching Proof update
- order version switch and one stale image among the four categories
- all four current-version images
- private binary size mismatch
- zero database table mutations
- exactly one database RPC name, the read-only Storage snapshot
- absence of proof-renewal and proof-recording calls

## Deno Type Hardening

The originally reported hashes were recalculated before review:

```text
0e89fd7e486f471acf952e3bcf64664cd52d72c582f74d45b39aa9567655ff8a  Edge Index
3dfda3c7b9255e3cd49e77fc4c0c9401775f5856c974592aa64be2d805ff7d9d  Core
a58570c3de85e5f4edd8f450d37cc7b9df1bb73232104492a92f474887802d4c  Test
```

Deno 2.9.6 then identified type-only issues in the privileged client helper
signature, timer handle, and Origin narrowing. A request-level guard was also
added so default-off, Origin, runtime, content-type and JWT-presence decisions
are directly testable. The reviewed current files are:

```text
CURRENT_EDGE_INDEX_SHA256=f05b57809719c8b88d2dd7720c70f309bd95705d8d829b168ce04c7ecd8a2db7
CURRENT_EDGE_HANDLER_SHA256=2be70cbe1a9fddc9f29b0b207f33de3a39f8e9a04f090ac6654d70d8636a6056
CURRENT_CORE_SHA256=da2838a5ee7b76a4bc9f7d33d67ce87cf2e981baf564c92898e6501b5a9fef58
CURRENT_TEST_SHA256=4a640c1a0066eaccde7c2ce4a74ae77f4630ad51eed2ddcb782d35cb55d387b4
CURRENT_REQUEST_TEST_SHA256=eef2a742563c3603fdc891eb81a3322d3b61b8d017ad95b32719d891e052aa72
```

`deno check --sloppy-imports` and the Deno-run behavior test both pass. The
sloppy-import flag is needed only because the existing repository test imports
the extensionless core path used by the TypeScript test runner.

Current Git blob IDs:

```text
12918607dd64d3ad5848a2b02cab93891171e686  Edge Index
7b684e3017a2bc6c829ab9afb750b853abed2aaa  Handler
3444d71066c3f50aaf547aff3c2346228d442330  Core
e74e43a182f714cc22407dd081a9164759fc2319  Test
e285b6a2f5697c9015bd7555ba2475428cc73dbf  Request-order test
```

## Remaining Authorization

This source is not installed or deployed by the current authorization. A new
exact-HEAD authorization is required before:

1. deploying this separate function;
2. setting `WOS_V1_EDGE_READONLY_VERIFY_ENABLED=true`;
3. performing a hosted real-byte QA verification.

The current deployed `wos-v1-verify-image` remains writes-off and is not
evidence of real hosted PNG/SHA-256 success.
