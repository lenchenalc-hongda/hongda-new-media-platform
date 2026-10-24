# Global Lead Hub — Stage 1 Internal-Only Production Gate

> PREPARATION ONLY; not authorization for Production execution
>
> PREPARATION_OWNER = Hongda GLH PM
> PHASE = Phase 9 / Stage 1 (internal workspace only)
> STAGE2_META_WHATSAPP_CUTOVER = NOT AUTHORIZED
> PRODUCTION_SQL_EXECUTED = NO
> PRODUCTION_ENV_OR_SECRETS_CHANGED = NO
> PRODUCTION_DEPLOYMENT_CHANGED = NO
> GLH_MANUAL_PRODUCTION_LEAD_CREATION = OWNER_APPROVED_SCOPE; CODE NOT DEPLOYED
> OWNER_EXACT_SCOPE_APPROVAL = PENDING

## Stage 1 scope and separation

**In scope:** Internal authenticated GLH workspace plus owner-approved human manual lead intake with real logged-in Supabase roles, audited creator and owner, contact de-duplication, idempotent retry, and human task/assignment RPCs, once schema and RLS are verified. Do not move legacy customer or financial records. Initial dataset may legitimately be empty.

**Out of scope:** Any real Meta Business / WABA channel connection; webhook registration; AI-facing customer messaging; live provider inbound/outbound; modifying Production WhatsApp tokens/secrets; copying prior CPC/legacy leads; test/dev guard bypass or unapproved direct-table manual creation; changing any existing customer attribution/owner or financial authority.

The first-stage release MUST keep the existing `GLH_PROVIDER_CALLS_ENABLED = false` code constant. The WhatsApp GET and POST webhook handlers must fail closed before challenge processing or request parsing. The existing human messaging adapter returns `providerAction: NONE` and queues messages without sending. A real WhatsApp channel requires a separate, later code review and owner approval.

The existing `glh_create_manual_test_lead` path remains **test/dev only**, guarded in both Next.js and PostgreSQL. The owner separately approved **formal manual Production lead intake** on 2026-10-21. A new, isolated `glh_create_manual_production_lead` RPC and `/api/global-lead-hub/leads/manual` endpoint are reviewed in PR #138, with a unique per-user request key, private idempotency ledger, duplicate-contact rejection, activity/assignment/audit trails, owner defaulting to self, and no external channel actions. **This approval covers development only, not Production SQL/RLS/Release execution.**

## Latest known Production baseline (read-only; reverify at approval time)

