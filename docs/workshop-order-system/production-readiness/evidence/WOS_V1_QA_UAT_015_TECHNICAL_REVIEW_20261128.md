# WOS V1 QA UAT 015 Technical Review

Status:
`TECHNICAL_REVIEW_PASS / INDEPENDENT_REVIEW_PASS`

```ini
SOURCE_PARENT_HEAD=c0132a49683be7f7186e0b3482fdebf31e79480a
FOCUS=QA_PROOF_MIRROR_AND_V2_IMAGE_SUPERSESSION
P0_FINDINGS=0
P1_FINDINGS=0
P2_FINDINGS=0
```

## Reviewed Controls

- The QA Edge proof remains a QA-only write to
  `public.wos_qa_verified_image_proofs`.
- The mirror trigger runs only for INSERT, only while an exact QA UAT control
  is ARMED with a current Edge nonce and only after
  `wos_v1_qa_uat_edge_write_allowed` accepts actor, organization and order.
- The mirrored formal proof copies object identity, version, update time,
  SHA-256, verified time and expiry without renewal.
- An existing formal proof is accepted only when every identity and timestamp
  field matches; otherwise the insert fails closed.
- The mirror install and rollback both verify the function and trigger source
  before removal.
- V2 registration now supersedes the prior READY image for the same
  organization/order/version/category and records `supersedes_image_id`.
- DRAFT, actor, organization, path, PNG, proof, object-version and cleanup-claim
  checks remain intact.
- UAT-015 retains the same order and uses four new unused V2 image IDs.

## Verification

```ini
WOS_FULL_SUITE=PASS
TYPECHECK=PASS
BUILD=PASS
PG17_V2_IMAGE_REGISTER_SUPERSESSION=PASS
PG17_VERIFIED_PROOF_MIRROR=PASS
PG17_VERIFIED_PROOF_MIRROR_GATE=PASS
PG17_VERIFIED_PROOF_MIRROR_ROLLBACK=PASS
PG17_FULL_M2_QA_UAT=PASS
PG17_CLOSER_ONLY=PASS
PG17_HOSTED_QA_DEPENDENCIES=PASS
GIT_DIFF_CHECK=PASS
```

The independent review is recorded in
`WOS_V1_QA_UAT_015_FINAL_INDEPENDENT_REVIEW_20261128.md`. Final exact-HEAD CI, a
fresh QA Preview with the UAT-015 execution ID/nonce, and explicit Owner
approval remain required.
