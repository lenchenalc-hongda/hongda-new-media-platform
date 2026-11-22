# M4-02 Minimal Read-Only Proof Verifier

Status: DESIGN ONLY

This document does not authorize SQL creation, installation, role changes,
Storage changes, Gate activation, QA writes or Production deployment.

## Current Evidence Gap

Ordinary authenticated sessions can read materials, baselines, baseline items,
reference-image metadata, status history and permitted same-organization
profiles. They cannot select:

- `public.wos_qa_verified_image_proofs`
- `public.wos_qa_p2_m2_receipts`

The authenticated role also cannot execute `public.wos_qa_p2_m2_action` or
`public.wos_qa_p2_m2_checked_proof_set`. Ordinary Inbox therefore recognizes
historical signed baseline/status evidence but intentionally keeps
`currentPrivateProofState=UNVERIFIED...`, `reviewReady=false` and
`canStart=false`.

## Design Goal

Provide one GET-only, order-scoped verifier for a bounded QA order. It must
distinguish:

1. Database proof/object metadata valid and unexpired at two stable snapshots.
2. Actual private object bytes downloaded under the caller's RLS permissions.
3. Recomputed SHA-256 matching the registered proof.
4. Strict four-image baseline and exact one-image-per-category cardinality.
5. Matching Office/Workshop signatures and a continuous M2 receipt chain.

The verifier never grants start authority. `canStart=false` is invariant.

## Future Object Allowlist

No object in this list exists under this authorization.

### Read-only database function

`public.wos_qa_m4_readonly_proof_snapshot(p_order_id uuid, p_expected_version integer, p_version_label text)`

Recommended properties:

- `LANGUAGE plpgsql`
- `SECURITY DEFINER`
- `SET search_path=''`
- `VOLATILE` because it checks `clock_timestamp()`
- `REVOKE ALL FROM PUBLIC, anon`
- `GRANT EXECUTE TO authenticated`
- no dynamic SQL
- no writes
- only explicitly qualified objects

The function must derive the actor from `auth.uid()`. It must load exactly one
active `profiles` row for that user and reject missing, inactive or ambiguous
profiles. Caller-supplied actor, organization, role or profile IDs are not
accepted.

The RPC return type is itself the safe DTO. It must never contain a Storage
path, object ID, signed URL, access token or raw proof row. Because
`authenticated` can invoke the RPC directly through PostgREST, the route-level
read switch is defense in depth, not the authorization boundary.

Allowed read roles for this verifier:

- `admin`
- `manager`
- `sales` when same organization and normal WOS order visibility applies
- `operator`
- `workshop` / `technician` only if the server role policy explicitly includes
  them

Viewer and anonymous callers fail closed.

### Optional server-side helper functions

Only if independently reviewed:

- `public.wos_qa_m4_assert_exact_four_image_baseline(...)`
- `public.wos_qa_m4_assert_proof_receipt_chain(...)`

Both must remain private (`REVOKE ALL FROM PUBLIC, anon, authenticated`) and be
callable only by the snapshot function. They must not return Storage paths to
the browser.

No new table, trigger, column, RLS policy, direct table grant or dynamic SQL is
required by this design.

## Function Checks

The snapshot function must:

1. Require non-null `auth.uid()` and one active authoritative Profile.
2. Lock/read one production order by exact `p_order_id`, Profile organization,
   `p_expected_version`, `version_label=p_version_label`, active workflow and
   `QA-NONPROD-` order-number scope.
3. Require exactly one CURRENT, non-superseded, same-version baseline.
4. Require exactly four baseline items, four distinct reference-image IDs and
   exactly one required image for each category:
   `PRODUCT`, `FILM_PATTERN`, `SIGNED_SAMPLE`,
   `CUSTOMER_APPROVED_SAMPLE`.
5. Require every image to match order, organization, production version,
   `READY`, non-superseded, private bucket and a canonical order path.
6. Require exactly one current proof per selected image with matching bucket,
   path, Storage object ID/version/update time, valid SHA-256 format,
   `verified_at <= now < expires_at`, non-archived object and no delete marker.
7. Reuse the reviewed canonical proof-set logic where possible, but enforce the
   stricter M4 rule of exactly four images rather than four-to-twelve.
8. Require both Office and Workshop signer Profiles to resolve exactly once as
   active, same-organization, permitted-role records. Missing, ambiguous,
   inactive or cross-organization signer Profiles abort the verifier.
   Confirmation order and post-order versions must agree with the baseline.
9. Require exactly one `BASELINE_SELECT`, `BASELINE_OFFICE_CONFIRM`,
   `BASELINE_WORKSHOP_CONFIRM` and `FINAL_READINESS_CONFIRM` receipt for the
   current baseline, with unique request IDs, permitted roles, continuous
   numeric versions and matching proof-set digests.
10. Return a stable object snapshot fingerprint derived from proof/object IDs,
    object versions, updated times, proof SHA-256 and expiry.

Any missing, duplicate, malformed, cross-org, cross-order, stale or expired row
aborts the result. No partial success list is returned.

## Storage Bytes Verification

The database can validate stored metadata and object identity. It cannot prove
that file bytes currently hash to the recorded SHA merely by querying a proof
row.

The future Next.js server route must:

1. Call the snapshot RPC using the authenticated user's server-side Supabase
   client, never service role.
