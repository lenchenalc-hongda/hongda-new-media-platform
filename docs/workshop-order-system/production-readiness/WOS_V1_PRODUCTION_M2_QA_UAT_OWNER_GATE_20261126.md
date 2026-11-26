# WOS V1 Production M2 QA UAT Owner Gate

Status:
`PREPARED_NOT_AUTHORIZED`

Authorization ID:
`WOS-V1-PRODUCTION-M2-QA-UAT-001`

The exact PR #283 head and CI run are bound only after the final source freeze.
The Owner must approve the finalized PR comment that contains those values.

## Fixed Inputs

```ini
QA_PROJECT=xulmpqaknlwqqculbsek
QA_ORGANIZATION=0ff53d93-2b9e-48b9-8113-a4768c39cdd2
QA_PREVIEW_PROJECT=hongda-wos-p00202-qa-preview

REQUEST_ID=ccd975a6-1516-4833-afd1-902077e70ed8
ORDER_NUMBER=QA-NONPROD-ccd975a6-1516-4833-afd1-902077e70ed8
ORDER_ID_BINDING=CREATE_RESPONSE_ORDER_ID
CREATE_PAYLOAD_FINGERPRINT=d9ac15360649430b3787ed24e5d26c7269ba770e22264f03e1c4088d4292ac05

CPC_CUSTOMER_ID=11f47ff8-a4de-4a9a-ae00-1f036c682f6f
CPC_PROJECT_ID=1ad314a0-f44f-49f3-b099-685ff0c2eaab

OFFICE_PROFILE=f8adf44a-f04e-44b4-9c82-8b96508097bb
OFFICE_AUTH_USER=3c0d8866-498a-4e61-a602-28b7a83f75f5
WORKSHOP_PROFILE=6068f9b4-0452-4f1c-9952-b667c1ee470e
WORKSHOP_AUTH_USER=a461ef01-e911-44e4-ae49-9b19a50c3c69
INDEPENDENT_RELEASE_PROFILE=9164ac91-a50c-4023-836c-5c0887b619fb
INDEPENDENT_RELEASE_AUTH_USER=b55ccc94-6352-4cad-8600-fad32955d014
INDEPENDENT_RELEASE_EMAIL=testingadmin@hongda.cn
INDEPENDENT_RELEASE_ORGANIZATION=0ff53d93-2b9e-48b9-8113-a4768c39cdd2
INDEPENDENT_RELEASE_KEYCHAIN=WOS_V1_QA_IDENTITY_INDEPENDENT_MANAGER
VIEWER_PROFILE=a6226d03-bd17-4a1e-a725-3846eeef3f6c
VIEWER_AUTH_USER=7ebfb55d-1595-4417-8d14-3baf81d66aaa
CROSS_ORG_MANAGER_PROFILE=86f9acd7-812f-43a2-9dc7-ab773259c62f
CROSS_ORG_MANAGER_AUTH_USER=967002b1-1adf-4d0b-98e5-00d1b4544291
CROSS_ORG_ID=fbdb0989-ae25-4ba4-92f9-3266cc845977

MAX_NEW_ORDERS=1
MAX_VALID_CREATE_CALLS=1
QA_UAT_GATE_MAX_SECONDS=900
DB_CLOSER_TARGET_SECONDS=480
DB_CLOSE_ABSOLUTE_MAX_SECONDS=540
EDGE_CLOSE_MAX_SECONDS=840
PROOF_VALIDITY_SECONDS=600
PROOF_RENEWAL=FORBIDDEN
REOPEN_CLOSED_GATE=FORBIDDEN
```

The independent-release identity is now bound to the exact Auth User and
Profile above. A real login was observed for that Auth User and the database
Profile was verified as active, role `manager`, in the QA organization. The
display name alone is not identity evidence. Before any write, the refreshed
session must be stored in
`WOS_V1_QA_IDENTITY_INDEPENDENT_MANAGER`, checked for exactly one Keychain
item, and revalidated through `/auth/v1/user` plus the bound Profile row.

The former independent-release Auth User and Profile UUIDs are retired from
all positive test bindings. They may remain only in Git history for audit.

## Preview Flags

The exact QA Preview deployment must have:

```ini
VERCEL_ENV=preview
AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://xulmpqaknlwqqculbsek.supabase.co
NEXT_PUBLIC_WOS_V1_QA_PREVIEW=true
WOS_V1_QA_APP_ENABLED=true
WOS_V1_QA_APP_WRITES_ENABLED=true
WOS_V1_QA_UAT_AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-001
WOS_V1_QA_UAT_M2_ENABLED=true
WOS_V1_QA_UAT_M2_WRITES_ENABLED=true
```

No Production variable may be changed. The page must call
`/api/workshop-orders/v1-qa/m2` only after the server read capability reports
`m2Adapter=qa-uat`.

## Source And SQL

Required reviewed source:

- `src/lib/workshop-orders/production-m2-handler.ts`
- `src/app/api/workshop-orders/v1-qa/m2/route.ts`
- `src/lib/workshop-orders/production-m2-client.ts`
- `src/components/workshop-orders/ProductionM2Workbench.tsx`

Required QA SQL, in order:

