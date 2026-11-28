# WOS V1 Production Release Package

Date: 2026-11-28

Status:
`RELEASE_PACKAGE_READY / PRODUCTION_AND_MERGE_AUTHORIZATION_NOT_GRANTED`

## Current Decision

The Production Proof lifecycle defect is repaired in source and verified in
PG17 plus a real Deno HTTP harness. A single updated QA business UAT remains
required before the complete WOS V1 scope can be called business-ready.

Production and remote QA were not changed in this preparation pass.

## Controlled Release Inputs

The exact source is the final commit from PR #283 after exact-HEAD CI and
independent review. The Owner approval must bind:

- exact PR #281 and PR #283 HEADs;
- exact artifact manifest SHA-256;
- every Foundation, P7, Runtime, Proof, M2 and activation SQL SHA-256;
- the `wos-v1-verify-image` source closure;
- the Production project and current read-only schema signature;
- the application deployment SHA and all feature flags;
- one backup/PITR recovery point and its timestamp;
- named migration, verification, rollback, and recovery owners.

## Plan A: Office And Workshop Order Pilot

Scope:

- Office creates an order, selects CPC customer/project, submits six fields,
  uploads the initial four PNG images, and resubmits after a Workshop return.
- Workshop sees the order, accepts it, returns a reason, and reviews the Office
  correction.
- M2 material, Baseline, signoff, and Manager release remain OFF.

Required database sequence:

1. Foundation and containment in one transaction.
2. Production-compatible P7 schema, Storage bucket, Storage RLS, service Proof
   writer, and cleanup lease controls.
3. Production Runtime Forward.
4. Proof renewal helper.
5. Runtime smoke, ACL verification, and schema fingerprint verification.
6. Activate only the reviewed order lifecycle RPCs needed by Plan A.

Required application controls:

- `NEXT_PUBLIC_FEATURE_WORKSHOP_ORDERS=true`;
- M2 and release write switches `false`;
- Production M2 RPCs remain without `authenticated EXECUTE`;
- no automatic machine start;
- rollback is RPC deactivation plus feature switch OFF when business rows exist.

Plan A is the earliest internal pilot scope. It does not claim full WOS V1
material readiness or Manager release readiness.

## Plan B: Complete WOS V1

Scope adds:

- four material classes and quantities;
- one CURRENT four-image Baseline;
- Office and Workshop same-version signatures by distinct Profiles;
- atomic final readiness;
- independent Manager `START_RELEASE`;
- `READY_TO_START`, `productionStarted=false`, `canStart=false`;
- image replacement and Proof drift invalidation;
- Operator Storage and Office readonly four-image verification.

Required order after the Plan A migrations:

1. Production M2 migration in installed-inactive state.
2. Runtime Security inactive/active signature verification.
3. M2 RPC activation as a separate privileged step.
4. Exact Edge deployment with JWT required and writes still OFF.
5. Feature/write flags ON only inside the approved pilot window.
6. Immediate positive and negative UAT evidence capture.
7. Flags OFF, RPC deactivation, Edge writes OFF, and data-retaining recovery.

## Production Preflight

Before the migration window, capture read-only evidence for:

- current Production Git and application deployment SHA;
- exact 383-row application schema signature;
- `public` table, function, trigger, policy, and ACL manifests;
- absence of WOS tables, functions, `wos-private`, and WOS Storage objects;
- Storage bucket inventory and current RLS policies;
- Production Storage objects and bucket inventory counts;
- feature flags and write switches, all OFF;
- requested migration list with no concurrent WOS migration;
- PITR availability and backup restore checkpoint;
- abort owner, rollback owner, maintenance window, and communication channel.

Any signature drift from the approved manifest requires a reviewed delta before
continuing.

## Rollback And Incident Rules

1. Set all application write switches OFF.
2. Deactivate browser-facing RPCs.
3. Keep the exact Edge deployment available but writes disabled.
4. If no WOS business rows exist, apply the reviewed runtime and P7 rollback in
   reverse order.
5. If business rows exist, retain them and use forward-fix/deactivation rather
   than destructive table deletion.
6. Restore the captured application schema signature and compare all protected
   commercial and customer data fingerprints.
7. Record every SQL, RPC, Storage, Edge, and feature-flag state transition.

The PG17 rehearsal proves that a runtime rollback refuses to delete populated
receipt/revision history and requires an explicit data-retention decision.

## PR Integration

- PR #281 is an ancestor of PR #283.
- Both PRs remain Draft and unmerged.
- GitHub reports both branches `MERGEABLE` and `CLEAN`.
- The protected merge order is PR #281 first, then PR #283 after exact-HEAD CI
  and independent approval.
- Merging either PR is outside this package's authorization.

## Release Gates

```ini
PRODUCTION_PROOF_LIFECYCLE=PASS
CROSS_DAY_PG17=PASS
FULL_DELIVERY_REHEARSAL=PASS
REMOTE_QA_BUSINESS_UAT=PENDING_ONE_EXACT_OWNER_GATE
PR281_MERGE=NOT_AUTHORIZED
PR283_MERGE=NOT_AUTHORIZED
PRODUCTION_MIGRATION=NOT_AUTHORIZED
PRODUCTION_DEPLOYMENT=NOT_AUTHORIZED
CAN_START=false
```

After the one remaining QA business UAT passes, the next Owner decision is a
single release bundle covering PR #281 merge, PR #283 merge, Production
read-only preflight confirmation, and the exact Production migration window.
