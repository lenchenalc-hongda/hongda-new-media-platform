# WOS P2 | QA-only installation & fail-closed rollback runbook

**Status:** REVIEW MATERIAL ONLY. No SQL has been installed. No rollout or production permission is implied.

## Immutable scope
- Business PR: [#241](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/241), **exact HEAD** `d75a39f7bfea212edcb2fd9ba5645f83d7aff184`, Draft stacked on unmerged #238.
- Install source: `docs/workshop-order-system/nonproduction-only/wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql` at this exact SHA only.
- Authorized target *if subsequently approved*: Supabase QA project **`xulmpqaknlwqqculbsek` (hongda-review-dev)**.
- **Never target:** `amqpvxrurenevniilhtl` (Production). Never run against production, clone real orders, or copy real credentials.
- Independent GitHub-hosted reviewer branch: `audit/wos-p2-pr241-exact-20261117`, forked from the reviewed **master baseline** `b4edd93bb16f7a651ca37864a51a158727fd23f2`.
- PR #241, #238 and this audit branch MUST NOT merge to master under this instruction.

## Why two separate approvals are mandatory
1. **Installation approval** (not yet granted): after exact-SHA independent audit PASS, owner may authorize QA-only DDL/function/EXECUTE install. The proposed SQL creates an authenticated-callable SECURITY DEFINER function. It has internal identity and org controls, but its installation itself is a privilege surface change. A successful synthetic PostgreSQL test alone is not approval.
2. **Activation approval** (not yet granted): after installed-but-OFF checks, owner may separately authorize one narrow test window for **DB execution gate** plus Preview-only `WOS_P2_QA_MUTATIONS_ENABLED` and `NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED`. The DB gate is installed OFF by default and must be enabled by a privileged DBA only for the approved window. Merely setting client or server flags must not enable the DB gate.

## Before installation: stop if any check fails
- Re-fetch #241 HEAD, base and Draft/merged status; if its HEAD differs from `d75a39f7bfea212edcb2fd9ba5645f83d7aff184`, discard this audit and require new independent review.
- Obtain a **separate** independent GitHub-hosted audit PASS bound to this HEAD, with immutable Run ID, plus owner approval naming the exact QA project and SQL file.
- Confirm the SQL file is not in `supabase/migrations`. No unreviewed repo code may access QA passwords.
- In the Supabase connector/dashboard **explicitly select project ID `xulmpqaknlwqqculbsek`**; `current_database()` is NOT adequate proof of project identity.
- Read-only preflight: verify existing QA `wos_production_orders`, `wos_submission_receipts`, `wos_workshop_inbox`, `profiles`, `wos_status_history`, `wos_resource_readiness`, `wos_blockers`, `wos_confirmations`, `wos_visual_baselines`, `wos_visual_baseline_items`, `wos_reference_images`, their constraints, and the authenticated RLS contract. Confirm no existing P2 function or P2 ledger/gate name collision. If a P2 object already exists, **do not overwrite**—inspect and separately approve corrective reconciliation.
- Record read-only table counts, grants, RLS, `pg_get_functiondef` (if applicable), and timestamp to compare before/after. Prepare a backup/restore method within existing QA entitlements; this instruction does NOT approve a paid branch or deletions.
- Verify all `wos_production_orders` in the chosen synthetic test scope use `QA-%` and have a linked *immutable* P1 receipt and Inbox, and the target Operator/Office accounts are test identities with correct organization membership.
- Confirm workflow_status check allows `WORKSHOP_REVIEW`, `NEEDS_INFORMATION`, `WAITING_MATERIAL`, `READINESS_CHECK`; confirm `wos_resource_readiness` uniqueness and exact image category values. Current QA's 81 images are `PRODUCT` only; there are NO `FILM_PATTERN`, `SIGNED_SAMPLE`, material readiness or signed visual baselines. **Do not claim full readiness/start**.

## Install (FUTURE ONLY, after separate exact QA approval)
1. Connect ONLY to `xulmpqaknlwqqculbsek` via the approved restricted database client. Use no Production connection strings or secrets.
2. Review the immutable source file at the audited SHA and execute it **once**, atomically `BEGIN; ... COMMIT;`. Do not edit already executed migration history or apply synthetic-test fixtures. The SQL creates `wos_qa_p2_execution_gate` and `wos_qa_p2_action_receipts`, enables RLS and revokes all grants on both from PUBLIC/anon/authenticated.
3. Verify `wos_qa_p2_execution_gate` contains exactly one `OPERATOR_WRITES` row, **`enabled=false`**, `approval_reference='NOT_AUTHORIZED'` and `enabled_until IS NULL`.
4. Verify the function signature exactly matches `wos_qa_p2_operator_action(uuid,integer,uuid,text,text,text,integer,integer,text)`, with `SECURITY DEFINER`, fixed empty search path, PUBLIC/anon denied EXECUTE, authenticated EXECUTE only for this named RPC. No direct UPDATE/INSERT grants on WOS tables to the browser role.
5. Check Supabase security advisors. `RLS enabled/no policy` for intentionally private gate/ledger tables is not an excuse to introduce permissive policies.
6. With Preview mutation flags still **false** and DB gate OFF, verify the API returns fail-closed and a test role invoking the RPC directly receives authorization-denied. No business order is modified. Compare QA counts from before install. Record actual SQL transcript, function metadata and test timestamp.
7. If any check fails: perform the prepared **fail-close** rollback below, preserve evidence, and stop.

## Activate (FUTURE ONLY, separate owner authorization)
- Owner names specific QA test users, permitted actions, synthetic order range, authorized reviewer evidence, maximum expiry and Preview branch.
- Privileged DBA enables ONLY the DB gate with `enabled_until` no later than the approved expiry (recommended **15 minutes**, never more than 24 hours), sets explicit unique `approval_reference`. No password in the SQL log.
- Only after DB gate readback may scoped Preview configuration activate `WOS_P2_QA_MUTATIONS_ENABLED=true` server-side plus `NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED=true` for the scoped preview, strictly against `https://xulmpqaknlwqqculbsek.supabase.co`. Do not set these on Production or unrestricted projects. This step may create a new Preview deployment; it requires separate release review.
- Execute true Office/Operator/Admin/Viewer/cross-org QA E2E: ACCEPT and immutable receipt, RETURN_FOR_INFORMATION with reason and Office readback, four material entries with real PNG/private image proof, exact version conflicts, same-request replay, lost-response recovery, forbidden actor and forbidden org denial, missing FILM_PATTERN/SIGNED_SAMPLE blocking, and no-start transitions. Write evidence before concluding PASS.
- At finish (including failure or expiry), turn preview flags OFF, execute **fail-close** SQL, verify gate OFF and EXECUTE revoked; do not delete previously stored receipts, history or QA orders.

## Emergency fail-closed rollback SQL (prepared, NOT executed)
See `audits/wos-p2-pr241/qa-p2-fail-close-only.sql`. Must be run *only* on the separately approved QA project by privileged DBA. It disables gate and REVOKEs EXECUTE; it does **not** delete data, drop existing WOS tables, reset version/history, or change Production. Keep the gate and ledger for incident forensics.

### Verification after a rollback
- `gate.enabled=false`, `gate.enabled_until IS NULL`.
- Authenticated and anon `has_function_privilege(...,'EXECUTE') = false`.
- No new P2 receipt/history increments from replay after revocation.
- P1 81 submitted receipts and 81 Inbox tasks remain unchanged (actual live baseline must be freshly read).
- Never claim that revoking is a substitute for a backup or reverses already committed business records.

**Next authorization text:** “批准仅在 QA 项目 `xulmpqaknlwqqculbsek` 安装经独立审计的 WOS P2 SQL（明确精确 PR #241 HEAD 与 SQL SHA）；安装后 DB 执行门槛保持 OFF、Preview flags 保持 OFF；允许只读和拒绝路径验收，不批准任何 P2 业务写入。正式项目 `amqpvxrurenevniilhtl` 不得更改。”
