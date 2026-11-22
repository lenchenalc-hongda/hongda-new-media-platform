# M4-02 Minimal Read-Only Proof Verifier

Status:
SOURCE IMPLEMENTED / QA SQL NOT INSTALLED / HOSTED STORAGE-OWNER EXECUTOR BLOCKED

This document does not authorize SQL installation, role changes, live Storage
changes, Gate activation, QA writes or Production deployment. The source and
disposable PostgreSQL 17 evidence are review artifacts only.

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

A read-only audit of QA project `xulmpqaknlwqqculbsek` on 2026-11-22 confirmed:

- PostgreSQL 17.6 and the expected proof/receipt columns are present.
- `authenticated` has no SELECT on the two private proof/receipt tables.
- The three installed M2 functions match the reviewed local definitions by
  function SHA-256, owner, `SECURITY DEFINER` flag and `search_path`.
- All Operator, Office and M2 Gates are OFF with TTL NULL and
  `approval_reference=NOT_AUTHORIZED`.
- Existing QA proofs for the historical v11 order are expired. They remain
  historical evidence, not current verification evidence.
- The existing private Storage SELECT policy permits Operator only while an
  order is `SUBMITTED`; M4 verification occurs at `READINESS_CHECK`.
- QA `postgres` is not a superuser and does not own `storage.objects`.
  `supabase_storage_admin` owns that table, and the installer has no MEMBER,
  SET or USAGE relation to that owner role.
- `auth.uid()` is owned by `supabase_auth_admin`, has PUBLIC EXECUTE, and the
  installer has no grant option on that function.
- No project-specific Supabase-supported executor for the exact
  `storage.objects` policy transaction has yet been demonstrated. The split
  phase SQL is reviewable, but hosted installation remains a hard blocker.

## Design Goal

Provide one GET-only, order-scoped verifier for a bounded QA order. It must
distinguish:

1. Database proof/object metadata valid and unexpired at two stable snapshots.
2. Actual private object bytes downloaded under the caller's RLS permissions.
3. Recomputed SHA-256 matching the registered proof.
4. Strict four-image baseline and exact one-image-per-category cardinality.
5. Matching Office/Workshop signatures and a continuous M2 receipt chain.

The verifier never grants start authority. `canStart=false` is invariant.

## QA-Only Object Allowlist

None of these objects is installed by this source task. The uninstalled split
installation creates and the staged rollback removes:

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

The function derives the actor from the real request UID through a private
SECURITY DEFINER bridge owned by the QA installer. The bridge calls
`auth.uid()` and is executable only by the dedicated owner. The RPC loads
exactly one active `profiles` row and rejects missing, inactive or ambiguous
profiles. Caller-supplied actor, organization, role or profile IDs are not
accepted.

The RPC return type is itself the safe DTO. It never contains a Storage
path, object ID, signed URL, access token or raw proof row. Because
`authenticated` can invoke the RPC directly through PostgREST, the route-level
read switch is defense in depth, not the database authorization boundary.
Direct access is intentionally limited to the isolated QA database and a
`QA-NONPROD-` order, requires the real same-organization Profile, and returns
only a safe non-executable DTO. The read switch gates the business route.

Allowed read roles for this verifier:

- `admin`
- `manager`
- `sales` only when the Profile is the same-organization order creator or sales
  owner
- `operator`
- `workshop` / `technician` only if the server role policy explicitly includes
  them

Viewer and anonymous callers fail closed.

### Scoped Storage download guard

The existing Storage policy above is incompatible with Operator verification
at `READINESS_CHECK`. A narrow QA-only policy is therefore included in the
uninstalled SQL:

- `public.wos_qa_m4_can_download_proof(p_bucket_id text, p_object_name text)`
- `wos_m4_proof_verifier_storage_read` on `storage.objects`

The guard returns a boolean only. It resolves an exact READY, non-superseded
same-organization image, then calls the full snapshot verifier using that
order's numeric version and label. Storage access is allowed only when the
snapshot succeeds and its four-image DTO contains that image ID. This prevents
the Storage policy from becoming a weaker alternate verifier. It does not
return a path, object ID, proof row, signed URL or token.

No new table, column, trigger, direct private-table grant or dynamic SQL is
required. The object-scoped Storage policy remains uninstalled and is a
separate storage-owner phase.

## Function Checks

The snapshot function must:

1. Require the private caller-UID bridge and one active authoritative Profile.
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

The implemented Next.js server route must:

1. Call the snapshot RPC using the authenticated user's server-side Supabase
   client, never service role.
2. Read selected `wos_reference_images` metadata through the same authenticated
   RLS client.
3. Download each `wos-private` object through the user-scoped Storage client.
4. Recompute SHA-256 over the exact downloaded bytes with Node `node:crypto`
   on the Node.js server runtime.
