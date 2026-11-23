# WOS V1 Production Source Gap Audit

Status: **PRODUCTION_NEUTRAL_CONTRACT_ADDED / BROWSER WORKFLOW NOT READY**

## 1. Completed source change

`src/lib/workshop-orders/production-runtime-contract.ts` now provides:

- fixed Production and QA Supabase project classification
- exact Production environment/auth acceptance
- write-disabled default
- QA/foreign environment rejection for Production writes
- reviewed V1 Production RPC names
- allowed first-release role vocabulary
- permanent `canStart=false` / pre-proof `reviewReady=false` invariant

The contract is intentionally not wired to a Production route or deployment.
It is covered by
`tests/unit/workshop-order-production-runtime-contract.test.ts` through the
existing WOS suite.

Additional source-level hardening completed in this branch:

- Foundation direct browser grants/insert policies are contained in the same
  transaction as the Foundation installation.
- P7 leaves all browser write RPCs revoked.
- Private Storage RLS now accepts each of the four required PNG categories and
  lets Operator read `SUBMITTED`, `WORKSHOP_REVIEW` and `WAITING_MATERIAL`
  orders while denying Viewer, cross-organization and anonymous reads.
- Production order creation rejects foreign-organization customer/project IDs
  and mismatched project/customer links.
- Runtime security evidence is compared against reviewed manifests rather than
  being regenerated from the implementation under test.

## 2. Existing bindings that block Production use

### Inbox read

`src/lib/workshop-orders/api-server.ts:49` and
`src/app/workshop-orders/inbox/page.tsx:16` require
`WOS_QA_INBOX_READONLY_ENABLED`, a preview environment and the approved sandbox
URL. Production therefore shows the empty preview shell rather than the live
Production Inbox.

Required: production-neutral read route using authenticated Supabase RLS and a
Production-specific off-by-default flag.

### Operator and Office actions

`src/app/api/workshop-orders/p2/actions/route.ts:25` requires a preview-only QA
flag and calls `wos_qa_p2_operator_action` or
`wos_qa_p2_review_correction` at line 83.

`src/app/api/workshop-orders/p2/office-revisions/route.ts:68` calls
`wos_qa_p2_office_revision`.

Required: route through the reviewed Production RPC names and enforce the
Production runtime contract without changing state-machine or CAS semantics.

### Returned-order Office inbox

`src/app/api/workshop-orders/p2/returns/route.ts:17` uses the QA read-only flag
and the live QA database shape. The query correctly filters
`P2_DOCUMENTS_INCOMPLETE / DOCUMENT`, but it is not a Production route yet.

### M2 and image proof

`src/app/api/workshop-orders/p2/m2/route.ts:79` calls
`wos_qa_p2_m2_action`.

`supabase/functions/wos-p7-verify-image/index.ts:6` hardcodes the QA Supabase
URL, and lines 116/145 call QA-named proof RPCs. This function must not be
deployed to Production.

Required: project-neutral Edge function that uses the caller JWT for Storage
access, a restricted service-only proof writer, real PNG byte hashing, object
identity/version stability, and no browser-visible Storage path or proof
record.

## 3. Missing first-release browser workflow

Current master has source contracts and QA-oriented APIs but not a complete
Production browser sequence for:

- Office create and submit
- Operator accept or return
- Office returned-order inbox, six-field correction and resubmit
- Operator current-version review
- four-material/current-image gap display with valid Proof state

The SQL lifecycle can run in PG17; the Production application cannot yet drive
that lifecycle end to end.

## 4. Role model

Production `profiles` currently allows `admin`, `manager`, `operator`, `sales`
and `viewer`. It does not allow `workshop` or `technician`.

The safe first release therefore uses:

- Office: `admin`, `manager`, `sales`
- Workshop: `operator`
- denied: `viewer`, anonymous and cross-organization identities

Adding new role names requires a separate reviewed role/data migration. The
source must not silently treat `viewer` or browser-supplied metadata as an
authorized role.

## 5. Private image launch standard

The following remain mandatory:

- exactly four current images
- distinct `reference_image_id`
- exactly one each of `PRODUCT`, `FILM_PATTERN`,
  `CUSTOMER_APPROVED_SAMPLE`, `SIGNED_SAMPLE`
- current order, organization and material version
- READY, not superseded
- canonical private object path
- stable Storage object identity/version/update time
- real downloaded bytes SHA-256 match
- proof unexpired before and after download
- Office and Workshop independent signoff over the same proof set
- M2 receipt continuity
- fail closed to `reviewReady=false` and `canStart=false`

No database-record-only shortcut is acceptable.

## 6. Release decision

The new source contract is useful because it creates a single deny-by-default
Production runtime definition and regression surface. It does not complete the
Production application workflow.

`PRODUCTION_NEUTRAL_CONTRACT=PASS`
`PRODUCTION_BROWSER_PATHS=NOT_READY`
`PROJECT_NEUTRAL_EDGE_VERIFIER=NOT_READY`
`REAL_STORAGE_BYTE_VERIFICATION=NOT_VERIFIED`
