# WOS P8 | Real Supabase full-schema rehearsal and disposal (2026-11-09)

**Result: 67/67 Production public-table catalog parity, 15 WOS tables and security-contract smoke PASS on a real disposable Supabase branch. Native branch auto-migration and authenticated real image-byte / JWT positive tests remain BLOCKED. Branch fully deleted.**

## Authorized scope and resources

- Production Supabase `amqpvxrurenevniilhtl`: read-only. No Production DDL, policy, Storage, environment key or release changes.
- User-approved branch: `wos-p8-full-schema-rehearsal-20261109`; branch project `kjrocicepnxvvojcaqok`; branch ID `5bfbc4a2-f9cc-4309-90cb-6bd7f7b0c6ad`; `with_data=false`.
- Quoted compute rate: **US$0.01344/hour**, actual billing per Supabase. Created **2026-11-09 01:16:06 UTC**. Deleted in the same session; verified gone **01:37 UTC**.
- Never copied any real staff, customers, orders, keys, Production rows, or original QA images. All SQL-role-test users/proofs/orders were synthetic and rolled back. One never-used generated credential existed in private test schema, deleted with branch.

## Native branch root failure captured

Initial Supabase branch status briefly said `FUNCTIONS_DEPLOYED`, but read-only SQL revealed **0 public tables, 0 migration records**. Its actual `postgres_logs` then showed **SQLSTATE 42P01** during the *first registered CPC foundation CREATE TABLE*, whose prerequisites `public.organizations` and `public.profiles` were absent. Branch state became **`MIGRATIONS_FAILED`**. This reproduces **Issue #225** and proves that a green service status does not prove schema replay.

**Important:** native Supabase migration history was still empty after this manually staged rehearsal. The automatic branch bootstrap was **not** fixed; no rewrite of Production migration history was attempted.

## Real Supabase schema-only reconstruction

Against only `kjrocicepnxvvojcaqok` and from GitHub verified, pinned SQL blobs, executed:

1. `001_initial_schema.sql` (early shared foundation), July Knowledge/Topics/Scripts field upgrades, legacy July RLS, 2026-08-01 auth-helper forward migration and 2026-08-17 Review Center foundation.
2. First registered CPC Phase 5A source (matched to its applied SQL identity).
3. Sixteen historical untracked Review Center/site_data migrations in the same order as the previously green disposable PG17 rehearsal.
4. Remaining 28/29 Production-registered SQL sources in their **actual registered version order**, not their mismatched GitHub filename timestamps.
5. Guarded **nonproduction-branch-only** convergence `wos_p8_actual_branch_legacy_parity_20261109.sql`: 60 exact legacy-only extra columns removed, 19 obsolete legacy RLS policies removed, three site_data policies renamed, **no CASCADE**. The precondition checked 67 tables, zero users/orgs/records, zero migration history, and exact expected objects.
6. Guarded **nonproduction-branch-only** `wos_p8_actual_branch_preexisting_grants_20261109.sql`: matched two existing Production authenticated SELECT grants (profiles, review_dict_items) and one pre-existing `review_event_actor_directory(uuid,text)` service_role EXECUTE grant. **No grant was added to Production**.

Actual cross-project read-only hash comparison: **67/67** public base-table names; zero drift in column counts/types/null/defaults, index counts/definitions, constraints, RLS policy counts and actual predicates. **32/32 triggers** match; **67/67 explicit table grants** match. **100/100 public functions** exist with matching signatures/security flags/role execution permissions, apart from two `pg_get_functiondef` formatting hashes (`review_submit` and `review_reopen`) already confirmed as **lexical-token-identical** (832/832 and 716/716). Existing two commercial Storage object-policy definitions remained unchanged.

This **does not** certify full Auth/Storage system catalog parity or fully unattended Supabase branch replay.

## WOS Foundation, P7, private Storage and transactional acceptance

Next applied reviewed WOS ten-table Foundation directly on the branch, then the five P7 candidate tables, guarded transaction/proof RPC functions, and private Storage contracts from Draft PR #224:

