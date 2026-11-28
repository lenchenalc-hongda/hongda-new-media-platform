# WOS V1-INT-01 Hosted QA Readiness Package

Status: **AUTHORIZATION_PREPARATION_ONLY**

No QA SQL, RLS, Storage policy, Secret, Edge function or Vercel configuration
was installed or changed by this document.

## Live code and environment baseline

- Repository: `lenchenalc-hongda/hongda-new-media-platform`
- QA Supabase: `xulmpqaknlwqqculbsek`
- Production Supabase: `amqpvxrurenevniilhtl`
- PR #276 remains Draft and unmerged.
- PR #277 remains Draft, stacked on PR #276 until a separately authorized
  protected merge changes master.

The QA function catalog was read successfully immediately before the final
audit. It confirmed that these functions do not exist:

- `wos_p7_service_storage_snapshot`
- `wos_v1_renew_expired_image_proof`
- `wos_p7_record_trusted_image_proof`

The QA gate/table metadata evidence also has these properties:

- Operator and Office Gate rows are OFF.
- Both Gate tables currently include `allowed_order_id`,
  `allowed_organization_id`, `allowed_profile_id` and `activated_at`.
- Browser roles have no direct write grant on
  `wos_qa_verified_image_proofs`.
- `wos_qa_verified_image_proofs.storage_object_version` remains nullable in
  the historical QA schema. The new verifier rejects NULL/empty version input
  and requires exact non-NULL object identity for new proofs without rewriting
  historical rows.

Fresh read-only counts before this package were:

```text
orders=84
submission_receipts=82
inbox=82
verified_proofs=31
proof_receipts=4
action_receipts=11
office_revisions=4
review_receipts=2
m2_receipts=4
```

Target order `2071a963-1b35-4c96-81cd-709d8180ad49` remains
`WAITING_MATERIAL / v7 / QA-R6`, with 2 action receipts, 2 Office revisions,
1 review receipt, 1 verified Proof and 0 M2 receipts. Order counts, Gate rows
and Storage inventory must still be captured again immediately before install.

Exact machine-readable baseline:

```text
docs/workshop-order-system/production-readiness/evidence/WOS_V1_QA_DATA_BASELINE_20261123.json
SHA256=174b8c750f52a505ae74efda6cf4b459d723669406b87b2d5d2e2fb4989f20ac
```

It records all Gate rows OFF with no active order/org/profile scope, zero
NULL/empty historical proof versions, all three target functions absent and the
target order/receipt counts above. It contains no customer records, private
Storage paths or credentials.

## Edge contract

The project-neutral Edge function invokes exactly:

```text
wos_p7_service_storage_snapshot(p_path)
wos_v1_renew_expired_image_proof(
  p_image_id, p_order_id, p_actor_user_id, p_storage_path,
  p_storage_object_id, p_storage_object_version,
  p_storage_object_updated_at, p_sha256
)
wos_p7_record_trusted_image_proof(
  p_image_id, p_order_id, p_actor_user_id, p_storage_path,
  p_storage_object_id, p_storage_object_version,
  p_storage_object_updated_at, p_sha256
)
```

The Edge function obtains the object snapshot before and after the caller-JWT
download, validates PNG/CRC/SHA-256, and only then performs renewal and proof
recording through the service credential.

Browser calls require an exact HTTPS match in
`WOS_V1_EDGE_ALLOWED_ORIGINS`. The function implements OPTIONS preflight,
allows only `POST, OPTIONS`, and echoes only an approved Origin.

Version acceptance is state-bound:

- `DRAFT` orders accept only `V1`, `V2`, ... labels.
- QA revision states `WAITING_MATERIAL` / `READINESS_CHECK` accept only
  `QA-R1`, `QA-R2`, ... labels.
- Revision verification additionally requires the exact order/organization
  `M2_OFFICE_WRITES` Gate, a live TTL and a non-placeholder approval reference.

## Minimal QA-only SQL package

Forward file:

`docs/workshop-order-system/production-readiness/sql/WOS_V1_HOSTED_QA_DEPENDENCIES_NOT_AUTHORIZED.sql`

```text
SHA256=9acce427e96cc928aa11c0e4fa20060fec4df75972ab09c122c1f578dc57858f
GIT_BLOB=911349aeebbef95d45dab4705820ebc75178d4f3
```

Rollback file:

`docs/workshop-order-system/production-readiness/sql/WOS_V1_HOSTED_QA_DEPENDENCIES_ROLLBACK_NOT_AUTHORIZED.sql`

```text
SHA256=ef4319e717e3219e2718a1737c4519e80f57c39d0df00d11fe9423affc4b5c79
GIT_BLOB=ff54250c3f37d5fb379bd5d49c7ed4aa2b10fd35
```

Exact additive object scope:

1. Function `public.wos_p7_service_storage_snapshot(text)`
2. Function
   `public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)`
3. Function
   `public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)`

No table, column, index, constraint, trigger, RLS policy, Storage policy,
bucket, Secret or role is created or altered.