- Production project: Supabase `hongda-new-media` (`amqpvxrurenevniilhtl`), region `ap-southeast-1`.
- Production existing `glh_*` relations/policies: **0 / 0** (observed 2026-10-21).
- Production existing `public.profiles`: 9 rows (count only; no personal data read).
- `public.profiles` has `profiles_pkey(id)` **and** an existing unique index `uq_profiles_id_org (id, org_id)`. PostgreSQL composite foreign keys can reference this UNIQUE index, even though `information_schema.table_constraints` does not list it. **Do not add a redundant unique constraint or mutate CPC profiles.**
- `public.organizations(id)` PRIMARY KEY present.
- `public.set_updated_at()` helper present.
- Production Vercel project `prj_y1JAqsnwxlIAJANknRQ0JHWsn8tG`, team `team_OZQkJ9a5x0fAirpMzt3vn3Xp`, alias `www.hongdaprinting.tech`.
- Existing Production deployment rollback candidate `dpl_3Xw5vPSroHANztTvP53aMnWNdJ2c`, master SHA `68185f05c084c701bd31d32306df652dde0071f2` (reverify immediately before release).
- Project has core Supabase credentials present (values were not read). Three Meta/WhatsApp-related Production names `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `GLH_PROVIDER_CALLS_ENABLED` were **absent**. Stage 1 does **not** require adding them. Provider feature stays off in code. This is not Stage 2 readiness.

## Production migration candidate (files exist in repository; NOT executed)

Apply in the exact order below only after a separate exact-SHA owner approval and passing isolated-environment verification:

1. `supabase/migrations/20261009181000_global_lead_hub_phase1_foundation.sql` — base GLH tables/indexes/RLS/read policies/role helpers.
2. `supabase/migrations/20261010074500_global_lead_hub_phase2_core_human_ui.sql` — activity, manual **test/dev-only** RPC, assignment, tasks and followups.
3. `supabase/migrations/20261010182400_global_lead_hub_phase3_whatsapp_inbound.sql` — storage-bound RPC only; no live provider connection.
4. `supabase/migrations/20261011181500_global_lead_hub_phase5_handoff_persistence.sql` — controlled handoff and queued human-message persistence; provider sends remain disabled.
5. `supabase/migrations/20261021120000_global_lead_hub_stage1_manual_production_intake.sql` — private idempotency ledger and real authenticated, audited manual Production lead creation with organization-scoped role enforcement.
6. `supabase/migrations/20261021135000_global_lead_hub_stage1_human_workflow.sql` — manual-lead lifecycle transitions, assigned task/followup completion, append-only work status history, stale-version checks and next-followup recalculation.

These are additive, forward-only migrations, but **still affect Production schema, RLS and grants**. No part of this plan is implicit permission to apply them. Record exact reviewed SQL content SHAs and final approved app release SHA; never approve only by branch name. Unrelated GLH/CPC/Commercial PRs must not be silently incorporated into release approval.

## Database / app prerequisites

1. **Resolved 2026-10-22:** isolated `hongda-review-dev` SQL connectivity recovered. A live `SELECT now(), current_database(), current_user` succeeded against project `xulmpqaknlwqqculbsek`. The project reports ACTIVE_HEALTHY and database SQL is now responsive. Do not regress this evidence back to UNKNOWN unless a fresh supported request fails.
2. Hosted Supabase migration presence is now confirmed on the isolated dev project: **6 GLH migrations, 20 GLH tables, 19 GLH RLS policies**. All 20 `glh_*` tables have RLS enabled. `anon` has no GLH table grants and no GLH function EXECUTE grants. `authenticated` has SELECT only on the intended readable GLH tables and EXECUTE only on controlled GLH RPCs; `PUBLIC` does not retain EXECUTE on GLH RPCs. The private `glh_manual_intake_requests` ledger intentionally has RLS enabled with no direct policy and no authenticated table grant.
3. Security Advisor was run after the live hosted verification. It reports the private `glh_manual_intake_requests` no-policy condition as INFO and reports authenticated-callable SECURITY DEFINER RPCs as WARN. For GLH, these RPCs are intentionally exposed only to `authenticated`, have `anon`/`PUBLIC` EXECUTE revoked, and rely on explicit in-function identity/organization authorization. This still requires role-behavior verification before release; advisor warnings are not silently treated as PASS.
4. Verify isolated test DB baseline includes organizations, profiles, `(id,org_id)` unique index, `set_updated_at()` and required grants; compare to Production read-only inventory.
3. Apply six migrations in test project only after a fresh no-conflict confirmation. Exercise:
   - migration atomicity and no changes to CPC/legacy business records;
   - `anon` cannot select/execute GLH business mutations;
   - Sales A cannot read Sales B restricted lead, cross-organization reads denied;
   - Manager/Admin limited to their own organization;
   - task/assignment/handoff auditing, replay/idempotency and database error paths;
   - public WhatsApp webhook GET/POST disabled with HTTP 503, no provider call or inbound persistence;
   - manual test/dev create remains inaccessible on real Production; the NEW production intake is separate and checks live `auth.uid()`.
   - Sales self-ownership, Manager/Admin same-org assignment, Sales A vs B isolation, duplicate email/WhatsApp avoidance, same-key retry and modified-key collision, complete source/audit provenance, and no provider action.
   - Manual-only human stage progression with optimistic version and manager-visible audit, assignee/admin completion of tasks/followups, immutable work completion trail, recalculated next follow-up pointer, cross-org denial and no provider action.
4. Run current repo CI and GLH unit tests against the exact PR HEAD; Vercel Preview must be READY. Record source branch and head SHA.
5. Confirm GLH UI on real app target using active Supabase sign-in for relevant roles (in a controlled Pilot). Do not fabricate pass status from static test fixtures.


## 2026-10-22 hosted Supabase recovery evidence

- Project: `hongda-review-dev` / `xulmpqaknlwqqculbsek`.
- Live SQL data plane: **RECOVERED / PASS**.
- GLH migration history count: **6**.
- GLH table count: **20**.
- GLH RLS policy count: **19**.
- `anon` direct GLH table grants: **0**.
- `anon` GLH RPC EXECUTE grants: **0**.
- `PUBLIC` GLH RPC EXECUTE grants: **0**.
- `authenticated` direct GLH data access: SELECT-only on intended readable tables; write behavior remains through controlled RPCs.
- Provider ingress/egress remains disabled; no Meta/WhatsApp cutover or customer send was performed.
- Production project was not modified.
- Hosted-role behavior test used existing dev Auth user IDs plus temporary dev-only profiles/organizations, then removed all temporary GLH/profile/org rows after verification.
- Sales A could create one manual Production-intake lead through the authenticated RPC and could read it through hosted RLS.
- Same-org Sales B could not read Sales A's restricted lead.
- Same-org Manager could read the lead.
- Cross-organization Sales could not read the lead.
- Reusing the same request UUID and identical normalized payload returned the same lead/contact with `idempotentReplay=true`.
- Temporary verification data cleanup was confirmed: remaining test profiles = 0; remaining test leads = 0.

This removes the former **BLOCKER_A: dev SQL timeout**. The remaining pre-release gap is real authenticated role/browser behavior on the hosted dev project plus final exact release/SQL identity and separate Production approval.

## Proposed phased Production execution (requires exact separate owner approval)

- Freeze **one** exact release SHA and 6 exact SQL contents, obtain named Production execution/rollback owners, record prior Production deployment.
- Read-only preflight rechecks target identity, source schema, roles/indexes, zero GLH tables and migration version, RLS advisor baseline, project env-name inventory and provider-off constant.
- Apply 6 SQL migrations *one at a time*, abort immediately on SQL failure/partial state; verify relations/functions/foreign keys/grants/RLS and post-migration Security/Performance Advisors.
- Keep Meta secrets absent and provider traffic disabled. No external account/channel subscription.
- Deploy/verify only the exact owner-approved app release if the code guard requires deployment; protect CPC, commercial documents and existing web routes.
- Verify admin, manager and sales authentication and read-only list/dashboard; verify real manual lead creation and safe idempotent replay in approved canary records, default/assigned owner visibility, cross-organization denial, duplicate protection, auditable stage progression and completion of human work, accurate next-followup due date, task/assignment permissions and blocked inbound/outbound.
- Record postflight observations, known empty-data limitation, and rollback deployment. On failure stop promotion/traffic, preserve records, revert app if necessary; **never DROP newly created Production tables or delete Production records as casual rollback**.

## Stop/rollback criteria

Any unauthorized cross-org access; RLS bypass; missing GLH schema/RPC; unexpected Production schema drift; functional GLH request failing under authorized profile; active real Meta channel; secret leakage; unexpected outbound/automatic customer send; CPC/finance/customer source-of-truth change; loss of audit or version history => STOP, report evidence and request bounded remediation.

## Human decisions

**Still required before database changes:** Exact Production migration/RLS/grant + code release approval for a frozen SHA, with DB test evidence and rollback identity attached. The earlier owner's instruction to *lead preparation* is not treated as blanket authorization to write Production schema.

**Business choice resolved:** On 2026-10-21 the owner explicitly requested **正式环境支持手工录入外贸线索**. Implement a genuinely Production-safe intake API/RPC/UI and dedicated migration, not by changing the test/dev guard. This is *not* approval to execute database changes or deploy the website. Production release and SQL approval remain separate and exact-SHA-scoped.
