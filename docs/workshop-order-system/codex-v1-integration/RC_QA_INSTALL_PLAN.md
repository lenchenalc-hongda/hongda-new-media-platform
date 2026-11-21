# WOS V1 QA Install Plan

QA_PROJECT: `xulmpqaknlwqqculbsek`
INSTALL_AUTHORIZED: NO
SQL_EXECUTED_AGAINST_QA: NO
CURRENT_PR: #270
SOURCE_REVIEW_HEAD: `b168044ea95019d620b8aefade1a3afa6665f894`
PR269_STATUS: `CLOSED_UNMERGED_HISTORICAL`
INSTALL_STATUS: `NOT_AUTHORIZED`

## Current SQL Fingerprints

These fingerprints are the only current installation basis. They must be
recomputed from the exact Git tree being reviewed after any SQL edit.

| SQL | Git Blob | SHA-256 |
| --- | --- | --- |
| `WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql` | `8b65b148f5248b2d365f4c28288a12227c17b1d8` | `7dc2e6ead08ebf3fb102d7afd437c1b4a22ffc1028eb1a4cad95ff3b2573157b` |
| `qa_m2_install_rollback.sql` | `b4dcfb3465fee271a3c4f1ef4c217d2fb81bf265` | `2b8cc65be12251c790ced9c7db856e56f2b6a99367ac16c7181acb6298450bb5` |
| `wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql` | `4b08f824c50efcd785f5219b3535d3efd6325bfb` | `a74a4649b089e3e03291cc51f56bfffb3f71817d0047bf586d42ccbf702a10f8` |
| `wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql` | `1ab0f488829a22ad15663ff6946ab5ccb8b4fbf1` | `36ec495d0bb5331420847c591610e54fb9b3a0a858beb5238e3cc420a0d3f886` |

Historical PR #269 fingerprints are not current installation authority.

## Preconditions

All must be true before any QA write:

1. PR #270 exact current HEAD has a valid technical-review outcome under the
   applicable manual integration governance. A COMMENTED self-review is not an
   independent human approval.
2. A distinct authorized independent reviewer approves SQL security.
3. Owner approves exact SQL Git blob + SHA-256 and this plan.
4. QA precheck returns:
   - M2 tables/function absent.
   - CURRENT visual baselines = 0.
   - Legacy Office and Operator Gates OFF.
5. A fresh isolated PostgreSQL 17 installation of the same SQL passes.
6. Rollback script has been verified in another fresh database.
7. No current QA job or synthetic E2E is running.

Read-only precheck:

```bash
supabase db query --linked --workdir <temp-workdir> \
  --file docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_precheck.sql
```

## Installation Order

### Step 1: Record baseline

Record before any write:

- Master SHA, PR #270 current head SHA and all four current SQL digests above.
- Operator/Office Gate values.
- WOS table row counts from `RC_QA_SCHEMA_DIFF.md`.
- Current baseline count.
- Existing M2 object absence.

### Step 2: Apply only M2 additive SQL

Install exactly:

```text
docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql
```

The file is one transaction and must run with `ON_ERROR_STOP=1`.
Verify its Git blob and SHA-256 against the current fingerprint table before
execution.

Do NOT run:

- Local bootstrap migrations.
- `docs/workshop-order-system/codex-v1-integration/local-only/*`
- A whole-table DROP/CREATE of existing WOS tables.
- Any migration that grants direct table write.

### Step 2B: Apply revision-image SQL after M2

Install:

```text
docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql
```

This records the original proof Trigger, function definitions, Storage policy
and ACLs before replacing the proof guard. Verify its Git blob and SHA-256
against the current fingerprint table.

### Step 3: Post-install verification before grant

Run:

```text
rc-sql/qa_m2_postcheck.sql
```

Required:

- Gate/Receipt tables and Action function exist.
- Both M2 Gate rows are OFF.
- RLS is enabled on Gate and Receipt tables.
- Authenticated EXECUTE on M2 Action is still revoked.
- Four new baseline columns exist.
- Existing QA legacy Gates remain OFF.
- Revision-image functions exist, but `authenticated` remains unable to use the
  new image path until its separate activation.
