# WOS V1 QA UAT-016 Technical Review

Status: `READY_FOR_OWNER_REVIEW`

## Scope

- Resume the retained QA order at
  `WAITING_MATERIAL / V2 / version 7`.
- Do not create another order or upload replacement V2 images.
- Refresh the same four V2 Proofs before material readiness.
- Complete four material records, the current image baseline, Office and
  Workshop signoff, atomic readiness, and independent Manager release.
- Save the positive release state, then probe one post-release V2 Proof
  refresh. The hosted path must reject it and retain `READY_TO_START`.
  Actual evidence-change invalidation remains covered by isolated PG17 tests.

## Root Cause From UAT-015

The formal QA M2 wrapper was installed but not activated. The application
activation succeeded, then the first material action failed closed with HTTP
403 because `authenticated` did not have wrapper EXECUTE.

The new combined `activate` command grants both QA wrapper functions first and
then activates the application RPCs. Application activation now rejects a
missing wrapper ACL before any business request can proceed.

## Proof Refresh Correction

The QA Edge updates an existing trusted proof row in place. The formal proof
mirror now listens to `INSERT OR UPDATE`, checks that image, order,
organization, bucket, and path remain unchanged, and refreshes the exact formal
proof fields. The PG17 harness verifies both initial projection and refresh.

## Verification

```text
WOS_V1_QA_PROOF_MIRROR_PG17=PASS
WOS_V1_QA_PROOF_MIRROR_REFRESH=PASS
WOS_V1_QA_V2_IMAGE_REGISTER_PG17=PASS
WOS_V1_PRODUCTION_M2_QA_UAT_PG17=PASS
workshop-order-suite.test.ts=PASS
pnpm exec tsc --noEmit=PASS
pnpm build=PASS
```

## Independent Review

```text
P0=0
P1=0
P2=0
```

No production write, QA Gate opening, order creation, or PR merge is part of
this review.
