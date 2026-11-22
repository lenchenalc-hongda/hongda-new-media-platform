# WOS V1 RC Security Audit

HISTORICAL_ARCHIVE: YES
PR269_STATUS: CLOSED_UNMERGED
NOT_CURRENT_INSTALL_AUTHORITY: See `RC_QA_INSTALL_PLAN.md` and PR #270.

AUDIT_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
AUDIT_SCOPE: local integration diff, M2 candidate SQL, Edge proof function,
WOS API routes and read-only QA metadata
AUDIT_RESULT: PASS_WITH_REVIEW_BLOCKERS
THIS_IS_NOT_INDEPENDENT_REVIEWER_APPROVAL

## Authentication And Organization Scope

PASS:

- Every WOS mutation/read route under `src/app/api/workshop-orders/**` uses the
  cookie-backed Supabase server client and `resolveVerifiedSupabaseIdentity`.
- Routes resolve the authoritative active `profiles` row by `user_id=auth.uid()`.
- No WOS API route accepts client-supplied `org_id`, profile ID, role, workflow
  status, proof digest or Gate state as authority.
- Order queries include the actor organization.
- Sales ownership is checked for Office mutation paths.
- Viewer and cross-organization denial was re-executed against local PostgREST.

Current evidence:

```text
OFFICE_READ_ROWS=1
VIEWER_READ_ROWS=0
FOREIGN_READ_ROWS=0
VIEWER_WRITE_HTTP=403
FOREIGN_WRITE_HTTP=403
```

## SQL Privilege Model

PASS:

- M2 functions use `SECURITY DEFINER` with fixed empty `search_path`.
- `PUBLIC`, `anon` and `authenticated` EXECUTE is revoked by the M2 candidate.
- M2 Gate tables and receipt tables have RLS enabled and no browser table grants.
- M2 gates default to OFF with `NOT_AUTHORIZED`.
- The M2 action requires a live, order-specific, organization-specific Gate.
- The action takes an advisory lock and `FOR UPDATE` on the order.
- Numeric order version CAS and immutable request fingerprints are enforced.
- Helper functions have no client EXECUTE grant.

The separate grant required to use the RPC from the app is intentionally not
part of the SQL candidate. It is represented by
`rc-sql/qa_m2_grant_after_independent_review_NOT_AUTHORIZED.sql` and is not
authorized.

## Private Image Proof

PASS:

- Edge proof writes are server-side only; no browser service-role code exists.
- Browser upload path is user-scoped and passes Storage RLS.
- Edge re-downloads bytes under the caller JWT and compares object ID, version,
  updated timestamp, owner, size, MIME and SHA-256.
- M2 joins current proofs back to `storage.objects` identity/version/timestamp.
- `CUSTOMER_APPROVED_SAMPLE` is mandatory with the other three image categories.
- Office and Workshop signatures must use distinct profiles and the same digest.
- Material changes and new baseline selections clear prior signatures.
- Final FILM/SIGNED_SAMPLE actions recheck the live proof set.

Fresh PostgreSQL 17 results:

```text
WOS_P2_M2_PG17_DOUBLE_SIGN_AND_PROOF_CHANGE_REJECTION=PASS
WOS_P2_M2_PG17_FINAL_MATERIAL_REQUIRES_SIGNOFF_AND_NO_AUTO_START=PASS
WOS_P2_M2_PG17_GATES_REVOKED_AFTER_TEST=PASS
```

## Client Secrets And Fake Success

PASS:

- WOS API/client code contains no service-role key.
- Current Next.js static bundle scan found no service-role identifier or JWT.
- UI success states require HTTP 200 plus an allowlisted response code and DB
  version/request binding.
- `canStart=false` is returned and rendered; no start button is exposed.

## Findings

### SEC-RC-001 P1: Independent security reviewer remains mandatory

The PR #269 GitHub reviews are both `COMMENTED` by the same GitHub account as
the PR author. They are not a distinct independent approval.

### SEC-RC-002 P1: Privileged mutate-and-restore proof threat

Passing ephemeral PG17 tests reject mutation while a signature is used. They do
not prove that a compromised `service_role` or database owner cannot mutate a
Storage object and later restore the exact previous metadata. This is a
privileged-role threat-model decision and requires independent review.

### SEC-RC-003 P1: Local-only revision-image function must never reach QA

`local_wos_revision_images.sql` permits an Office revision upload while the
order is `WAITING_MATERIAL`. It exists solely to exercise the disposable local
workflow. Applying it to QA would weaken the existing DRAFT-only proof guard.
It is excluded from the QA install plan.

### SEC-RC-004 P1: QA legacy single-order guard remains active

QA has `wos_qa_safety.p2_single_order_write_guard` tied to the existing fixed
synthetic order whenever either legacy Office/Operator Gate is ON. The QA E2E
must keep both legacy gates OFF and use only the new M2 gates.

### SEC-RC-005 P2: Existing QA image INSERT policy has no table INSERT grant

QA contains `wos_reference_images_insert_same_org`, but authenticated has only
SELECT on `wos_reference_images`. The install plan must not grant table INSERT.

## Verdict

No P0 defect was found in the authorized code and database-metadata review.
P1 review blockers remain. This audit cannot substitute for the independent
reviewer required by Issue #104 / PR #269.
