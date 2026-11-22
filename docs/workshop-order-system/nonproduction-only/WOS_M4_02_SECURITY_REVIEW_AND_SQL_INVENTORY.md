# WOS M4-02 Security Review And SQL Inventory

Status: `SOURCE_PASS_WITH_RESIDUAL_RISKS` / `QA_SQL_NOT_INSTALLED`

Issue: `#274`

Repository: `lenchenalc-hongda/hongda-new-media-platform`

Base master: `c3b63eaddafec8aaae8460b26e804cbb4bdd70ba`

Target QA project if separately authorized:
`xulmpqaknlwqqculbsek` (`hongda-review-dev`)

## Read-Only QA Schema Audit

The audit on 2026-11-22 used SELECT-only catalog and aggregate queries. It did
not install SQL, update rows, change policies, or call a business action.

- PostgreSQL server version: `17.6`
- Required proof and receipt columns are present.
- `wos_qa_verified_image_proofs.storage_object_version` is nullable.
- `storage.objects.version` is nullable.
- `authenticated` has no direct SELECT on either private table.
- `authenticated` has no EXECUTE on any of the three M2 functions.
- Installed M2 function fingerprints exactly match the reviewed local
  definitions:

| Function | Owner | SECURITY DEFINER | Definition SHA-256 |
| --- | --- | --- | --- |
| `wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)` | `postgres` | YES | `be003e28743691c216784030dcd163612185d10eae3481ab67087e566e326830` |
| `wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)` | `postgres` | NO | `a5c13f9acab42b378e971475a4d0dd0928618942979cbed9bd70a162c82d68d1` |
| `wos_qa_p2_m2_spec_digest(uuid)` | `postgres` | NO | `3a684301e7cb890cd4a3f325b65d392c18902fca65054a4dada9157bddc5e173` |

All four Gate rows were OFF, with `enabled_until=NULL`,
`approval_reference=NOT_AUTHORIZED`, and no order/organization whitelist:

- `OPERATOR_WRITES`
- `OFFICE_WRITES`
- `M2_OPERATOR_WRITES`
- `M2_OFFICE_WRITES`

Historical order `953d2204-3e65-4b75-b10e-c6e97f1bbb56` was
`READINESS_CHECK / v11 / QA-R6`, with one current baseline, four current
images and four M2 receipts. All five stored proofs for that order were
expired, so they cannot be represented as current verification evidence.

Candidate order `2071a963-1b35-4c96-81cd-709d8180ad49` was
`WAITING_MATERIAL / v7 / QA-R6` with no current baseline and no M2 receipts.

The existing `wos_p7_private_object_select` policy permits Operator download
only while an order is `SUBMITTED`. M4 verification occurs at
`READINESS_CHECK`, so caller-JWT download alone cannot support the product
path. The draft includes one object-scoped Storage SELECT policy for that gap.

## Two-Stage Proof Design

1. The server calls the order-scoped snapshot RPC with the real user client.
2. The RPC derives actor identity from `auth.uid()`, resolves one active
   Profile, and checks same organization, role, order, numeric version,
   version label, exactly one CURRENT baseline, exactly four distinct images,
   one image per required category, canonical private paths, unexpired proofs,
   Storage object identity/version, independent signers, recomputed proof-set
   digest and the four-field canonical receipt chain.
3. The RPC returns only order/version/baseline identifiers, expiry/fingerprint
   fields, four image IDs/categories/expected SHA-256 values and invariant
   booleans. It does not return paths, object IDs, raw proof rows, receipt rows
   or tokens.
4. The server reads reference-image paths through the caller's existing
   authenticated RLS, then downloads using the caller's Storage session.
5. The Storage policy invokes a boolean guard. That guard resolves the exact
   path to one same-organization current image and calls the same full snapshot
   verifier. It allows the object only when the snapshot succeeds and contains
   that image ID. There is no weaker alternate proof path.
6. The Node server recomputes SHA-256 over downloaded bytes with
   `node:crypto`, then calls the snapshot RPC a second time. It fails closed if
   the stable DTO projection, snapshot fingerprint, object identity, expiry or
   version changes.
7. The route has a 15-second deadline, aborts supported DB requests with
   `AbortController`, checks the signal around Storage I/O and returns
   `PROOF_VERIFIER_TIMEOUT` without partial success.
8. The response remains `canStart=false`. Real Storage download service
   behavior is not claimed until a separately authorized QA Preview browser
   test.

The database RPC is directly callable by an authenticated same-organization
QA user even when the Next.js read switch is off. That access is intentional
and bounded: the RPC is installed only in the isolated QA database, requires a
`QA-NONPROD-` order, performs all identity/version checks, and returns only a
safe, non-executable DTO. The environment read switch gates the business
route, not the database authorization boundary.

