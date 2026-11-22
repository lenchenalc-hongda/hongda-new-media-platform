# WOS V1 RC Round 2 Verification

Local-only verification for the three blocking review fixes. No remote push,
PR merge, cloud QA install, Gate activation, Vercel deployment, Production
database change, RLS change, Storage change, or migration was performed.

## Fixed Blockers

### P0 Revision-image Gate binding

`wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql` now provides one
`wos_qa_revision_gate_allows(order, org, actor_profile)` decision used by:

- private Storage INSERT policy for QA-R*;
- trusted Edge proof INSERT/UPDATE trigger;
- authenticated `wos_register_qa_revision_image` RPC.

The decision requires an active `M2_OFFICE_WRITES` Gate for the exact order and
organization, a non-placeholder approval reference, no more than 15 minutes of
remaining TTL, an active Office profile, the same organization, and sales
ownership where applicable.

Existing DRAFT image/proof paths do not require this QA-R* Gate.

### P1 Lock-order unification

The following paths now acquire the order advisory lock before `FOR UPDATE` or
`FOR SHARE` row locks:

- M2 Action;
- QA revision image registration;
- trusted proof refresh;
- M2 signoff invalidation.

The row-lock order is order first, then selected image/proof/Storage object.
The revision RPC holds the order lock before superseding the prior READY image.

### P1 Vercel Preview environment

`isWosQaRevisionImageUploadEnabled` now requires:

- `VERCEL_ENV=preview`, or explicit local development;
- the enabled server flag;
- the exact approved QA project URL.

`NODE_ENV=production` no longer disables an authorized Vercel QA Preview.
Production, unknown Vercel environments, wrong projects, suffix attacks, and
local production-mode environments remain denied.

## Local Browser E2E

- Isolated Supabase project: `hongda-wos-supabase-local`
- QA order: `2c0ccc05-ea9a-485a-ac20-36cee7996c1a`
- Order number: `QA-NONPROD-9b3bd17c-78a2-4c45-87bc-a780f96606d8`
- Final status/version: `READINESS_CHECK / v11 / QA-R6`
- Office signer: `11111111-1111-4111-8111-111111111111`
- Workshop signer: `33333333-3333-4333-8333-333333333333`
- Final material operator: `22222222-2222-4222-8222-222222222222`

The browser completed Office submission, Operator acceptance, return, Office
correction/resubmission, Operator review, Gate-bound QA-R6 Storage upload and
Edge proof registration, Office signoff, independent Workshop signoff, and the
single atomic final-readiness transaction.

All four proofs were valid at final confirmation, with
`00:06:44.728592` minimum remaining lifetime. All Gates were closed after the
test.

## Negative Evidence

Real local HTTP/Auth/RLS tests:

```text
RPC_GATE_OFF=403 QA_REVISION_GATE_CLOSED
STORAGE_GATE_OFF=400 AccessDenied RLS
EDGE_PROOF_GATE_OFF_WAITING=503 QA_PROOF_WRITE_UNAVAILABLE
RPC_WRONG_ORDER=403 QA_REVISION_GATE_CLOSED
RPC_WRONG_ORG=403 QA_REVISION_GATE_CLOSED
RPC_VIEWER=403 NOT_AUTHORIZED
```

PostgreSQL 17 tests additionally covered expired and over-15-minute Gates,
cross-organization profiles, DRAFT proof writes remaining allowed, supersession,
signature invalidation, and downgrade to `WAITING_MATERIAL`.

Two-session tests used real transactions and advisory-lock observation:

- revision RPC first, M2 Action second;
- M2 Action first, revision RPC second;
- proof refresh first, M2 Action second;
- M2 Action first, proof refresh second.

No `40P01` occurred, no stale CAS was accepted, and no old signature was
restored.

## Results

```text
FOUR_MATERIALS_VERIFIED=PASS
OFFICE_WORKSHOP_SIGNOFF_CURRENT=PASS
NO_LEGACY_MATERIAL_BYPASS=PASS
ONE_ORDER_DURABLE_E2E=PASS
LATEST_VERSION_HANDOFF_VERIFIED=PASS
CONCURRENT_SUPERSESSION_DENIED=PASS
QA_REVISION_GATE_BINDING=PASS
REVISION_M2_LOCK_ORDER=PASS
PROOF_REFRESH_M2_LOCK_ORDER=PASS
QA_PREVIEW_PRODUCTION_MODE=PASS
CAN_START=false
TYPECHECK=PASS
WOS_SUITE=PASS
BUILD=PASS
```

## Safety

```text
REMOTE_PUSH=NO
PR_MERGED=NO
CLOUD_QA_SQL_INSTALLED=NO
CLOUD_QA_GATE_ENABLED=NO
SUPABASE_PRODUCTION_CHANGED=NO
VERCEL_DEPLOYMENT=NO
MIGRATION_CREATED=NO
```