1. `supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql`
2. `docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql`
3. Existing reviewed RC02 QA business gate
4. Existing reviewed RC03 QA activation
5. `docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ACTIVATE_NOT_AUTHORIZED.sql`

The finalized PR comment must contain the actual SHA-256 of every SQL file,
loader, Edge verifier, eight PNGs, runner and rollback file.

## Database Gate

Before the M2 stage, open exactly three rows in
`wos_v1_qa_uat.write_gates` after the new order ID is known:

```text
Office Profile     -> BASELINE_SELECT, BASELINE_OFFICE_CONFIRM
Workshop Profile   -> MATERIAL_RECORD, BASELINE_WORKSHOP_CONFIRM,
                      FINAL_READINESS_CONFIRM
Independent Manager
9164ac91-a50c-4023-836c-5c0887b619fb
                   -> START_RELEASE
```

Every row must use the exact authorization ID, QA project, order ID,
organization, active Profile and an expiry no more than 15 minutes away.

`authenticated` may execute only the QA wrappers. Direct execution of:

```text
public.wos_v1_m2_action
public.wos_v1_authorize_production_start
```

must remain `false`.

## Execution Sequence

1. Recompute local file hashes, PR HEAD, CI, QA live fingerprints and Gate OFF.
2. Validate Office, Workshop, Viewer, cross-organization and independent
   Manager JWTs through `/auth/v1/user`.
3. ARM independent database, Edge and business-Gate closers and prove a dry-run
   close path.
4. Install the reviewed QA runtime/reactivation dependencies.
5. Install the production M2 migration and QA wrapper. Verify direct RPC ACL is
   still denied.
6. Deploy only the exact reviewed QA Preview source and verify the hosted bundle
   and environment.
7. Create exactly one order and bind its returned ID to the CREATE receipt and
   payload fingerprint.
8. Complete Office V1 four-PNG Proof and submission.
9. Complete Workshop ACCEPT and RETURN_FOR_INFORMATION.
10. Complete Office six-field V2 correction, four new PNG Proofs, resubmission
    and Workshop review to `WAITING_MATERIAL`.
11. Open the three QA UAT M2 gates and start the DB closer deadline.
12. Record four nonfinal material states, then Office Baseline select/sign,
    Workshop sign, atomic final material readiness and independent release.
13. Verify image replacement and Proof change invalidate both signatures.
14. Execute negative role, organization, version, quantity, old-image,
    old-Proof, replay and Gate-closed tests.
15. Capture desktop and mobile screenshots at 360, 390, 768 and 1280 widths.
16. Close all Gates and Edge switches, revoke wrapper execution and retain all
    business/audit rows.

## Required Positive Result

```ini
HOSTED_OFFICE_V1=PASS
HOSTED_OPERATOR_ACCEPT_RETURN=PASS
HOSTED_OFFICE_V2=PASS
HOSTED_OPERATOR_REVIEW=PASS
HOSTED_M2_FOUR_MATERIALS=PASS
HOSTED_OFFICE_BASELINE_SIGNOFF=PASS
HOSTED_WORKSHOP_SIGNOFF=PASS
HOSTED_INDEPENDENT_RELEASE=PASS
WORKFLOW_STATUS=READY_TO_START
PRODUCTION_STARTED=false
CAN_START=false
```

## Required Negative Result

```ini
DUPLICATE_SIGNER_DENIED=PASS
OFFICE_SIGNER_FINAL_READINESS_DENIED=PASS
INSUFFICIENT_QUANTITY_DENIED=PASS
OLD_VERSION_DENIED=PASS
OLD_IMAGE_DENIED=PASS
OLD_OR_EXPIRED_PROOF_DENIED=PASS
REPLAY_VERIFIED_WITHOUT_DUPLICATE_WRITE=PASS
CONCURRENT_CAS_ONE_WINNER=PASS
CROSS_ORGANIZATION_DENIED=PASS
VIEWER_WRITE_DENIED=PASS
GATE_CLOSED_DENIED=PASS
DIRECT_PRODUCTION_RPC_DENIED=PASS
```

## Close And Recovery

The independent database closer must close all open QA UAT gate rows and run
the QA UAT deactivation/rollback before its 540-second absolute deadline.

Recovery must:

- close the RC02 business Gate and Edge write/read switches;
- revoke both QA wrapper entry points from `authenticated`;
- preserve `wos_v1_qa_uat.write_gates`, M2 receipts, baselines, materials,
  confirmations, images, Proofs, Storage objects and all existing QA history;
- restore the original P7, Foundation and Storage policy fingerprints;
- retain the new QA order and evidence;
- leave `PR281` and `PR283` Draft and unmerged;
- leave Production unchanged.

## Owner Approval Text

The final Owner approval must bind:

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-001
AUTHORIZATION=ONE_BOUNDED_QA_EXECUTION
EXACT_HEAD=<final PR #283 head>
CI_RUN=<final exact-head CI>
SOURCE_MANIFEST_SHA256=<final manifest hash>
PRODUCTION_WRITES=FORBIDDEN
PR_MERGE=FORBIDDEN
CAN_START=false
```

Until that approval is supplied, all remote install, deployment, Gate opening,
order creation and business writes remain `NOT_AUTHORIZED`.