## Object And Permission Inventory

Forward draft creates:

- NOLOGIN owner role `wos_m4_proof_verifier_owner`
- `public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)`
- `public.wos_qa_m4_can_download_proof(text,text)`
- Eight owner-only SELECT policies on the seven read tables plus
  `storage.objects`
- One authenticated SELECT policy on `storage.objects`, named
  `wos_m4_proof_verifier_storage_read`
- Owner SELECT grants on `profiles`, production orders, baselines, baseline
  items, reference images, verified image proofs, M2 receipts and
  `storage.objects`
- Owner EXECUTE on `auth.uid()` and
  `public.wos_qa_p2_m2_spec_digest(uuid)`
- Authenticated EXECUTE on the two new functions only

No table is created or altered. No column is added. No business row is written.
No existing RLS policy is disabled or replaced. No direct proof/receipt table
SELECT is granted. No M2, Legacy or application write permission is added.
The preflight verifies all private-table DML/TRUNCATE/REFERENCES/TRIGGER
privileges, PUBLIC/anon grants, PUBLIC M2 EXECUTE and RLS status for all eight
read targets before creating any object.

Rollback removes only the two new functions, the dedicated role, its owner
policies/grants and the one new Storage SELECT policy. It does not delete order,
baseline, image, proof, receipt or Storage object data.

## Published Draft Fingerprints

These values must be recalculated before any Owner installation authorization.

| Artifact | Raw SHA-256 | Git Blob SHA |
| --- | --- | --- |
| Forward SQL | `878185f9563c1b25986e07de853d4e9f19bfde8f16021537acd1c26d353f88ca` | `f057aa23775c5901fdfb430e64fc7d657ed72baf` |
| Rollback SQL | `f757cde5b3514f7a9663cee54bb30307ca426d5c0c8bdf5fa366ae76828870b5` | `58ce9ec64214b5aa6bfd378fa149e2411675238b` |

PG17 installed-state fingerprints:

| Item | SHA-256 |
| --- | --- |
| Snapshot function definition | `b46d63de8bd6e88f214f88d49a7546d5ef79f9654d86a967797262f8783cc84a` |
| Storage guard function definition | `7406b8245374568af84bb3afb2ec9c55a62058ed873730e395f06fdbc27fd765` |
| Combined function ACL/config/owner-role/policy inventory | `5d2675cc7ac0d8e5dcda4d72d2228abc6e5431e0678f594753fab460b63cbfd5` |

## PostgreSQL 17 Offline Evidence

The suite runs only in a disposable `postgres:17-alpine` container with
network mode `none` and explicit disposable labels. It removes every temporary
database and owner role before exit.

Covered and passing:

- Office and Operator positive snapshots and Storage-path reads
- Viewer, anonymous and cross-organization denial
- missing, inactive and ambiguous Profile denial
- fifth image, duplicate image ID, missing category and duplicate CURRENT
  baseline denial
- inactive signer and same signer denial
- malformed/expired proof, NULL/blank object version, changed/archived/deleted
  object denial
- missing, duplicate, out-of-order, digest-tampered and result-tampered M2
  receipt denial
- order version drift and two-snapshot expiry/state-change denial
- direct Storage guard denial when the same snapshot invariants fail
- function owner, role attributes, fixed `search_path`, function/table/schema
  ACLs and PUBLIC/anon denial
- rollback comparison of row counts, deterministic content hashes, table ACL
  hashes, schema ACL hashes and relevant privilege booleans

Captured output (trailing display spaces normalized for Git):
`docs/workshop-order-system/nonproduction-only/WOS_M4_02_PG17_EVIDENCE_20261122.log`

## Residual Risks And Next Gate

- PG17 tests the RLS predicates through a synthetic Storage metadata table;
  only a real QA Preview can prove the Supabase Storage service honors the new
  policy end to end.
- Existing QA proofs are expired. A live verifier test cannot show a successful
  current proof without a separately authorized proof refresh or a newer
  independently verified QA order.
- The SQL cannot prove Vercel Production auto-build suppression or domain
  state. Those remain mandatory external installer checks.
- Any SQL installation requires a new Owner authorization bound to the final
  raw SHA-256, Git blob SHA, PG17 logs, function fingerprints and exact QA
  project.

Next gate: `EXACT_SQL_QA_INSTALL_AUTHORIZATION`.

## Independent Review

Final independent read-only source and security review:

`SOURCE_PASS_WITH_RESIDUAL_RISKS`

The reviewer confirmed the current SQL raw/Git blob hashes, regenerated PG17
evidence, full-snapshot Storage guard, disposable-database context restriction,
direct-grant/RLS preflight, timeout/abort behavior and rollback content/ACL
comparison. No remaining source-level security blocker was identified.
