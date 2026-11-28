# WOS V1 Production M2 Release Readiness

Date: 2026-11-28

Base master:
`6f107ce40cf0f921b2f2586ea62ee293f296c10c`

Status:
`PRODUCTION_M2_RELEASE_ACTIVE`

## Scope

The complete Production M2 contract was verified locally and then exercised in
one bounded Production UAT window bound to
`WOS-V1-PRODUCTION-M2-PROD-UAT-001-20261128`.

Live Production currently has:

```ini
PLAN_A_ORDER_LIFECYCLE=ACTIVE
WOS_V1_M2_ACTION=ACTIVE_FOR_AUTHENTICATED
WOS_V1_AUTHORIZE_PRODUCTION_START=ACTIVE_FOR_AUTHENTICATED
ANON_EXECUTE=NONE
DIRECT_M2_TABLE_DML=NONE
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
PRODUCTION_M2_UAT=PASS
PRODUCTION_M2_AUTO_CLOSE=PASS
POST_CLOSE_M2_WRITE_DENIED=PASS
DATA_RETENTION=PASS
PRODUCTION_M2_RELEASE_ACTIVATED=PASS
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

The bounded Production UAT was executed in this exact order:

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

The manual close completed after 235 seconds. The independent scheduled close
completed after 424 seconds, inside the 540-second absolute limit. Both M2 RPCs
now have no `authenticated` EXECUTE privilege. A post-close request returns
`permission denied for function wos_v1_m2_action`.

## Production UAT Result

```ini
ORDER_ID=159544a2-ecae-4fd8-9943-970a4f2c51fe
ORDER_NUMBER=WOS-M2-UAT-20261128-001
FINAL_STATUS=READY_TO_START
FINAL_VERSION_LABEL=V2
FINAL_VERSION=12
OFFICE_PROFILE=ab1be2f9-abaf-4525-81ff-0f4faebe0212
WORKSHOP_PROFILE=bce5fe27-18a9-43d4-8fed-2251f3ab4174
MANAGER_PROFILE=74c0fb9b-fd7b-415c-9f2d-3dd6464adc00
M2_RECEIPTS=4
RESOURCE_READINESS_ROWS=4
START_RELEASES=1
PRODUCTION_STARTED=false
CAN_START=false
```

## Release State

The Owner approved `M2 Production Release Gate`. The two reviewed RPCs were
activated for `authenticated` only on `2026-11-28T14:00:35Z`.

```ini
M2_ACTION_AUTHENTICATED_EXECUTE=true
RELEASE_AUTHENTICATED_EXECUTE=true
ANON_M2_EXECUTE=false
ANON_RELEASE_EXECUTE=false
DIRECT_M2_RECEIPTS_INSERT=false
DIRECT_START_RELEASES_INSERT=false
UAT_ORDER=159544a2-ecae-4fd8-9943-970a4f2c51fe
UAT_ORDER_STATUS=READY_TO_START
```

The operational stop switch is:

```text
docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_M2_DEACTIVATE_NOT_AUTHORIZED.sql
```

Executing that file revokes both RPCs and retains all business, signoff,
release, Proof and audit records. PITR remains disabled; incident recovery is
bound to the latest completed physical backup and forward-fix/deactivation.
