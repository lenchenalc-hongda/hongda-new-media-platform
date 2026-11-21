# WOS V1 QA Install Plan

QA_PROJECT: `xulmpqaknlwqqculbsek`
INSTALL_AUTHORIZED: NO
SQL_EXECUTED_AGAINST_QA: NO
TARGET_SQL_SHA256:
`3f356f7b12d385b1fff370cad7f064649eb4e90ddb193c79d13fa0f35524e298`
TARGET_SQL_GIT_BLOB:
`f4058b51caccc27805c89a74bfa8d0cd49238b82`

## Preconditions

All must be true before any QA write:

1. PR #269 exact HEAD has a trusted Writer Completion Contract.
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

- Master SHA, PR #269 head SHA and candidate SQL digest.
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

Do NOT run:

- Local bootstrap migrations.
- `docs/workshop-order-system/codex-v1-integration/local-only/*`
- A whole-table DROP/CREATE of existing WOS tables.
- Any migration that grants direct table write.

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
- No Storage bucket/policy change is required; QA already has private
  `wos-private`.
- No service-role secret is to be added to Vercel or browser code.

## Rollback

Verified in a second fresh PostgreSQL 17 database:

```text
qa_m2_install_rollback.sql
gate_absent=t
receipts_absent=t
action_absent=t
columns_absent=t
```

The rollback is only valid when:

- Both M2 Gates are OFF.
- No M2 receipt exists.

It refuses to drop objects after any receipt is written. After real E2E data
exists, the safe rollback is:

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

QA_INSTALL_PLAN_READY: YES
QA_ROLLBACK_VERIFIED: YES
QA_INSTALL_AUTHORIZED: NO
QA_SQL_EXECUTED: NO
QA_GATE_ENABLED: NO
