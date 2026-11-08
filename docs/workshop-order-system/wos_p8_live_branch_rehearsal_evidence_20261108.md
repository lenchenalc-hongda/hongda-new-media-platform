# WOS P8 | Supabase isolated branch rehearsal evidence — 2026-11-08

**Status: staging structural + synthetic SQL-role tests PASS; full Production-schema parity, real branch binary Edge validation, and production rollout remain BLOCKED.**

## Scope and money

- Parent **Production** project: `amqpvxrurenevniilhtl`, ap-southeast-1; **read-only** throughout this rehearsal.
- Owner-approved `with_data=false` branch: `wos-p8-staging-rehearsal-20261108`, ref `fzlqdmxtwajhoidtzchf`, branch ID `276fb802-0b8c-4ce5-9d1b-08c2d67b6b0d`.
- Supabase billed rate at creation: **US$0.01344/hour**. Branch is disposable. Delete the branch after final rollback validation to stop charges; do not leave an idle test environment running.
- No real organization, staff, customer, image or order data was copied. Synthetic auth users, profiles, orders, proofs, and Storage metadata were used only inside `BEGIN ... ROLLBACK`.
- No `master` merge, Production schema/RLS/Auth/Storage mutation, real file deletion, or Production WOS enablement.

## Critical prerequisite/branching finding

Initial automated branch bootstrap returned `MIGRATIONS_FAILED`, with **zero** public tables and zero applied migrations. After one branch-only reset, the branch reported healthy/`FUNCTIONS_DEPLOYED`, yet SQL still showed zero public tables and zero migrations. **Branch health cannot substitute for schema parity.**

At the same time, Production had **67 public tables and 29 migration-history entries**, and no WOS tables or WOS bucket. The first registered CPC migration depends on manually pre-existing organizations/profiles/auth helper functions; the repository's earlier `001_initial_schema.sql` is not present in Production's tracked migration history. This dependency gap is a likely cause, not confirmed against the original Supabase deployment error log. Tracked separately in **Issue #225**.

Because automated 67-table replay failed, this test did **not** establish a full Production-schema clone. We built an explicitly limited, empty **Production-core-derived** prerequisite representing the real observed `organizations`/`profiles` column types, constraints, 5 policies, 7 indexes, and five helper functions. The Production profile role CHECK accepts only `admin`, `manager`, `operator`, `sales`, `viewer`; `workshop` and `technician` must not be assumed valid.

## Real isolated Supabase migration sequence

Migrations were applied ONLY to `fzlqdmxtwajhoidtzchf` and verified after each step:

1. `wos_p8_isolated_production_core_contract_20261108` — rebuild only the empty core prerequisite.
2. `wos_p8_isolated_foundation_10tables_20261108` — **exact** repository `supabase/migrations/20261014102000_workshop_order_system_foundation.sql` from master, GitHub blob `a8075e7f10e7bb0e18c1fed0c07220fee2394d69`.
3. `wos_p8_isolated_p7_candidate_five_tables_20261108` — add 3 transaction tables, server-only verified-image proof, cleanup lease, role restrictions. Source: `nonproduction-only/wos_p8_branch_p7_schema_candidate_20261108.sql`.
4. `wos_p8_isolated_private_storage_guard_20261108` — private `wos-private` bucket and guarded Storage RLS. Source `wos_p8_branch_private_storage_candidate_20261108.sql`.
5. `wos_p8_isolated_transaction_and_trusted_proof_rpc_20261108` — 4 scoped RPCs, adapted from the **fixed SHA** P7 QA source `29f908a0b32b530d551886e3ce4b6a0762f86cdc`, with branch table names and cleanup-lease guard. Source `wos_p8_branch_p7_rpc_candidate_20261108.sql`. These exposed SECURITY DEFINER RPCs still require independent review before Production.
6. `wos_p8_staging_private_storage_restrictive_guard_parity` — narrow restrictive Storage INSERT/SELECT guards to prevent a different module's broad permissive policies from bypassing WOS private path/actor checks. Source `wos_p8_branch_storage_guard_parity_20261108.sql`.

**Actual pre-rollback database snapshot (2026-11-08 15:20 UTC):** 15 WOS tables; 19 table policies; all 15 tables with RLS; six WOS Storage policies; four WOS functions; one private 20 MiB bucket accepting PNG/JPEG/WebP; six recorded staging migrations; **0** test users, profiles, orders, proofs, stored objects or file bytes.

