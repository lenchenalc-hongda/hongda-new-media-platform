# WOS V1 RC Round 3 Verification

Local-only verification for the three minimum review fixes. No remote push,
PR merge, cloud QA install, Gate activation, Vercel deployment, Production
database change, RLS change, Storage change, or migration was performed.

## Fixed Blockers

### Trusted proof update and final-readiness lock order

The restricted `wos_qa_p2_m2_record_trusted_proof` RPC is now the only trusted
proof write entry. It acquires the order advisory lock before locking the
idempotency receipt, order, Storage object, and proof row.

Removing the proof `BEFORE UPDATE` trigger avoids the prior order of taking a
proof row lock before the order advisory lock. The RPC explicitly calls
signoff invalidation inside the same transaction.

### Service-role attribution with `auth.uid() IS NULL`

The trusted proof RPC derives the actor from the verified Edge Auth identity
parameter, resolves the active profile and organization in the database, and
sets a transaction-local actor setting before invalidation.

`wos_qa_p2_m2_invalidate_signoff` accepts only:

- the normal authenticated `auth.uid()`; or
- the transaction-local actor set by the restricted RPC.

Unknown, viewer, cross-organization, and browser-supplied actor identities are
not accepted.

### QA trigger compatibility

The candidate installation backs up the existing real QA guard, removes all
three historical trigger names, and creates exactly one
`wos_qa_trusted_proof_guard`.

The matching rollback restores the captured original guard and removes the new
RPC. Installation, repeated installation, and rollback were verified against a
fixture containing the real QA trigger structure.

## Edge Idempotency

The Edge function derives a deterministic proof request UUID from the verified
order, image, actor, order version, Storage object identity/version/timestamp,
and SHA-256. A network retry with the same immutable payload therefore returns
`REPLAYED` and does not create a second receipt.

Real local Edge retry evidence:

```text
EDGE_FIRST_HTTP=200
EDGE_FIRST_PROOF_STATUS=CREATED
EDGE_SECOND_HTTP=200
EDGE_SECOND_PROOF_STATUS=REPLAYED
EDGE_PROOF_COUNT=1
EDGE_RECEIPT_COUNT=1
EDGE_ACTOR_ATTRIBUTED=true
```

## Local Browser E2E

- Isolated Supabase project: `hongda-wos-supabase-local`
- QA order: `1b2746cb-6b74-4da8-80c6-f4c038369fde`
- Order number: `QA-NONPROD-6c2d5918-f24e-40c0-9a32-23a0a519d58d`
- Final status/version: `READINESS_CHECK / v11 / QA-R6`
- Proof-set baseline: `ddd47039-fe2d-41d7-80c8-d95021da3262`
- Office signer: `11111111-1111-4111-8111-111111111111`
- Workshop signer: `33333333-3333-4333-8333-333333333333`
- Final readiness actor: `33333333-3333-4333-8333-333333333333`

The browser completed:

```text
Office submit
Operator accept
Operator return
Office revision
Office resubmit
Operator review
Four private QA-R6 proof uploads
Office proof-set signoff
Workshop independent proof-set signoff
One atomic final-readiness transaction
```

All four material rows are current for QA-R6. The Office and Workshop
signatures use the same proof-set digest. The final status remains
`READINESS_CHECK`; no production-start action exists or was invoked.

## PostgreSQL 17 Evidence

The following real two-session orderings passed without `40P01`, stale CAS, or
signature resurrection:

```text
FINAL_READINESS_FIRST -> PROOF_REFRESH_SECOND
PROOF_REFRESH_FIRST -> FINAL_READINESS_SECOND
REVISION_IMAGE_FIRST -> M2_ACTION_SECOND
M2_ACTION_FIRST -> REVISION_IMAGE_SECOND
PROOF_REFRESH_FIRST -> M2_ACTION_SECOND
M2_ACTION_FIRST -> PROOF_REFRESH_SECOND
```

Negative checks covered Gate OFF, wrong order, wrong organization, expired and
over-15-minute Gates, viewer actor impersonation, unknown actor impersonation,
cross-organization actor impersonation, direct service-role proof writes,
prior signatures after proof refresh, and stale final readiness.

## Results

```text
FINAL_READINESS_VS_PROOF_REFRESH=PASS
SERVICE_ROLE_NULL_AUTH_UID=PASS
EDGE_TRUSTED_PROOF_IDEMPOTENCY=PASS
NO_DEADLOCK_40P01=PASS
SIGNED_PROOF_INVALIDATION=PASS
QA_TRIGGER_COMPATIBILITY=PASS
ONE_ORDER_DURABLE_E2E=PASS
TYPECHECK=PASS
WOS_SUITE=PASS
BUILD=PASS
CAN_START=false
```

## Safety

```text
REMOTE_PUSH=NO
PR_MERGED=NO
CLOUD_QA_SQL_INSTALLED=NO
CLOUD_QA_GATE_ENABLED=NO
SUPABASE_PRODUCTION_CHANGED=NO
VERCEL_DEPLOYMENT=NO
MIGRATION_CREATED=NO
```