- **82 total public tables: 67 original + 15 WOS**; 15/15 WOS RLS enabled.
- 19 WOS table policies, 6 WOS Storage object policies, 4 WOS RPCs.
- 1 private `wos-private` Bucket (20MiB; PNG, JPEG, WebP); **0 actual Storage objects uploaded**.
- Actual branch SQL-role transaction acceptance (existing exact-source test): `WOS_P8_REAL_SUPABASE_BRANCH_RPC_RLS_AND_TX_ROLLBACK_PASS`: direct proof-less image registration denied; synthetic proof + office readiness + atomic submit + idempotent replay passed; Operator authorized, same-org Viewer and foreign org denied. All synthetic users/orders/receipt/proof/object metadata rolled back.
- Adversarial cross-module Storage policy test: `WOS_P8_STORAGE_PERMISSIVE_OR_BYPASS_DENIED_AND_ROLLBACK_PASS`. Injected broad catch-all policy could not bypass WOS restrictive rules; unrelated bucket retained access; injected policy and objects rolled back.

No direct SQL Storage-object deletion and no real file deletion.

## Edge smoke and explicit unresolved Auth/image gate

- Deployed **only on the temporary branch**: `wos-p8-ephemeral-jwt-gate`, `verify_jwt=true`, source `docs/.../nonproduction-only/wos_p8_branch_edge_jwt_gate_20261109.ts`. No service key or business data in the function.
- Actual HTTPS calls issued from branch `pg_net` to its own Edge URL and responses checked:
  - No API key/Authorization → **401** (`UNAUTHORIZED_NO_AUTH_HEADER`).
  - Invalid Bearer JWT → **401** (`UNAUTHORIZED_INVALID_JWT_FORMAT`).
  - Public publishable API key only → **200** with the nonproduction smoke response.
- **The 200 is NOT an authenticated employee-user JWT positive test.** Gateway `verify_jwt=true` alone must not be confused with verified user identity. Future sensitive Edge functions must explicitly validate an actual user JWT and the correct organization/role, never trust an API publishable key as user authorization.
- An attempted synthetic Auth sign-up via branch-side outbound HTTP was **blocked by tool safety checks**; no workaround or bypass was attempted. No real Auth login, real PNG/JPEG upload/download, trusted Edge SHA-256 proof write, or signed-user byte-for-byte Storage round trip was completed. These remain hard release gates.
- Branch security advisor also surfaced potential authenticated `SECURITY DEFINER` execution risks for independent review; no blanket permission expansion was made.

## Verified resource rollback and original-system integrity

- Full branch deletion: `delete_branch(id=5bfbc4a2-f9cc-4309-90cb-6bd7f7b0c6ad)` → `success:true`. `list_branches` then showed **main only**, so the branch's WOS tables, test Edge function, Bucket and private QA fixture were disposed, including anything not removed by SQL reset.
- Production read-only verification at **2026-11-09 01:37:00 UTC**: **67 public tables, 29 migrations, 0 WOS tables, 0 WOS functions, 0 WOS buckets**.
- Original independent QA `xulmpqaknlwqqculbsek` at **01:37:02 UTC**: private WOS bucket intact, **78 objects / 77 registered references**, unchanged. No original QA object deletion.
- PR #224 and #226 remain Draft/unmerged; WOS Production not enabled.

## Next tasks and review gates

1. Resolve **native** Supabase branch auto-replay missing historical prerequisites without rewriting existing Production migrations. The manual workaround demonstrates a deterministic target, **not an unattended fix**.
2. Prepare a scoped, separately authorized **protected** ephemeral Auth/JWT/Edge/Storage binary test workflow with private secret handling; require an actual authenticated user, authorized draft order, PNG/JPEG magic bytes, SHA-256 proof, and negative cross-org/Viewer paths.
3. Continue the natural 24-hour orphan image retention gate on existing QA only as read-only until an independent file-deletion test is explicitly authorized.
4. Independent review of all public `SECURITY DEFINER` functions, Edge gateway trust assumptions and exact P7 Storage/RLS code; do not interpret green SQL-only gates as positive image-byte E2E acceptance.
5. Exact-SHA owner sign-offs remain separate for Draft PR merges, Production database/Storage/RLS migrations, and WOS launch.

**Status: P8 live structure/RLS smoke PASS; authenticated binary, native branch replay and complete Production release readiness remain BLOCKED.**
