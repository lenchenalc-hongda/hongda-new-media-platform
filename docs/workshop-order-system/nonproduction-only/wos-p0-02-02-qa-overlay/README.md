# WOS-PROD-READY-P0-02-02-QA-OVERLAY: current QA compatibility contract

**INSTALLATION IS NOT AUTHORIZED.** This directory is a reviewed-design candidate and no file in it has been applied to hosted QA.

## Source pin
- Parent Draft PR #249: \`5d07b8782bdb60f9bf9e448d89c4b751dc7aac4e\`.
- Parent master: \`7a005119303e852e1041f11bec32e5430286c25e\`.
- Target **only after new Owner authorization**: QA \`xulmpqaknlwqqculbsek\`.
- Production \`amqpvxrurenevniilhtl\` is excluded.

## Current QA proof (read-only, 2026-11-19)
- 84 existing WOS orders, 83 missing customer or project references.
- 82 existing Inbox/first-submission receipt rows; 94 status-history rows; 83 private Storage objects.
- WOS P2 execution gates both OFF; original v7 \`WAITING_MATERIAL / QA-R6\` order unchanged.
- Existing P7 public tables and P7 Storage policies must remain unchanged. Storage \`wos-private\` already private, 20MiB size limit, PNG accepted.
- Existing Storage policy \`wos_p7_private_object_insert\` is PERMISSIVE; \`wos_p7_storage_reader_roles\` is RESTRICTIVE. Combining additional permissive policies with OR **does not tighten** current permissions.
- The QA P2 single-order guard protects all non-sentinel order writes *while either P2 Gate is ON*. Candidate P1 must be disallowed whenever either existing P2 Gate is ON; do not modify that trigger.

## Safest overlay approach
- No whole-table \`NOT NULL\` on \`wos_production_orders.customer_id/project_id\`, no re-create of preexisting public P7 tables.
- Only new private-schema candidate CPC order-binding, current-version Office audit, and content-bound Storage proof tables, plus the additive nullable \`follow_up_batch_plan\` column.
- Reuse the existing P7 private bucket and policies **without adding new permissive policies** or global Storage GRANT/REVOKE. Enforce a stricter proof check in candidate submit RPC rather than weakening P7.
- No old RPC/trigger is replaced or dropped. New candidate RPCs are separate from old P7/P2 names.
- New scoped P1 candidate execution gate is **installed OFF**. No activation SQL, run, or model budget is authorized. Its activation would require new exact Owner approval and new runtime evidence.
- Candidate code in PR249's Preview must remain DEFAULT OFF; existing Web production remains suppressed.

## Required before actual installation
1. Exact Blob SHA for the new install/preflight/postflight/rollback files.
2. No-mutation, GitHub-hosted PostgreSQL17 compatibility simulation preserving synthetic 83 legacy NULL CPC orders and P7 permissions, with a fault-injected rollback.
3. Independent source audit pinned to the final candidate HEAD; separate Reviewer authorization remains required for any substitute to human review.
4. Check latest QA state/fingerprints immediately before approval; if drift, STOP.
5. Time-limited explicit Owner approval for **only** QA \`xulmpqaknlwqqculbsek\`, strictly scoped objects and SHA; Vercel/Edge and Gate activation are separate approvals.

Do not claim a GitHub-hosted synthetic Storage metadata test is a genuine remote Storage API test.