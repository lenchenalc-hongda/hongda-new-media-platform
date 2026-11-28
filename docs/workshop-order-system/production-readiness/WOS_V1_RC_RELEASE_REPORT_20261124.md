# WOS V1 Release Candidate Report

Date: 2026-11-24

Status: `CODE_INTEGRATION_PASS_WITH_BLOCKERS / NOT_PRODUCTION_READY`

## Integrated Sources

The RC branch combines the reviewed application baseline and QA assets without
making the QA fixture writer part of the business runtime:

- PR #277 application routes, Office/Operator UI and production-neutral Edge.
- PR #279 read-only private-image verifier.
- PR #280 QA-only canonical Fixture, Proof and hosted-verification assets.

PR #238 and #241 are substantially superseded by the newer V1 lifecycle. PR
#263 is conceptually superseded as a read-only workbench prototype. PR #268
must not be promoted as-is because its historical proof-set design omitted
immutable Storage object identity and proof expiry.

## Dependency Graph

```text
verified identity + organization
  -> active CPC customer/project + project owner
    -> production order create / draft recovery
      -> four private PNG upload + byte Proof
        -> reference-image registration + Office confirmation
          -> atomic submit + Workshop Inbox
            -> Operator accept/return
              -> Office six-field correction + resubmit
                -> Operator correction review
                  -> WAITING_MATERIAL
                    -> material readiness + CURRENT baseline dual-sign
                      -> separately authorized manual start release
```

The RC implements through correction review. Material recording, CURRENT
baseline dual-signing and manual start release remain blocked.

## RC Source Changes

- Office creation now requires a same-organization CPC customer in
  `active/pending_review` state and an active, non-archived project.
- The server rereads CPC truth, forbids cross-organization or mismatched links,
  and derives customer title, project title and project owner from CPC.
- The production create RPC independently reads the same CPC records and
  overwrites client-supplied snapshot/owner fields.
- Lost-response recovery now recognizes an already persisted non-DRAFT order
  with the exact same payload and stops duplicate creation/uploads.
- Workshop detail now exposes expected/arrived quantities, ETA, actual arrival,
  confirmation time, version and operator note for all four resource types.
- The read-only image verifier now requires each image to be `READY`,
  non-superseded, on the current order version, and linked to the single
  CURRENT baseline before any private bytes are downloaded.

## Capability Status

```ini
IDENTITY_AND_ORGANIZATION=PASS_SOURCE_AND_OFFLINE
CPC_CUSTOMER_PROJECT_BINDING=PASS_SOURCE_AND_PG17
ORDER_CREATE_AND_DRAFT_RECOVERY=PASS_OFFLINE
FOUR_PRIVATE_IMAGE_PROOF=PASS_OFFLINE_AND_QA_HOSTED_EDGE
OFFICE_CONFIRM_AND_SUBMIT=PASS_OFFLINE
OPERATOR_ACCEPT_RETURN=PASS_OFFLINE
OFFICE_SIX_FIELD_CORRECTION=PASS_OFFLINE
OPERATOR_CORRECTION_REVIEW=PASS_OFFLINE
CURRENT_MATERIAL_READINESS=BLOCKED
VISUAL_BASELINE_DUAL_SIGN=BLOCKED
HOSTED_QA_INTEGRATED_E2E=NOT_TESTED
PRODUCTION_ACTIVATION=NOT_AUTHORIZED
CAN_START=false
```

## Verification

```ini
TYPECHECK=PASS
WOS_SUITE=PASS
NEXT_PRODUCTION_BUILD=PASS
SECRET_BUNDLE_AUDIT=PASS
PG17_PRODUCTION_BOOTSTRAP_AND_RUNTIME=PASS
PG17_CPC_PROJECT_OWNER_BINDING=PASS
PG17_OFFICE_OPERATOR_LIFECYCLE=PASS
PG17_TWO_SESSION_CAS=PASS
PG17_QA_REVISION_LOCK_ORDER=PASS
PG17_HOSTED_QA_DEPENDENCIES=PASS
PG17_M2_ATOMIC_DOUBLE_SIGN=PASS
PG17_OLD_P1_P2_REGRESSION=PASS
PG17_CANONICAL_FIXTURE=PASS
PG17_PROOF_GUARD_POSTGREST_ROLE_CONTEXT=PASS
READONLY_VERIFIER_CURRENT_BASELINE_PREFLIGHT=PASS
```

The existing Gate E Hosted evidence proves four real Proofs, byte SHA-256, PNG
CRC, authorization negatives and natural expiry. It does not prove the new RC
Office-to-Operator business write chain because the QA business-write Gate and
Operator test credential are not yet available.

## Blockers

1. QA business writes are hard-disabled in source. A separate order/organization
   scoped database Gate must cover the business RPCs and prevent direct
   PostgREST bypass.
2. A real Operator QA JWT is not stored in the current secure credential set.
   The temporary cross-organization Manager is for rejection tests only.
3. Production has no material-readiness/CURRENT-baseline writer with immutable
   proof-set digest and independent Office/Workshop signoff.
4. Correction creates a new version label while no reviewed path creates and
   verifies a new-version four-image set. Correction completion must stay
   blocked until that contract is designed and tested.
5. Production SQL, bucket and project-neutral Edge are not installed.
6. Production remote Vercel feature-flag values and current deployment SHA were
   not directly readable in this environment. No claim of remote flag audit is
   made.

## Release Decision

```ini
CODE_INTEGRATION=PASS_WITH_BLOCKERS
PR_DEPENDENCY_RECONCILIATION=PASS
TYPECHECK=PASS
WOS_SUITE=PASS
BUILD=PASS
PG17=PASS
POSTGREST_ROLE_TEST=PASS
INDEPENDENT_REVIEW=PASS_WITH_BLOCKERS

OFFICE_CREATE_ORDER=NOT_TESTED_HOSTED
FOUR_PRIVATE_IMAGES=PASS_QA_HOSTED / NOT_TESTED_RC_BUSINESS
OFFICE_SUBMIT=NOT_TESTED_HOSTED
OPERATOR_ACCEPT_RETURN=NOT_TESTED_HOSTED
OFFICE_CORRECTION_RESUBMIT=BLOCKED
OPERATOR_REVIEW=BLOCKED
CURRENT_MATERIAL_READINESS=BLOCKED
VISUAL_BASELINE_SIGNOFF=BLOCKED

HOSTED_QA_INTEGRATED_E2E=NOT_TESTED
PRODUCTION_SCHEMA_COMPATIBILITY=PASS
PRODUCTION_INSTALL_AUTHORIZED=NO
PRODUCTION_DEPLOYED=NO
PRODUCTION_READY=NO
CAN_START=false
```
