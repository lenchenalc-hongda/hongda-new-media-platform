# WOS V1 Production Business Contract Audit

Date: 2026-11-26

Base:
`a0b25a77bf627093ad6d9c8feec7134e4bf8d266`

Status:
`SOURCE_GAPS_IDENTIFIED_AND_NONPRODUCTION_FIX_IMPLEMENTED`

## Scope

This audit compares:

- Production foundation and runtime SQL;
- the QA M2 implementation exercised by RC05 Hosted QA;
- the PR #281 HTTP/API and UI paths;
- the new production-neutral M2 migration and workbench on this branch.

No Production migration, deployment, PR merge or automatic start was
performed.

## P0 Contract Matrix

| Contract | Existing Production | RC05 QA-only | Result |
| --- | --- | --- | --- |
| Four material categories and gap management | Table and read UI existed, no production writer | Full M2 writer | Gap fixed in source |
| Unique CURRENT Baseline | Table, uniqueness index and read path existed; V2 resubmit could create CURRENT | Full select/sign path | Gap fixed in source |
| Office + Workshop independent signoff | Columns and read indicators existed; no production writer | Full dual-sign transaction | Gap fixed in source |
| V2 four-image Proof enforcement | Present in production resubmit and image-set assertion | Hosted PASS | Already present |
| Old image/Proof/signoff rejection | Read-only Edge rejects old/expired Proof; V2 resubmit supersedes images/baseline | Full QA rejection path | Production M2 invalidation added |
| Human release after all prerequisites | Status model contained `READY_TO_START`; no writer | Final readiness stopped at `READINESS_CHECK` | Separate production start-release RPC added |

## Findings

### P0-1 Material Readiness Was QA-only

`public.wos_resource_readiness` existed in the Production foundation and the
Workshop UI could read it. However the only transactional writer capable of
recording preliminary states, calculating quantity gaps and atomically
finalizing all four material categories was
`public.wos_qa_p2_m2_action(...)`.

That function is intentionally QA-only:

- it requires `QA-NONPROD-*` orders;
- it requires the QA M2 Gate;
- it writes `wos_qa_p2_m2_receipts`;
- the HTTP route invokes `wos_qa_p2_m2_action`;
- the route is Preview/QA-only.

Production therefore had no actionable material-readiness contract.

### P0-2 Initial/Selected CURRENT Baseline Had No Production Writer

The Production foundation has:

- one CURRENT baseline uniqueness index;
- baseline item tables;
- read-only baseline queries;
- a V2 resubmit path that supersedes an old baseline and creates a new one.

It did not have a production RPC to select the current image IDs as a DRAFT
baseline, sign it as CURRENT, or bind material readiness to that exact proof
set. The production Office and Workshop pages only displayed the result.

### P0-3 Office/Workshop Dual Signoff Was QA-only

`wos_visual_baselines` already had Office and Workshop profile/timestamp
columns. RC05 proved distinct-actor proof-set signing, but the production RPC
layer exposed none of those writes. The UI explicitly remained read-only.

### P0-4 Signoff Invalidation Was Incomplete in Production

Production V2 resubmit superseded old images and baselines, and Edge rejected
old/expired Proofs. It did not invalidate production signatures when:

- a current-version READY image changed;
- a Proof's object identity, SHA or validity window changed.

The new production M2 migration adds triggers for both paths.

### P0-5 Manual Release Did Not Exist

The workflow allowed `READINESS_CHECK` and `READY_TO_START`, but no RPC moved an
order from final readiness to manual release. A UI-only button would have
allowed direct-table bypass and would not constitute a production contract.

## Implemented Production-neutral Contract

Migration:
`supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql`

It provides:

- `public.wos_v1_m2_action(uuid,integer,uuid,text,jsonb)`;
- `public.wos_v1_authorize_production_start(uuid,integer,uuid,uuid,text)`;
- `public.wos_v1_m2_receipts`;
- `public.wos_v1_start_releases`;
- immutable Office/Workshop proof-set digest and post-version columns;
- one CURRENT baseline per organization/entity;
- current-version four-category Proof-set verification;
- distinct Office/Workshop signer enforcement;
- final readiness only by an actor distinct from the Office signer;
- material gap and insufficient quantity rejection;
- open-blocker rejection;
- exact order-version CAS;
- request-id idempotency;
- image/Proof change invalidation;
- no automatic start.

The release RPC requires a third active admin/manager profile distinct from
both signers. The prior final-readiness receipt must also come from a profile
other than the Office signer. It moves `READINESS_CHECK` to `READY_TO_START`, records a
`START_RELEASE` confirmation, and returns:

```ini
manualStartAuthorized=true
productionStarted=false
canStart=false
```

It does not mutate the order to `IN_PRODUCTION`.

Installation and EXECUTE activation are separate. The migration revokes all
authenticated/public execution. A guarded activation file grants only the two
entry points during a Production launch window, and the matching deactivation
file revokes them without deleting audit rows.

## HTTP And UI

Added:

- `src/app/api/workshop-orders/v1/m2/route.ts`;
- `src/lib/workshop-orders/production-m2-client.ts`;
- `src/components/workshop-orders/ProductionM2Workbench.tsx`;
- production M2 controls in Office and Workshop order details.

The route:

- requires the Production project, Production Vercel environment and
  `WOS_V1_APP_WRITES_ENABLED=true`;
- rejects QA project/runtime and `QA-NONPROD-*` orders;
- verifies Supabase identity, active Profile, organization and role;
- uses only caller JWT and reviewed RPCs;
- never uses `service_role` or direct table writes.

## Verification

```ini
PG17_PRODUCTION_M2_CONTRACT=PASS
FOUR_CATEGORY_PROOF_SET=PASS
OFFICE_SIGNOFF=PASS
WORKSHOP_SIGNOFF=PASS
DISTINCT_SIGNERS=PASS
OPEN_BLOCKER_REJECTION=PASS
INSUFFICIENT_QUANTITY_REJECTION=PASS
FINAL_ATOMIC_FOUR_MATERIALS=PASS
START_RELEASE_THIRD_ACTOR=PASS
START_RELEASE_IDEMPOTENCY=PASS
CONCURRENT_WORKSHOP_CAS=PASS
PRODUCTION_STARTED_FALSE=PASS
CAN_START_FALSE=PASS
TYPECHECK=PASS
WOS_FULL_SUITE=PASS
NEXT_BUILD=PASS
```

## Remaining External Work

- business-person UAT on desktop and workshop mobile devices;
- Production read-only schema/flag/deployment revalidation;
- Production backup-restore rehearsal and launch window;
- Owner GO decision.