## Actual executed tests

- **Role/Storage transaction rollback:** temporary synthetic office admin, workshop operator, same-org viewer, and foreign-org admin. Correct positives/denials; after `ROLLBACK`, user/order/Storage metadata counts all **zero**.
- **RPC submission:** `wos_register_uploaded_reference_image` rejects directly authenticated calls **without** a privileged proof. Simulated service-side proof then allowed office readiness, atomic submit, one receipt + one workshop Inbox + one audit row, and exact idempotent replay. Operator reads submitted order and private metadata; Viewer/foreign org see zero. All synthetic rows rolled back. Marker: `WOS_P8_REAL_SUPABASE_BRANCH_RPC_RLS_AND_TX_ROLLBACK_PASS`.
- **Cross-module adversarial RLS:** inside a transaction, deliberately granted broad temporary `storage.objects` privileges and created a permissive catch-all policy. Verified WOS reader/viewer, malformed path, update and foreign-org denial while a different test bucket was unaffected. No SQL deletion attempted: Supabase correctly forbids directly deleting `storage.objects` metadata. First adversarial test encountered this Storage safety trigger; test changed to inspect the restrictive delete guard without issuing direct DELETE. Rerun marker: `WOS_P8_STORAGE_PERMISSIVE_OR_BYPASS_DENIED_AND_ROLLBACK_PASS`. Injected policy, synthetic objects, fake users all **0** after rollback.
- Existing exact-P7 CI #42470287840: **5/5 SUCCESS** in disposable GitHub PG17.
- Existing P7 real 10× browser QA CI #42462716165: **SUCCESS** with private binary HTTP reads; natural JWT CI #42467675197: **SUCCESS** after real expiry.
- These previous QA tests **do not** prove positive Auth/Edge/binary upload from the newly created P8 branch. The P8 branch's four RPCs are exercised by SQL claims, not actual signed JWT login.

## Rollback and sign-off

Rollback is by **branch reset / deletion only**, after capturing branch schema counts and keeping this report in GitHub. No SQL DELETE of Storage objects, no changes to the shared QA 77 committed images, and no destructive Production rollback.

After reset, verify the branch returned to **0 public WOS tables/functions, 0 WOS policies/buckets, 0 migration history**, and then delete the disposable branch to stop hourly charges. Recheck Production still has 0 WOS tables/bucket and its original 29 recorded migrations.

**Hard gates still open:** (1) reproduce full Production 67-table schema/migrations in a clean no-data branch (Issue #225); (2) independently reviewed production-compatible migrations and Storage/Edge/cleanup code; (3) actual staging Auth-JWT + private binary Edge tests; (4) 24h orphan retention & separately approved deletion test; (5) operator UX, monitoring/latency, exact-SHA owner Production database and app rollout authorization. WOS #213 and P8 #224 remain unmerged until independently authorized.


## Actual completed rollback and cleanup (2026-11-08 15:22 UTC)

- `reset_branch` on the **isolated** P8 branch was accepted, and a subsequent SQL query confirmed **0 WOS tables / 0 migration-history rows**. However the private `wos-private` Bucket metadata **remained present (1)**, and branch status again became `MIGRATIONS_FAILED`. **Do not count reset alone as full rollback**.
- Called `delete_branch` for **only** branch ID `276fb802-0b8c-4ce5-9d1b-08c2d67b6b0d` and received `success:true`. Immediately verified `list_branches` now contains only the parent `main`; the nonproduction `fzlqdmxtwajhoidtzchf` branch is absent. The disposable project is no longer running; this stops ongoing branch compute billing subject to Supabase's billing rules.
- Post-deletion Production read-only check at 15:22:35Z: **67** public tables, **29** registered migrations, **0** WOS tables, **0** WOS functions, **0** WOS table policies, **0** `wos-private` buckets. No Production DDL or Storage changes.
- Original independent QA read-only check at 15:22:37Z: private `wos-private` bucket intact, **78** Storage objects, **77** registered image references. No QA data or file deletion.
- Status: **all temporary tests and the temporary branch disposed**, but the full 67-table schema-clone gate (Issue #225) remains open. No Production go-live authorized.