- Exactly one trusted proof guard Trigger exists.

If any item differs, execute the fail-close plan and stop.

### Step 4: Separate EXECUTE grant

Only after independent review and Owner approval of Step 3 output, use a
separate transaction:

```text
rc-sql/qa_m2_grant_after_independent_review_NOT_AUTHORIZED.sql
```

This file is currently labeled NOT AUTHORIZED. It must not run in this phase.

### Step 5: 15-minute synthetic E2E

Use a new synthetic order and exact order/org IDs.

1. Record synthetic order ID and organization ID.
2. Enable both M2 Gate rows for no more than 15 minutes with an approval
   reference tied to the approved run.
3. Keep legacy Office/Operator Gates OFF.
4. Execute the four-account browser plan in `RC_QA_E2E_PLAN.md`.
5. Immediately run `qa_m2_failclose.sql`.
6. Read back both M2 Gate rows and require OFF.
7. Read back order/version/receipt/signature/material/baseline evidence.

## SQL Delta And Data Impact

Additive objects:

- `wos_qa_p2_m2_gate`
- `wos_qa_p2_m2_receipts`
- Four baseline proof/signature columns
- One CURRENT-baseline unique index
- `wos_qa_p2_m2_checked_proof_set`
- `wos_qa_p2_m2_spec_digest`
- `wos_qa_p2_m2_action`

Immediate data mutation:

- Two Gate rows initialized OFF.
- No INSERT/UPDATE/DELETE against existing orders, images, proofs, CPC data or
  baselines in the install transaction.

Existing QA data conflict check:

- CURRENT baselines = 0, so the new unique index has no conflict.
- No M2 tables/function exist, so namespace collision is absent.

## RLS, Storage And Grants

- New Gate/Receipt tables: RLS enabled, no `anon`/`authenticated` table access.
- M2 Action: EXECUTE revoked from PUBLIC/anon/authenticated in the candidate.
- Helper functions: EXECUTE revoked from PUBLIC/anon/authenticated.
- App access to Action requires the separate grant transaction.
- QA already has the private `wos-private` bucket. Revision-image installation
  adds one narrow `wos_qa_revision_object_insert` policy and records any prior
  same-name policy for rollback.
- No service-role secret is to be added to Vercel or browser code.

## Rollback

Correct order is mandatory:

1. Run `wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql`.
2. Run `qa_m2_install_rollback.sql`.

The M2 rollback refuses to run while revision-image functions or Storage policy
are still installed. Neither rollback uses `CASCADE`.

Verified in a second fresh PostgreSQL 17 database:

```text
qa_m2_install_rollback.sql
gate_absent=t
receipts_absent=t
action_absent=t
image_guard_absent=t
image_guard_functions_absent=t
columns_absent=t
post_rollback_image_insert_update=PASS
```

The rollback is only valid when:

- Both M2 Gates are OFF.
- No M2 receipt exists.

It refuses to drop objects after any M2 receipt is written. The revision-image
rollback retains non-empty trusted-proof receipts with RLS and all
application/service-role access closed. After real E2E data exists, the safe
M2 rollback is:

1. Disable both M2 Gates.
2. Revoke authenticated EXECUTE.
3. Keep additive tables/columns and immutable receipts for audit.
4. Roll back code/preview separately.

## Failure Stop Plan

On any install, metadata, policy, RLS, Edge or browser failure:

1. Do not retry with relaxed permissions.
2. Run `qa_m2_failclose.sql`.
3. Read back both Gate rows.
4. Preserve all receipts and audit rows.
5. Record exact failing step, HTTP status and SQLSTATE.
6. Stop until PM/Owner/reviewer decision.

## Current State

QA_INSTALL_PLAN_READY: YES_FOR_REVIEW
QA_ROLLBACK_VERIFIED: LOCAL_PG17_YES
QA_INSTALL_AUTHORIZED: NO
QA_SQL_EXECUTED: NO
QA_GATE_ENABLED: NO
