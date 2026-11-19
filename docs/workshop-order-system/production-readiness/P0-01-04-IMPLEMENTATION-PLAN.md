# WOS P0-01–P0-04: production-neutral implementation and release blockers

**Status:** `IN_PROGRESS / DESIGN_AND_ISOLATED_TEST_ONLY`. **Never run draft SQL on Supabase Production or the persistent QA project.** New code must not be merged or deployed without independent review and separate Owner approval.

**Read-only snapshots (2026-11-18):** master `7a005119303e852e1041f11bec32e5430286c25e`; PR238 `6a72b446ccc517a5ff14e531b8a6663b4a70a77e`; PR241 `89bb408d13e45458c608db29c47e2803d49b3170`. Production Supabase project `amqpvxrurenevniilhtl` has **0 WOS public tables**. QA `xulmpqaknlwqqculbsek` has **20 WOS tables/17 WOS functions**. The 10-table foundation migration in master is a *draft*, not a production migration. QA Run #44306430920 = PASS for one synthetic order to `WAITING_MATERIAL/v7`, not Production PASS.

## Task 01 / WOS object dependencies and first code artifact

| Layer | Exact source of truth | First-MVP action | Remaining engineering work |
|---|---|---|---|
| Existing identities | `public.organizations`, `public.profiles`, Supabase Auth | REUSE; never clone users | Effective roles/current-session checks and revoke handling |
| Existing CPC | `cpc_customer_references`, `cpc_projects` | REUSE; no second customer database | Link real project+customer+organization, enforce active ownership and statuses |
| Foundation | `wos_production_orders`, `wos_reference_images`, `wos_status_history` | REVIEW and restrict to MVP; do not apply full 10-table draft blindly | CPC FK+project/customer match, server-only status writes, images and history versioning |
| P7 business events | `wos_office_readiness_receipts`, `wos_submission_receipts`, `wos_workshop_inbox` | DESIGN production-neutral append-only tables | Atomic P1 submit RPC, verified image proof, idempotency |
| P2 business events | Operator action, Office revision, Operator review receipts | DESIGN production-neutral names and version constraints | Correct end-to-end P2 RPCs, actor authorization, latest signed-sample rejection |
| Deferred | sampling, visual baselines, material action, scheduling, start, completion, shipment | OUT OF FIRST MVP | Keep server start-disabled; defer to separate release |
| QA-only | `wos_qa_*`, Owner CAS, execution gates, `wos-private` QA proof objects | MUST NOT migrate | No copied SQL, fixtures, URL pins or old Run permissions |

The first **executable code proposal** is `wos_mvp_receipts_PROPOSAL_NOT_INSTALLED.sql`: six append-only business receipt/inbox tables, composite organization FKs, denied direct DML, private same-org read policies. This is NOT a deployable migration, a CPC integrity solution, or an approved transaction RPC. Test it only with `wos.p0_01_ephemeral_rehearsal=on` in an ephemeral PostgreSQL 17 fixture; the file otherwise raises `WOS_PROPOSAL_ONLY_NO_HOSTED_EXECUTION`. The associated CI tests must confirm rollback on injected failure and unchanged unrelated tables.

**P0-01 remains BLOCKED** until Production structural fingerprint replays, real binary Storage and Edge validation, CPC integrity, audited production state-transition RPCs and rollback plan all PASS. Original `supabase/migrations/20261014102000_workshop_order_system_foundation.sql` still grants a limited authenticated INSERT into DRAFT orders and allows NULL CPC IDs. Do not use this draft unchanged for a Production rollout.

### CPC key facts found via read-only live database inspection

The existing production columns and constraints establish:

- `profiles.id`, `profiles.user_id`, `profiles.org_id`, `profiles.role`, `profiles.is_active`.
- `cpc_customer_references.id`, `org_id`, `status`, `display_name_snapshot`.
- `cpc_projects.id`, `org_id`, `customer_reference_id`, `owner_profile_id`, `status`, `archived_at`.
- Existing CPC FK `cpc_projects(customer_reference_id, org_id) -> cpc_customer_references(id, org_id)` is real; `cpc_projects(id, org_id)` is unique.

