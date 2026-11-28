# WOS V1 Production M2 Release Readiness

Date: 2026-11-28

Base master:
`2b723216c90173d16a486e7553083194ab0b246d`

Status:
`M2_SOURCE_AND_LOCAL_PG17_READY / REMOTE_INSTALL_NOT_AUTHORIZED`

## Scope

The complete Production M2 contract is already implemented in source. This
readiness pass verifies the contract against PostgreSQL 17 without connecting
to a cloud database or modifying the live Production M2 state.

Live Production currently has:

```ini
PLAN_A_ORDER_LIFECYCLE=ACTIVE
WOS_V1_M2_ACTION=ABSENT
WOS_V1_AUTHORIZE_PRODUCTION_START=ABSENT
M2_AUTHENTICATED_EXECUTE=NONE
```

## Verified Contracts

```ini
PRODUCTION_M2_PG17=PASS
INSTALLED_INACTIVE_EXECUTE_REVOKED=PASS
ACTIVATION_GRANTS_TWO_RPCS_ONLY=PASS
DEACTIVATION_RETAINS_DATA=PASS
DATA_RETAINING_ROLLBACK=PASS
FOUR_CATEGORY_MATERIALS=PASS
DISTINCT_OFFICE_WORKSHOP_SIGNERS=PASS
INDEPENDENT_FINAL_READINESS_ACTOR=PASS
MANUAL_START_RELEASE=PASS
READY_TO_START_CAN_START_FALSE=PASS
PRODUCTION_STARTED_FALSE=PASS
CONCURRENT_WORKSHOP_CAS=PASS
PROOF_RENEWAL_10_MINUTES=PASS
PROOF_RENEWAL_24_HOURS=PASS
PROOF_RENEWAL_PRESERVES_SIGNOFFS=PASS
PROOF_CONTENT_CHANGE_INVALIDATES=PASS
TYPECHECK=PASS
WOS_FULL_SUITE=PASS
NEXT_BUILD=PASS
```

## Exact M2 Inputs

```text
80a35f0e8d88b18b5678e95a120bb84d0129afbf00abd73ac9ed938e27fbf474  supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql
af1ae9561a32eca6df3b904de5f2973c8f4f47bf4fc936e4035c4b311afb665c  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ACTIVATION_NOT_AUTHORIZED.sql
c2e89381a321409fa78fa7d64edef8b8d0be4a48e843d42d20852adb7ad95e7e  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_DEACTIVATE_NOT_AUTHORIZED.sql
3fe20518e8f5a3c97b4ee04ba93d2eb9aa44ac24619e61f52d06c0504c3eb4fb  docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_ROLLBACK_NOT_AUTHORIZED.sql
ca59064684f29f0623e73346737cc039049b4cf7f5d9bdf13326e045101f712e  docs/workshop-order-system/production-readiness/sql/V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql
623f377e2d06f502b83223e8288a14982958b30fc5f9d650bd743d69ef691add  supabase/functions/wos-v1-verify-image/index.ts
8913cfcb8171509098fd172971e497914b38c30a2093de8c40539c1aa352a0a6  supabase/functions/wos-v1-verify-image/core.ts
```

## Production Activation Sequence

Remote execution remains blocked until a new exact Owner authorization.

1. Confirm a separate active Operator Profile in the Production organization.
2. Capture a fresh Production backup/PITR decision and schema signature.
3. Install the M2 migration only, leaving both RPCs without authenticated
   EXECUTE.
4. Verify the inactive ACL and unchanged Plan A behavior.
5. Apply the M2 activation SQL for one bounded UAT window.
6. Execute the positive three-role flow and the negative security matrix.
7. Deactivate both M2 RPCs immediately after the window.
8. Retain material, Baseline, signoff, release, proof and audit rows.
9. Re-run Plan A and M2 closed-state checks.

Production Edge `wos-v1-verify-image` is already `verify_jwt=true`. M2 route
requests currently fail closed with `WOS_V1_M2_RPC_NOT_INSTALLED`.

## Remaining External Gates

- Owner supplies a real employee mailbox and authorizes Operator invitation.
- Owner grants one bounded Production M2 UAT window.
- Independent business acceptance covers Office, Workshop, and Manager roles.
- The release decision records the daily physical backup restore point because
  PITR is not enabled.
- PR/deployment preparation is complete; no M2 Production SQL is installed by
  this document.