2. Read selected `wos_reference_images` metadata through the same authenticated
   RLS client.
3. Download each `wos-private` object through the user-scoped Storage client.
4. Recompute SHA-256 over the exact downloaded bytes with Web Crypto.
5. Compare all recomputed hashes with the proof snapshot.
6. Call the snapshot RPC again and require the same object identity/version,
   updated time, SHA, expiry and baseline fingerprint.
7. Return verified only if both snapshots match, all bytes download, every hash
   matches and no proof expires during the operation.

This satisfies actual byte verification without service role. It relies on the
existing `wos-private` Storage SELECT policies and fails closed if the caller
cannot download.

## Future Endpoint

Proposed route:

`GET /api/workshop-orders/m4/proof-verifier?orderId=<uuid>`

Requirements:

- same verified Supabase identity and active Profile requirements as the Inbox
  read route
- exact QA project binding, preview environment and dedicated read switch
- one UUID query parameter only
- no POST/PATCH/DELETE
- no service role
- no raw proof/table rows in response
- no Storage path, object ID, access token or signed URL in response
- strict timeout and order-level abort
- `Cache-Control: no-store, private`

Safe response shape:

```json
{
  "ok": true,
  "code": "QA_PROOF_VERIFIED",
  "data": {
    "orderId": "uuid",
    "orderVersion": 11,
    "versionLabel": "QA-R6",
    "baselineId": "uuid",
    "imageCategories": [
      "PRODUCT",
      "FILM_PATTERN",
      "SIGNED_SAMPLE",
      "CUSTOMER_APPROVED_SAMPLE"
    ],
    "metadataSnapshotStable": true,
    "contentSha256Verified": true,
    "officeWorkshopDistinct": true,
    "proofSetDigestMatch": true,
    "m2ReceiptChainComplete": true,
    "blockers": [],
    "canStart": false
  }
}
```

Blocked responses return stable codes such as `PROOF_EXPIRED`,
`PROOF_OBJECT_CHANGED`, `PROOF_SHA_MISMATCH`, `BASELINE_CARDINALITY_INVALID`,
`SIGNOFF_MISMATCH` and `RECEIPT_CHAIN_INVALID`, without private paths.

## SECURITY DEFINER Review Requirements

Before any future installation:

- Prove the function owner has only the minimum private-table and
  `storage.objects` read access needed.
- Prove function-owned bypass of RLS is compensated by explicit `auth.uid()`,
  active Profile, organization, order, role and version predicates.
- Confirm `SET search_path=''` and fully qualified function/table names.
- Confirm no dynamic SQL, temporary object, arbitrary path or caller-provided
  organization parameter.
- Confirm PUBLIC/anon cannot execute and authenticated cannot select base proof
  or receipt tables directly.
- Test direct authenticated RPC invocation with the Next.js read switch off and
  prove the RPC DTO still contains no private path or object identifier.
- Confirm response includes no private path, object ID, signed URL or raw
  receipt.
- Review concurrent object replacement, proof refresh, baseline supersession,
  receipt replay, role changes and profile deactivation.

## PostgreSQL 17 Offline Test Plan

This round does not create or execute the SQL. A future disposable local PG17
test must cover:

### Positive

- Active same-org Office/Operator can verify one exact order.
- Exactly four distinct images and four distinct categories.
- Four valid private proof/object rows.
- Matching Office/Workshop digests and distinct signers.
- Four current-baseline M2 receipts form a continuous version chain.
- `canStart=false`.

### Negative

- fifth image duplicating PRODUCT
- fifth image duplicating SIGNED_SAMPLE
- four rows with duplicate category and one missing category
- duplicate reference-image ID
- missing/extra baseline item
- wrong organization/order/version label
- viewer/anonymous/cross-org caller
- inactive or ambiguous Profile
- proof expired or expires during verification
- archived/delete-marked/changed Storage object
- malformed SHA-256 or changed proof SHA
- baseline superseded or multiple CURRENT baselines
- same Office/Workshop signer
- missing, ambiguous, inactive or cross-organization signer Profile
- missing/duplicate/out-of-order M2 receipt
- proof-set digest mismatch
- transaction rollback leaves all rows/ACLs unchanged

## Rollback And Fingerprints

Before any future installation:

1. Capture function definitions, ACLs, table grants, policies and relevant
   proof/receipt counts.
2. Store raw SQL, rollback SQL, Git blob SHA and raw-file SHA-256.
3. Generate function argument signatures plus SHA-256 fingerprints for
   `pg_get_functiondef()`, `proowner`, `proacl`, `proconfig`, owner role
   memberships, direct dependencies, relevant table ACLs and relevant policies.
   `pg_get_functiondef()` alone does not identify the Security Definer owner.
4. Install only in one transaction, with all QA gates OFF.
5. Roll back by revoking/dropping only the new read functions and any private
   helper, without dropping tables or deleting immutable proof/receipt history.
6. Re-verify authenticated execute denial after rollback.
7. Add a PG17 owner-escalation test proving the owner cannot be swapped to a
   higher-privilege role without changing the approved fingerprint and tests.

## Explicit Non-Authorizations

- no SQL creation or installation
- no table SELECT grant
- no RLS disablement
- no Storage policy change
- no service-role business call
- no proof/receipt mutation
- no Gate activation
- no M4-02 write E2E
- no automatic start or Production release
