# WOS V1 RC Fix Verification

Local-only evidence for the ChatGPT technical review fixes. No cloud QA or
Production database, RLS, Storage, Gate, deployment, migration, or remote Git
state was changed.

## Root Causes Addressed

- `MATERIAL_RECORD` invalidated both signatures before accepting final material
  states, while `FILM` and `SIGNED_SAMPLE` required those signatures. The final
  four-material operation could therefore never complete as one stable state.
- Legacy P2 `CONFIRM_MATERIAL` could still finalize individual resources after
  M2 introduced canonical proof-set and independent signoff requirements.
- Legacy Gates allowed broad time windows and were not bound to one exact
  order and organization. The old fixed-order guard also conflicted with a
  dynamic synthetic-order QA run.
- QA-R* revision images depended on a local-only policy and could not use the
  reviewed private Storage/proof registration path safely.
- The handoff timeline only trusted the old v7 six-step witness and did not
  require a contiguous request/version chain through the current version.
- Browser same-origin POSTs can omit `Origin`; strict `Origin`-only checks
  denied legitimate UI writes even when `Referer` and `Host` matched exactly.

## Implemented Controls

- Added `FINAL_READINESS_CONFIRM` as one atomic transaction. It revalidates the
  current proof digest, sequential Office/Workshop versions, distinct signers,
  open blockers, and then writes all four final material rows together.
- `MATERIAL_RECORD` rejects final statuses with
  `FINAL_READINESS_CONFIRM_REQUIRED`.
- Legacy P2 final `CONFIRM_MATERIAL` rejects with
  `M2_FINAL_READINESS_REQUIRED` whenever the M2 Action RPC exists.
- All legacy and M2 Gates require exact order, exact organization, and at most
  15 minutes. The unified order-write guard rejects ambiguous or expired Gate
  scopes and non-QA order writes.
- The QA revision-image RPC requires authenticated Office role, same
  organization, current QA-R* order version, private Storage object identity
  and version, trusted unexpired Edge proof, and SHA-256. It supersedes the
  prior READY image of the same category/version inside an order lock.
- `authenticated` has no direct `wos_reference_images` INSERT grant. `anon` has
  no execute grant on revision-image registration.
- READY reference-image changes and verified-proof refreshes acquire the M2
  order advisory lock and invalidate both signatures. A post-final change
  downgrades `READINESS_CHECK` to `WAITING_MATERIAL` and increments the order
  version.
- Handoff evaluation requires a contiguous version/request chain from the six
  lifecycle events through M2 events to the exact current order version.
- Same-origin mutation checks accept `Origin`, or a same-origin `Referer`
  matched against the request `Host` and forwarded protocol. Explicit
  cross-origin values remain denied.

## Local Browser E2E

- Isolated Supabase project: `hongda-wos-supabase-local`
- Synthetic QA order: `8142e402-3632-4e4c-b367-64a5211b2eaf`
- Order number: `QA-NONPROD-0ebb4779-054c-4bdc-8382-8baff7df4880`
- Final version: `11`
- Final version label: `QA-R6`
- Final status: `READINESS_CHECK`
- Office signer: `11111111-1111-4111-8111-111111111111`
- Workshop signer: `33333333-3333-4333-8333-333333333333`
- Operator finalizer: `22222222-2222-4222-8222-222222222222`

The browser performed one continuous order lifecycle:

1. Office draft, four V1 private PNG images, and submission.
2. Operator acceptance.
3. Operator return with a durable reason.
4. Office correction and resubmission as `QA-R5`.
5. Operator review of the persisted correction to `QA-R6`.
6. Office QA-R6 private image upload, Edge proof, registration, baseline select,
   and Office signature.
7. Independent Workshop signature of the same proof digest.
8. One Operator final-readiness transaction for all four materials.
9. Refreshed UI showed all six handoff stages as verified for v11 and displayed
   Office/Workshop signatures, four verified materials, and `canStart=false`.

All four proof rows were valid at the final confirmation timestamp. The minimum
remaining proof lifetime at that instant was `00:07:07.109957`. Proof expiry
after the event does not grant start authority; `READINESS_CHECK` still requires
separate manual release and no automatic production start exists.

## Negative and Concurrency Evidence

- Viewer revision-image RPC: denied.
- Expired trusted proof: denied.
- Tampered Storage object version: denied.
- Wrong revision-image path/category: denied.
- Direct authenticated reference-image INSERT: no grant.
- Anonymous revision-image RPC execute: no grant.
- Legacy final `CONFIRM_MATERIAL` at current v11: `PT409`, with zero legacy
  receipt rows and no order version change.
- Two-session PostgreSQL tests inserted a superseding READY image while Office
  signing, Workshop signing, and final readiness were holding the M2 advisory
  lock. Each insert waited on the real PostgreSQL lock and invalidated the
  signatures after commit.

## Verification Results

```text
FOUR_MATERIALS_VERIFIED=PASS
OFFICE_WORKSHOP_SIGNOFF_CURRENT=PASS
NO_LEGACY_MATERIAL_BYPASS=PASS
ONE_ORDER_DURABLE_E2E=PASS
LATEST_VERSION_HANDOFF_VERIFIED=PASS
CONCURRENT_SUPERSESSION_DENIED=PASS
CAN_START=false
TYPECHECK=PASS
WOS_SUITE=PASS
BUILD=PASS
```

Reproducible local SQL gates:

```bash
WOS_PG_DOCKER_CONTAINER=<disposable-postgres-17> \
  tests/sql/wos-p2-m2-pg17-suite.sh
WOS_PG_DOCKER_CONTAINER=<disposable-postgres-17> \
  tests/sql/wos-p2-gate-scope-pg17-suite.sh
WOS_PG_DOCKER_CONTAINER=<disposable-postgres-17> \
  tests/sql/wos-p2-m2-concurrency-supersession.sh
```

The scripts refuse to infer cloud credentials and only operate on their isolated
database target.

## Safety

```text
REMOTE_PUSH=NO
PR_CREATED=NO
PR_MERGED=NO
CLOUD_QA_SQL_INSTALLED=NO
CLOUD_QA_GATE_ENABLED=NO
SUPABASE_PRODUCTION_CHANGED=NO
VERCEL_DEPLOYMENT=NO
PRODUCTION_DATA_CHANGED=NO
MIGRATION_CREATED=NO
```