The QA HTTP adapter is wired into the normal Office and Workshop V1 pages.
Source currently forces QA `writesEnabled=false` even if
`WOS_V1_QA_APP_WRITES_ENABLED=true`. A future Hosted write package must add an
order-scoped database Gate to the QA business RPC surface; a Next.js flag alone
cannot stop direct PostgREST RPC calls.

The functions reuse the existing QA private-object snapshot helper, Proof
guard trigger, trusted-Proof receipt table, cleanup-claim checks and M2 signoff
invalidation function. All three functions are `SECURITY DEFINER`,
`search_path=''`, revoked from `PUBLIC`, `anon` and `authenticated`, and
granted only to `service_role`.

The proof writer takes the same `wos-qa-m2:<order-id>` transaction advisory
lock used by QA M2 actions before locking the production-order row. This keeps
lock ordering consistent and avoids a proof-vs-M2 deadlock.

Recording and renewal share the same state/version binding. A `V*` label in a
QA revision state and a `QA-R*` label in `DRAFT` are rejected before Storage or
Proof mutation.

## Offline PostgreSQL 17 evidence

The disposable suite installs the reviewed existing QA M2/revision baseline,
installs this exact forward draft, exercises it and then applies the rollback:

```text
WOS_V1_HOSTED_QA_DEPENDENCIES_PG17=PASS
WOS_V1_HOSTED_QA_ROLLBACK_PRESERVES_PROOF_HISTORY=PASS
WOS_V1_HOSTED_QA_BROWSER_ACCESS=DENIED
```

Covered behavior:

- service-role snapshot contract
- real PNG object metadata/version snapshot
- source.png canonical version path
- proof creation
- deterministic proof request idempotency
- expired Proof renewal
- NULL Storage version rejection (`22023`)
- DRAFT `V*` proof creation
- real `WAITING_MATERIAL / QA-R6` revision proof creation
- correct scoped `M2_OFFICE_WRITES` Gate acceptance
- wrong Gate and wrong-order Gate rejection
- old `QA-R5` path rejection for a current `QA-R6` order
- `V*` / `QA-R*` state-label mismatch rejection
- revision Proof renewal under the scoped Gate
- authenticated and anonymous EXECUTE denial
- browser table-write denial
- rollback removes only the three functions and preserves Proof history

This is offline evidence. It is not a Hosted QA pass.

## Separate Owner install authorization

The next gate is:

`OWNER_AUTHORIZE_EXACT_QA_HOSTED_DEPENDENCIES_INSTALL`

The authorization must bind all of:

- QA project `xulmpqaknlwqqculbsek` only
- Forward SHA-256
  `9acce427e96cc928aa11c0e4fa20060fec4df75972ab09c122c1f578dc57858f`
- Rollback SHA-256
  `ef4319e717e3219e2718a1737c4519e80f57c39d0df00d11fe9423affc4b5c79`
- One transaction for the forward file with
  `wos_v1.qa_hosted_install_authorized=yes`
- Fresh pre-install Gate, order, Proof and function-fingerprint capture
- Function/ACL post-install verification without opening write Gates
- Immediate rollback authority if any fingerprint or permission differs
- Expected QA data baseline SHA-256
  `174b8c750f52a505ae74efda6cf4b459d723669406b87b2d5d2e2fb4989f20ac`

The install authorization does not authorize an Edge deployment, write Gate,
test order, browser E2E or Production action.

## Hosted QA execution sequence after separate authorization

1. Capture target QA order, organization, actor profiles, row counts, Gates,
   Proof/receipt counts and Storage inventory.
2. Install the exact functions and verify ACLs and fingerprints.
3. Deploy `wos-v1-verify-image` only to the isolated QA project with
   `WOS_SUPABASE_ALLOWED_REFS=xulmpqaknlwqqculbsek`.
4. Configure the isolated Preview with the QA adapter flags and all writes OFF.
5. Prove reads, Viewer/cross-org/anonymous denial and Gate-OFF write denial.
6. Obtain a separate bounded write authorization and create a new synthetic
   `QA-` order. Do not reuse historical orders or Proof records.
7. Run the Office → Operator accept/return → Office revision/resubmit →
   Operator review path with real JWT, four real PNGs and database readback.
8. Close both Gates immediately and prove all later writes fail even if an old
   Preview deployment retains old environment variables.
9. Compare all unrelated QA and Production evidence to the pre-install
   baseline.

## Current blockers

- PR #276 has no merge authorization in this turn.
- PR #277 cannot receive Master-target CI until #276 is separately merged.
- Exact QA function installation is not authorized.
- The Edge function is not deployed to QA.
- The QA adapter and bounded write Gate configuration must be deployed and
  exercised only after their own approval.
- The current adapter is read-only; a separate QA business-RPC Gate design is
  required before Hosted write authorization.
- Real Storage bytes, object identity/version stability and browser HTTP flow
  remain unverified in Hosted QA.

`HOSTED_QA_PASS=NO`