**Mandatory Production invariant:** `orders.organization_id == projects.org_id == customers.org_id == actor.org_id`, and `orders.customer_id == projects.customer_reference_id`. The foundation draft does not enforce all of these. Final solution requires reviewed composite FKs plus a server-side transactional project/customer pairing check; optionally a dedicated database constraint/trigger only after performance and ownership review. Unknown/CPC-text-only links must be rejected.

## Task 02 / CPC real customer → production order integration

**Current split:** `ProductionOrderForm` in PR238 validates/local-edits office fields; `LiveQaCpcDraft` and `production/cpc-drafts/route.ts` use `QA-CPC-NONPROD-*` and separate QA DRAFT handling; `LiveQaProductionSubmit`, P7 `p7-nonprod-submit.ts` and image API handle `QA-NONPROD-*`. These are two QA-limited paths, not one Production-ready transaction.

Proposed unified path, with no real customer data copied into QA:
1. Authenticated Sales selects **real authorized CPC reference ID**; API returns only scope-allowed references.
2. API lists active/authorized projects where `projects.customer_reference_id` matches selected customer ID and both `org_id` values match the actor's current profile.
3. Server creates versioned `DRAFT` with immutable CPC ID/owner snapshots. Draft retries use `request_id` and optimistic version; do not trust text input, org or role claims as authority.
4. Attach signed/versioned private image metadata after byte-level MIME/hash validation; no client `service_role` and no public bucket.
5. On submit, one transaction validates complete fields, current Auth/profile, CPC relationship, active project and valid images, then writes a single P1 receipt, immutable Inbox projection, status-history event, and order version.
6. P2 runs on the same real order ID, editing the office fields with CAS; new revision records never duplicate the original P1 submission receipt/Inbox.

Read-only Production status snapshot (not personal data): **182** CPC references: `active=152`, `pending_review=29`, `mapped=1`. **88** CPC projects: `active=83`, `paused=1`, `cancelled=1`, `won=3`; one archived. Proposed minimum safe selection is `customer.status='active'` and `project.status='active'`, `project.archived_at IS NULL` until business owner explicitly approves how mapped/won are handled. Never silently classify `won` or `mapped` as active.

Production order-number rule is **UNDECIDED**; implement an organization-unique server-generated identifier with an adapter so final display format can be independently approved, not a QA prefix.

**P0-02 acceptance:** single isolation-safe CPC→DRAFT→private image→transactional submit→Inbox run, same-org relation checks, archived/mismatched refs denied, interruption idempotency, stale-version 409, foreign actor 403; real employee UAT separately.

## Task 03 / PR238+PR241 integration, no implicit merge

1. Existing PR238 is based on master, Draft; PR241 is stacked on PR238's feature branch. Both have significant divergence from latest master.
2. This P0-01 branch is created from exact latest `master` and **contains only new production-readiness docs, isolated test and proposal files**; no cherry-pick or merge of legacy feature branches.
3. **P1 source map (selective port, later PR):** `src/lib/workshop-orders/office-entry.ts`, `ProductionOrderForm.tsx`, `LiveQaCpcDraft.tsx`, `LiveQaProductionSubmit.tsx`, `api-contract.ts`, `api-server.ts`, `production/cpc-drafts/route.ts`, `qa-image-verify/route.ts`, P7 Storage/Edge and P1 Inbox.
4. **P2 source map (after P1 candidate):** `p2-action-contract.ts`, `p2-office-revision-contract.ts`, `p2-qa-readiness.ts`, `LiveQaWorkshopActions.tsx`, `LiveQaReturnedOrders.tsx`, Office revision and Operator action routes, PR241 SQL proposals and tests.
5. **Known overlapping paths between PR238 and PR241:** `src/lib/workshop-orders/api-server.ts`, `src/app/workshop-orders/production/new/page.tsx`, `src/components/workshop-orders/LiveQaWorkshopInbox.tsx`, P1 Inbox test, workshop suite. Their source edits require explicit merge review.
6. Preserve PR202 shared lock; this branch does not modify PR202's files. Do not bypass protection or automatically merge PR238/241.
7. Never bypass `VERCEL_ENV!==production` QA guards by deleting a conditional. Production-neutral service adapter must have a **separately controlled default-OFF feature flag**, reviewed RPC name map and server+DB authorization.
8. Do not copy P7/P2 `docs/.../nonproduction-only` files into a runnable Production migration; they contain QA gate and synthetic fixtures.

