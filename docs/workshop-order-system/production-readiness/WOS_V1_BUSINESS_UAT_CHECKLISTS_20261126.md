# WOS V1 Business UAT Checklists

Status:
`PENDING_OWNER_QA_WRITE_GATE`

No new QA write is authorized by this checklist. A fresh bounded Owner Gate is
required before execution.

## Office Acceptance

1. Log in as an active Office Admin or owner Sales profile.
2. Confirm the organization, role and Chinese employee-facing labels.
3. Create one synthetic order from an approved CPC customer/project.
4. Upload four current-version PNGs and confirm:
   - categories are clear;
   - replacing a file is obvious;
   - upload progress and failure are visible;
   - the page never shows a successful Proof before the server confirms it.
5. Submit and verify the version/receipt shown to the user.
6. Open a returned order and correct exactly the six approved fields.
7. Upload four new version images and confirm old images cannot be selected.
8. Resubmit and verify the current version changes.
9. At `WAITING_MATERIAL`, select the four current images as Baseline and apply
   Office signoff.
10. Confirm the UI shows Office signed, Workshop unsigned and `canStart=false`.

Failure conditions:

- stale version or stale image displayed as current;
- duplicate image category accepted;
- Office signoff accepted before Proof/Baseline validation;
- missing or misleading error message;
- unsafe button remains enabled after a failed response.

## Workshop Acceptance

1. Log in as an active Operator or Workshop manager.
2. Find the same order and verify organization/version identity.
3. Record missing or partial FILM, FIXTURE, INCOMING_MATERIAL and
   SIGNED_SAMPLE states.
4. Verify quantity gap equals expected minus arrived.
5. Confirm final states cannot be entered through the individual material
   action.
6. Apply Workshop signoff to the same Baseline and Proof-set digest.
7. Using a profile distinct from the Office signer, submit the one atomic final
   readiness transaction with all four arrival times and quantities.
8. Confirm status becomes `READINESS_CHECK` and `canStart=false`.

Failure conditions:

- Workshop can sign a different image set or old order version;
- same Profile can perform both Office and Workshop signoff;
- Office signer can perform final readiness confirmation;
- insufficient quantity is shown as ready;
- open blocker is hidden;
- final readiness reaches `IN_PRODUCTION`.

## Independent Release

1. Log in as an active Admin/Manager distinct from both signers.
2. Verify all four final material states, current Baseline and Proof validity.
3. Apply `START_RELEASE`.
4. Confirm status becomes `READY_TO_START`.
5. Confirm `productionStarted=false` and no machine/production start occurs.

## Mobile And Workshop Device

- screen widths 360, 390, 768 and 1280 CSS pixels;
- one-hand vertical flow for Operators;
- no horizontal scrolling;
- file and quantity inputs usable with touch;
- sticky or repeated order version/category context;
- failed transaction never clears the user's entered values;
- current/old version distinction remains visible without color alone.

## Traceability

Verify:

- request IDs and receipts for all actions;
- Office and Workshop profile IDs differ;
- final readiness profile ID differs from the Office signer;
- release profile ID differs from both;
- image IDs, Proof expiry and Storage identity are unchanged;
- status history and confirmation history are append-only;
- old V1 images and expired Proofs are denied;
- no `service_role` or direct table write is used by the browser/API.

## Recorded UAT Result

```ini
BUSINESS_UAT=PENDING
OWNER_QA_WRITE_GATE=REQUIRED
```
