# WOS M4-02 Security Review And SQL Inventory

Status:
`SOURCE_PASS / BLOCKED_HOSTED_STORAGE_OWNER_EXECUTOR / QA_SQL_NOT_INSTALLED`

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
- QA `postgres` is `NOSUPERUSER`, `CREATEROLE` and owns the named public
  business tables.
- `storage.objects` is owned by `supabase_storage_admin`.
- `postgres` has SELECT WITH GRANT OPTION and broad table privileges on
  `storage.objects`, but no MEMBER/SET/USAGE relation to the owner role and no
  policy DDL authority.
- `auth.uid()` is owned by `supabase_auth_admin`; PUBLIC EXECUTE already exists
  and the installer has no EXECUTE WITH GRANT OPTION.
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
path. The draft therefore separates an object-scoped Storage SELECT policy into
a Storage-owner phase.

## Two-Stage Proof Design

1. The server calls the order-scoped snapshot RPC with the real user client.
2. The dedicated owner calls a private installer-owned bridge that returns
   `auth.uid()`. This avoids requesting or fabricating USAGE/GRANT authority on
   the Auth-owned schema. The RPC resolves one active Profile and checks same
   organization, role, order, numeric version,
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

The database RPC becomes directly callable by an authenticated same-organization
QA user immediately after Phase 3 activation, even when the Next.js read switch
is off. That access is intentional and bounded: the RPC exists only in the
isolated QA database, requires a `QA-NONPROD-` order, performs all
identity/version checks, and returns only a safe, non-executable DTO. Phase 3
must be separately approved. The route uses the dedicated default-OFF
`WOS_QA_M4_PROOF_READONLY_ENABLED` switch.

## Object And Permission Inventory

Phase 1 database draft creates:

- NOLOGIN owner role `wos_m4_proof_verifier_owner`
- `public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)`
- `public.wos_qa_m4_can_download_proof(text,text)`
- `public.wos_qa_m4_current_user_id()`, a private installer-owned bridge
- Seven owner-only SELECT policies on the seven public read tables
- Owner SELECT grants on `profiles`, production orders, baselines, baseline
  items, reference images, verified image proofs, M2 receipts and
  `storage.objects`
- Owner EXECUTE on the private caller bridge and
  `public.wos_qa_p2_m2_spec_digest(uuid)`

Phase 2 storage-owner draft creates:

- `wos_m4_proof_owner_storage_read`
- `wos_m4_proof_verifier_storage_read`

Phase 3 activation grants authenticated EXECUTE on the two public RPCs only.
It does not grant the private caller bridge or direct Proof/Receipt table
access.

No table is created or altered. No column is added. No business row is written.
No existing RLS policy is disabled or replaced. No direct proof/receipt table
SELECT is granted. No M2, Legacy or application write permission is added.
The preflight verifies all private-table DML/TRUNCATE/REFERENCES/TRIGGER
privileges, PUBLIC/anon grants, PUBLIC M2 EXECUTE and RLS status for all eight
read targets before creating any object.

Rollback is reverse-owner and access-first. Deactivation removes the two
authenticated EXECUTE grants while policies remain inert. The storage owner then
drops both policies. Final database rollback drops RPCs/helper, owner policies,
grants and the dedicated role. It does not delete order, baseline, image, proof,
receipt or Storage object data.

## Published Draft Fingerprints

These values must be recalculated before any Owner installation authorization.

| Artifact | Raw SHA-256 | Git Blob SHA |
| --- | --- | --- |
| DB Phase 1 | `56b83dbec56fbd299aecdde28602481897cce8013b2c8e979a0a8ef82f3e341a` | `0e12977d8765ad02884803e9d9ff828c2299f3cf` |
| Storage Owner Phase 2 | `b0c29f91594c3328a3fc61e9ef841e0fa64df610e06e25625e7cdfa541fb9d8f` | `b9ef4ecc7766d50b9bc1bf572d8900ffb806d3c3` |
| Activation Phase 3 | `c7672c4f83b435dfca3d6eae367080346db46369993e1bc9e9592192e680aeb2` | `f2daaa0ba945d59ec5a3d42be4e5740a529d13db` |
| Deactivate Rollback 1 | `f5ee9e622909138b017761e7a97d0d9722e58162d42e403f9f8ac774afc26715` | `b8bba5ffef0f6e28e8c5176b4ccb6357eabd2132` |
| Storage Owner Rollback 2 | `0e8f06398380ef655e4106c1b97b5cc9d72d09d16d6a33ff01e46593953a0899` | `536ff6f4f63665ea1504ab3fac733d28eae481aa` |
| DB Rollback 3 | `40b0bdc40d20d823cbea4fbab6e1540c2fcca77ac8714efc3c9d31fb2fc03d47` | `bf061122b16ed3915623b05f51bfbf0826d016d7` |

PG17 installed-state fingerprints:

| Item | SHA-256 |
| --- | --- |
| Snapshot function definition | `6bed433d79370f50b48be3e12c108c202343f31868c0d4eb0aa36e9eab1443f0` |
| Storage guard function definition | `c547983e9c34f03d73bad40c6c53d96b528feaf0f10e8bff324da332c30d7589` |
| Private caller bridge definition | `c4bffcc159132f8018d22dcdfbf48b45421f92483b998db8e8a93ca2a689c887` |
| Combined function ACL/config/owner-role/policy inventory | `5357075c96c1c3880ceb3bf203e499087bf4444de278e77071474863336f0cee` |

## PostgreSQL 17 Offline Evidence

The suite runs only in a disposable `postgres:17-alpine` container with
network mode `none` and explicit disposable labels. It removes every temporary
database and owner role before exit.

Covered and passing:

- old single-executor path fails to create a policy on `storage.objects`, fails
  to transfer function ownership without temporary SET membership, and leaves
  `auth.uid()` ACL unchanged despite a no-op GRANT attempt
- synthetic non-superuser `CREATEROLE` installer with separate Storage and Auth
  owners, proving PostgreSQL mechanics but not a hosted executor
- temporary SET membership cleanup to
  `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE`
- Phase 2 Storage-owner policy creation leaves authenticated EXECUTE closed
- Phase 3 activation is the first point that opens authenticated RPC access
- deactivation closes access before Storage policy rollback
- Office and Operator positive snapshots and Storage-path reads
- Viewer, anonymous and cross-organization denial
- same-organization Sales non-owner denial for both RPC and Storage guard
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
- No project-specific, auditable Supabase-supported executor for the exact
  Storage owner phase has been demonstrated. The normal QA `postgres` login
  cannot run it, and a synthetic PG17 login is not hosted evidence. This is a
  hard blocker, not a PASS.
- Any SQL installation requires a new Owner authorization bound to all phase
  files, their raw SHA-256/Git blobs, PG17 logs, function fingerprints and
  exact QA project.

Next gate:
`DEMONSTRATE_SUPABASE_STORAGE_OWNER_EXECUTOR_BEFORE_SQL_INSTALL_AUTHORIZATION`.

## Independent Review

Final independent review:

`SOURCE_REVIEW=SOURCE_PASS`

The reviewer confirmed the current evidence/results and all six phase hashes,
activation definition pinning, auth-schema preflight, intra-call expiry
decision, catalog restoration checks, dedicated read flag, Sales scope and
expired-Proof behavior. No remaining non-P0 source or security finding was
reported.

The hosted Storage-owner executor remains `BLOCKED_P0`. PR #275 is
source-ready with verified synthetic PostgreSQL 17 mechanics, but it is not
installation-ready.
