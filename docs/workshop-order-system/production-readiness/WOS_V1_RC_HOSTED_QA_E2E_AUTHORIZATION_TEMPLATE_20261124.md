# WOS V1 RC Hosted QA E2E Authorization Template

Authorization:
`WOS-V1-RC-INTEGRATED-HOSTED-QA-E2E`

Status: `NOT_AUTHORIZED / PREREQUISITES_INCOMPLETE`

This document prepares one future QA write session. It does not authorize
database writes, Gate opening, Preview deployment, image upload, Proof creation
or Production access.

## Fixed Environment

```ini
QA_PROJECT=xulmpqaknlwqqculbsek
ORGANIZATION_ID=0ff53d93-2b9e-48b9-8113-a4768c39cdd2
QA_ORIGIN=https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app

REQUEST_ID=bf7c1338-cd1b-4406-9427-80c10d5be26d
ORDER_ID=4aa6b131-c247-40e2-8340-473e4493369c
ORDER_NUMBER=QA-NONPROD-bf7c1338-cd1b-4406-9427-80c10d5be26d

BASELINE_ID=a5396247-1789-423e-8997-c55724eb53bb

PRODUCT_IMAGE_ID=ee363100-3b41-4c6b-be41-1ff59749c3be
FIXTURE_MANIFEST=docs/workshop-order-system/qa-fixture/rc-e2e-20261124/fixture-manifest.json
PRODUCT_SHA256=e0430395e9e874355fcc3b3f5fd6024da062871b950e9c08ca277a470ac8c779
FILM_PATTERN_SHA256=35e9bc213701c0b8bd3d6408a8b1bc8c3810572ef46f13e14984b215ebfc52b5
CUSTOMER_APPROVED_SAMPLE_SHA256=8233fcb096a91103c0065c9460d5f7d7764cd952dd73d4d42f30116c95f9528c
SIGNED_SAMPLE_SHA256=8770be76b5560d2b42d1ef25d7480a8c9a24800fb5c2254c859aa8208961f01d
FILM_PATTERN_IMAGE_ID=55e84425-01ea-4b32-bfb6-ff72e8e685f9
CUSTOMER_APPROVED_SAMPLE_IMAGE_ID=b977698d-ce41-45f6-b0ae-031d101ac533
SIGNED_SAMPLE_IMAGE_ID=21a9a702-2012-4671-877e-7180f4d7d095
```

The Office Admin/Manager, Viewer and cross-organization Manager JWTs already
exist in Keychain. A dedicated real Operator QA JWT is still missing and must be
created or supplied before this authorization can become executable.

## Missing Execution Prerequisite

Before Owner may authorize the E2E, a separately reviewed QA business-write
Gate must:

- Cover create, image registration, Office confirmation, submit, Operator
  action, correction, resubmit and review RPCs.
- Bind exactly one QA project, organization, order and authorization ID.
- Block direct PostgREST RPC calls outside the same Gate.
- Have a short hard TTL and an independent close mechanism.
- Keep `canStart=false`.
- Reject all other orders and organizations.

The current source intentionally leaves V1 QA writes disabled. Changing only a
Vercel flag is forbidden.

## Required Assets

- The four newly generated, distinct PNG files under
  `docs/workshop-order-system/qa-fixture/rc-e2e-20261124/`.
- Exact SHA-256 values above and PNG chunk CRC verification before upload.
- Canonical `source.png` path for the fixed order/version/category/image ID.
- No reuse of historical Gate C/D/E objects.
- A current Office Window JWT set and a dedicated Operator JWT.

## Proposed Bounded Sequence

1. Capture QA counts, all Gates, target IDs, Edge bundle and PR head.
2. Arm independent Gate/Edge closers and verify they are running.
3. Open only the QA business-write Gate for the fixed order.
4. Use Office JWT to create the single order.
5. Upload and byte-verify the four PNGs.
6. Register images, confirm Office completeness and submit.
7. Close the first Gate immediately.
8. Open a second short Gate for Operator accept/return, Office six-field
   correction/resubmit and Operator review.
9. Prove old version, stale proof, wrong organization, Viewer and anonymous
   denial.
10. Close the Gate after the fourth business transition or first failure.
11. Verify `WAITING_MATERIAL`, current material gaps and `canStart=false`.

## Material / Signoff Boundary

Unless a separately reviewed production-style CURRENT baseline writer and
Office/Workshop dual-sign contract are installed, the session must stop at
read-only material gaps. It must not fabricate green readiness, dual signoff or
start permission.

## Mandatory Final State

```ini
ALL_WRITE_GATES=OFF
EDGE_READONLY_VERIFY_ENABLED=false
EDGE_WRITES_ENABLED=false
ORDER_OWNER_ORGANIZATION_MATCH=PASS
OLD_VERSION_REJECTED=PASS
VIEWER_DENIED=PASS
CROSS_ORG_DENIED=PASS
ANONYMOUS_DENIED=PASS
CAN_START=false
PRODUCTION_UNCHANGED=YES
```

Owner authorization must bind the final PR head, business Gate SQL SHA,
four-image SHA set and exact independent-close mechanism. This template alone
is not execution authority.