5. Compare all recomputed hashes with the proof snapshot.
6. Call the snapshot RPC again and require the same object identity/version,
   updated time, SHA, expiry and baseline fingerprint.
7. Recheck expiry against the server's current wall clock after all downloads
   and the second snapshot, not only against a database statement-start time.
8. Return verified only if both snapshots match, all bytes download, every hash
   matches and no proof expires during the operation.

This satisfies actual byte verification without service role. It relies on the
caller's JWT plus the proposed object-scoped Storage read policy, and fails
closed if the caller cannot download.

## Implemented Endpoint

Route:

`GET /api/workshop-orders/m4/proof-verifier?orderId=<uuid>`

Requirements:

- same verified Supabase identity and active Profile requirements as the Inbox
  read route
- exact QA project binding, preview environment and dedicated default-OFF
  `WOS_QA_M4_PROOF_READONLY_ENABLED` switch; the Inbox flag is not reused
- one UUID query parameter only
- no POST/PATCH/DELETE
- no service role
- no raw proof/table rows in response
- no Storage path, object ID, access token or signed URL in response
- 15-second deadline with `AbortController`, DB abort signals and fail-closed
  `PROOF_VERIFIER_TIMEOUT`
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
- Prove function-owned bypass of RLS is compensated by the private caller-UID
  bridge,
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

## PostgreSQL 17 Offline Evidence

The staged forward and rollback drafts were executed only in disposable
`postgres:17-alpine` containers with network mode `none`. Installation runs as
a non-superuser `CREATEROLE` installer with a synthetic Storage owner and a
separate Auth owner. This proves PostgreSQL permission mechanics, not a hosted
Supabase Storage-policy executor. No Supabase connection is used by the suite.
The suite first proves the old
single-executor path fails, then executes the three forward phases and the
three rollback phases. A pre-install baseline stores deterministic row-content,
table-ACL and schema-ACL hashes for comparison after rollback.

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
- same-organization Sales caller who is neither creator nor sales owner
- inactive or ambiguous Profile
- proof expired or expires during verification
- archived/delete-marked/changed Storage object
- malformed SHA-256 or changed proof SHA
- NULL or blank Storage object version
- baseline superseded or multiple CURRENT baselines
- same Office/Workshop signer
- missing, ambiguous, inactive or cross-organization signer Profile
- missing/duplicate/out-of-order/digest-tampered M2 receipt
- tampered `result_json.canStart=true`
- proof-set digest mismatch
- direct Storage-path denial when the same snapshot invariants fail
- transaction rollback leaves row contents and ACLs unchanged

## Rollback And Fingerprints

Before any future installation:

1. Capture function definitions, ACLs, table grants, policies and relevant
   proof/receipt counts.
2. Store raw SQL, rollback SQL, Git blob SHA and raw-file SHA-256.
3. Generate function argument signatures plus SHA-256 fingerprints for
   `pg_get_functiondef()`, `proowner`, `proacl`, `proconfig`, owner role
   memberships, direct dependencies, relevant table ACLs and relevant policies.
   `pg_get_functiondef()` alone does not identify the Security Definer owner.
4. Install as three fail-closed owner phases, with all QA gates OFF:
   database objects, Storage-owner policies, then authenticated EXECUTE
   activation.
5. Roll back in reverse owner order: deactivate EXECUTE, drop Storage policies,
   then drop database objects.
6. Re-verify authenticated execute denial after deactivation and rollback.
7. Add a PG17 owner-escalation test proving the owner cannot be swapped to a
   higher-privilege role without changing the approved fingerprint and tests.

The database phase also refuses installation unless all P2/Office/M2 Gates are
fully closed with no whitelist/TTL, `authenticated` still lacks direct private
proof/receipt SELECT and M2 EXECUTE, the three reviewed M2 function
fingerprints match, and the two Issue #274 QA orders retain their approved
state/version. Project identity, Production auto-build suppression and domain
state cannot be proved from inside SQL and remain mandatory external installer
checks. The unavailable hosted Storage-owner executor remains a hard stop.

## Current Deliverables

- `GET /api/workshop-orders/m4/proof-verifier?orderId=<uuid>`
- safe snapshot DTO parser and stable double-snapshot comparator
- real-byte SHA-256 verification using the caller's Supabase Storage session
- exact four-image and four-category validation
- split Phase 1/2/3 activation and reverse rollback SQL drafts marked
  `INSTALL_NOT_AUTHORIZED`
- disposable PostgreSQL 17 positive, negative, role/owner, Storage-policy and
  hosted-like non-superuser installer rollback suite

## Explicit Non-Authorizations

- no QA SQL installation
- no table SELECT grant
- no RLS disablement
- no Storage policy change
- no service-role business call
- no proof/receipt mutation
- no Gate activation
- no M4-02 write E2E
- no automatic start or Production release
