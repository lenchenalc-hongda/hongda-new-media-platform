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
- private binary size mismatch
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
CURRENT_EDGE_INDEX_SHA256=fe97273931416403f6008156df7831a0a4abf8f151793f0258e9f523fa58bdd7
CURRENT_CORE_SHA256=6d64bb62cba4239dfccee95d85d7a1c4585efd3f8018aa616b18ccbf44b0625b
CURRENT_TEST_SHA256=960314d3ee47eaf8938452c010eca611245ae479dc5fa701e8505da5262eb3d4
```

`deno check --sloppy-imports` and the Deno-run behavior test both pass. The
sloppy-import flag is needed only because the existing repository test imports
the extensionless core path used by the TypeScript test runner.

## Remaining Authorization

This source is not installed or deployed by the current authorization. A new
exact-HEAD authorization is required before:

1. deploying this separate function;
2. setting `WOS_V1_EDGE_READONLY_VERIFY_ENABLED=true`;
3. performing a hosted real-byte QA verification.

The current deployed `wos-v1-verify-image` remains writes-off and is not
evidence of real hosted PNG/SHA-256 success.
