# WOS V1 QA Schema Diff

QA_PROJECT: `xulmpqaknlwqqculbsek` / `hongda-review-dev`
ACCESS_MODE: Supabase CLI Management API, read-only SELECT metadata
QA_WRITES: NONE
QA_SCHEMA_COMPATIBILITY: PARTIAL_COMPATIBLE_WITH_ADDITIVE_INSTALL_REQUIRED

## QA Runtime And Current Data

- PostgreSQL: 17.6
- WOS production orders: 84
- WOS reference images: 82
- Verified image proofs: 27
- Resource readiness rows: 4
- Visual baselines: 0, including 0 CURRENT
- Submission receipts: 82
- P2 action receipts: 9
- `wos-private` bucket: private, 20 MB, JPEG/PNG/WebP
- Legacy Operator Gate: OFF / `NOT_AUTHORIZED`
- Legacy Office Gate: OFF / `NOT_AUTHORIZED`
- M2 Gate table: absent
- M2 Receipt table: absent
- M2 Action function: absent

## Metadata Counts

| Metadata | QA | Disposable Local |
| --- | ---: | ---: |
| WOS/CPC columns | 444 | 293 |
| WOS/CPC/storage policies | 38 | 28 |
| WOS/QA-safety functions | 26 | 11 |

The count difference is expected:

- QA contains the complete Customer Project Center schema and historical QA
  safety/orphan-cleanup functions that are not part of the minimal local seed.
- Local contains the two not-yet-installed M2 tables and three M2 helper/action
  functions plus the local-only revision upload function.

## Required Category Compatibility

QA `wos_reference_images_category_check` already includes all four required
image categories:

- `PRODUCT`
- `FILM_PATTERN`
- `CUSTOMER_APPROVED_SAMPLE`
- `SIGNED_SAMPLE`

The table already has:

- Organization/entity/path uniqueness appropriate for image registration.
- `READY`, `SUPERSEDED`, `QUARANTINED` and related image statuses.
- A verified-proof table with object ID/version/updated time/SHA/expiry.
- A proof-write guard that requires the proof's order to be `DRAFT`.

## Baseline Compatibility

QA already has:

- `wos_visual_baselines`
- `wos_visual_baseline_items`
- A unique CURRENT-baseline index
- 0 existing baseline rows

M2 adds:

- `office_proof_set_digest`
- `office_post_order_version`
- `workshop_proof_set_digest`
- `workshop_post_order_version`
- A second CURRENT-baseline unique index scoped with `organization_id`

Because QA currently has zero baselines, column/index installation has no
existing-row conflict.

## Existing QA Guards

`public.wos_qa_proof_write_guard` is attached to INSERT/UPDATE on
`wos_qa_verified_image_proofs` and requires:

- Matching live Storage object identity/version/time.
- Object owner equal to the authenticated actor.
- Order status `DRAFT`.
- QA synthetic order number prefix.

`wos_qa_safety.p2_single_order_write_guard` is attached to WOS production-order
INSERT/UPDATE/DELETE and restricts legacy gated writes to the fixed order
`953d2204-3e65-4b75-b10e-c6e97f1bbb56` when either legacy Gate is ON.

Compatibility consequence:

- Standard four-image upload before submit is compatible with the DRAFT-only
  proof guard.
- The local revision-image upload path is NOT QA-compatible and must never be
  installed there.
- QA E2E must keep legacy Office/Operator Gates OFF; M2 uses its own per-order
  Gate and does not require the legacy fixed-order guard.

## Existing Tables Outside Local Minimal Schema

QA-only CPC tables:

- `cpc_ai_drafts`
- `cpc_audit_log`
- `cpc_customer_potential_assessments`
- `cpc_customer_workspaces`
- `cpc_external_profile_mappings`
- `cpc_project_events`
- `cpc_project_members`
- `cpc_reports`
- `cpc_work_items`

These tables are not touched by the M2 install.

## Existing QA Functions Relevant To Compatibility

- `wos_qa_proof_write_guard`
- `wos_qa_p2_owner_cas_attest`
- `wos_qa_p2_resume_v6_owner_attest`
- `wos_qa_p2_failclose`
- WOS MVP historical candidate functions
- Orphan-cleanup functions

The install plan is additive and must not drop, replace or regrant these
existing functions.

## Diff Verdict

The base WOS order, image, proof and baseline tables are structurally compatible
with the RC M2 plan. M2 is absent and must be installed as a reviewed additive
delta. Full QA schema compatibility cannot be marked PASS until:

1. The exact M2 SQL digest is applied to QA under separate authorization.
2. Post-install metadata matches the isolated PostgreSQL 17 installation.
3. Existing QA guard behavior is rechecked read-only.

No QA SQL was executed in this RC preparation phase.