**P0-03 remains IN_PROGRESS** until a fresh P1 production-neutral code PR plus P2 incremental PR pass exact-head CI/independent security audit. No business code integrated by this initial work package.

## Task 04 / employee roles and actual authorization

Production effective roles observed: `admin=1`, `sales=9`, `manager=0`, `operator=0`. QA has test-role fixtures. **Do not copy QA users or change Production profiles.**

| Business action | Admin | Sales | Manager | Operator | Viewer |
|---|---|---|---|---|---|
| Own-org order view | yes | own/assigned | own-org | authorized workshop | explicit assignment only |
| CPC draft/create/submit | yes | own/assigned | conditional | no | no |
| Return office correction | yes | own/assigned | conditional | no | no |
| Operator accept/return/review | own-org admin | no | own-org | authorized workshop | no |
| Material/start/completion/ship | **NO** | **NO** | **NO** | **NO** | **NO** |
| Change own role/access | no self elevation | no | no | no | no |

Permission decisions must read current `profiles`/organization on each consequential RPC, not editable user metadata or stale JWT role alone. Deactivated and revoked sessions must not retain critical write access. Define employee onboarding using genuine Auth IDs, controlled role grants, assignment policy and a role-revocation drill in an isolated test. Operator assignment details and real names require business owner confirmation; do not infer or publish personal identities.

**P0-04 remains BLOCKED** on a signed real-employee role matrix, separate authorization to create/change Production accounts, and staff UAT (Sales, Operator, Manager, Viewer, foreign organization).

## Deployment separation and rollback

- Today this is **no Production migration, no Production website, no persistent QA schema change, no Production role change**.
- CLI v3 changes DB target defaults and requires explicit `--remote` and hosted-change approval; pin CLI version before generating real migrations. Create real timestamped migration with `supabase migration new` when CLI is available; do not retrofit this proposal into an assumed existing migration history.
- The isolated CI contract test uses synthetic CPC rows and PG17 only; does NOT prove production-fingerprint replay, bucket API, staff UAT, or approved release.
- Future rollback: before first live order, shut off entry points and revert an isolated unconsumed schema migration after backup. After any live order exists, prefer feature OFF and forward fix/restore plan; no destructive `DROP CASCADE` rollback of business history.
- Any PostgreSQL/RLS/Storage/Edge change to project `amqpvxrurenevniilhtl`, real employee account, business PR merge, production deployment or billable branch requires a new, separate Owner authorization.

## Next work packages (after green isolated CI)

**P0-01-02:** trusted production schema fingerprint + proposed CPC triple-match integrity constraint/transaction and safe append-only RPCs; PG17 tests for byte-level image and immutable version.
**P0-02-01:** create isolated draft-only P1 real CPC selection/API adapter (Production feature still OFF).
**P0-03-01:** incremental P1 source-only port and conflict resolution, no PR238 merge; P2 follows.
**P0-04-01:** QA-only employee role/assignment simulation and signed operator onboarding procedure.

### Status control

`P0_01=IN_PROGRESS` (schema proposal + isolated tests, not full migration); `P0_02=BLOCKED_BY_DATABASE_AND_P1_INTEGRATION`; `P0_03=IN_PROGRESS_PLANNED_SOURCE_PORT`; `P0_04=BLOCKED_ON_PRODUCTION_ROLE_AUTHORIZATION`; `PRODUCTION=NO_GO`.
