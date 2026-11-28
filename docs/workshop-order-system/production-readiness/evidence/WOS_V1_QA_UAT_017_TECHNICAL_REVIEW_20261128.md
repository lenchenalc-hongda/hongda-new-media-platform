# WOS V1 QA UAT-017 Technical Review

Status: `READY_FOR_OWNER_REVIEW`

## Scope

- Continue the retained `WAITING_MATERIAL / V2 / version 7` order.
- Refresh only the same four current V2 Proofs.
- Do not create an order or upload/register/supersede an image.
- Continue four material records, Baseline, dual signoff, readiness and
  independent Manager release.

## Edge Correction

The QA runtime now passes `qaUatCurrentOrderAuthorized` into the access
evaluator. This branch:

- works only on the fixed QA Supabase project;
- accepts only `WAITING_MATERIAL` or `READINESS_CHECK`;
- accepts only `V2+` labels;
- still requires the exact armed QA UAT control, order, organization, actor and
  nonce through `wos_v1_qa_uat_edge_write_allowed`;
- does not change Production or ordinary `QA-R` authorization.

The database Proof function also receives a dedicated QA-only compatibility
layer. The reviewed Edge wrapper sets a transaction-local marker only after its
exact armed-control transaction guard passes. The lower Proof function accepts
`V2+` at `WAITING_MATERIAL` or `READINESS_CHECK` only when that marker is set.
Direct calls without the wrapper remain denied. Install stores the original and
patched definitions; rollback restores the original definition by hash.

## Verification

```text
workshop-order-production-edge-core.test.ts=PASS
wos-v1-qa-uat017-packaging.test.ts=PASS
WOS_V1_QA_UAT017_PG17=PASS
WOS_V1_QA_CURRENT_ORDER_PROOF_PG17=PASS
workshop-order-suite.test.ts=PASS
pnpm exec tsc --noEmit=PASS
pnpm build=PASS
```

UAT-016 remains historical and consumed. UAT-017 requires a fresh Preview
rebind, Execution ID, Nonce, ARM token, SQL release and Owner authorization.
