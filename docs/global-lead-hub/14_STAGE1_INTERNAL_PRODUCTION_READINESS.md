# Global Lead Hub — Stage 1 Internal-Only Production Gate

> PREPARATION ONLY; not authorization for Production execution
>
> PREPARATION_OWNER = Hongda GLH PM
> PHASE = Phase 9 / Stage 1 (internal workspace only)
> STAGE2_META_WHATSAPP_CUTOVER = NOT AUTHORIZED
> PRODUCTION_SQL_EXECUTED = NO
> PRODUCTION_ENV_OR_SECRETS_CHANGED = NO
> PRODUCTION_DEPLOYMENT_CHANGED = NO
> GLH_MANUAL_PRODUCTION_LEAD_CREATION = NOT AUTHORIZED
> OWNER_EXACT_SCOPE_APPROVAL = PENDING

## Stage 1 scope and separation

**In scope:** Internal authenticated GLH workspace with current read models and previously reviewed human task/assignment RPCs, once GLH schema and RLS have been independently verified. Do not move legacy customer or financial records. Initial dataset may legitimately be empty.

**Out of scope:** Any real Meta Business / WABA channel connection; webhook registration; AI-facing customer messaging; live provider inbound/outbound; modifying Production WhatsApp tokens/secrets; copying prior CPC/legacy leads; unapproved manual Production lead creation; changing any existing customer attribution/owner or financial authority.

The first-stage release MUST keep the existing `GLH_PROVIDER_CALLS_ENABLED = false` code constant. The WhatsApp GET and POST webhook handlers must fail closed before challenge processing or request parsing. The existing human messaging adapter returns `providerAction: NONE` and queues messages without sending. A real WhatsApp channel requires a separate, later code review and owner approval.

The existing `glh_create_manual_test_lead` path is **test/dev only**, guarded in both Next.js and PostgreSQL by non-Production environment settings. It must remain disabled in Production. If Sales needs manual intake before Meta cutover, create an independently reviewed, role/organization-scoped Production intake flow as a new business-authorized scope; do not weaken test-only safeguards.

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

These are additive, forward-only migrations, but **still affect Production schema, RLS and grants**. No part of this plan is implicit permission to apply them. Record exact reviewed SQL content SHAs and final approved app release SHA; never approve only by branch name. Unrelated GLH/CPC/Commercial PRs must not be silently incorporated into release approval.

## Database / app prerequisites

1. Restore reliable connection to the isolated `hongda-review-dev` test project. The Supabase SQL/migrations endpoint timed out repeatedly on 2026-10-21 despite metadata indicating ACTIVE_HEALTHY. **Do not treat static CI as equivalent to actual DB migration/RLS testing.**
2. Verify isolated test DB baseline includes organizations, profiles, `(id,org_id)` unique index, `set_updated_at()` and required grants; compare to Production read-only inventory.
3. Apply four migrations in test project only after a fresh no-conflict confirmation. Exercise:
   - migration atomicity and no changes to CPC/legacy business records;
   - `anon` cannot select/execute GLH business mutations;
   - Sales A cannot read Sales B restricted lead, cross-organization reads denied;
   - Manager/Admin limited to their own organization;
   - task/assignment/handoff auditing, replay/idempotency and database error paths;
   - public WhatsApp webhook GET/POST disabled with HTTP 503, no provider call or inbound persistence;
   - manual test/dev create remains inaccessible on real Production.
4. Run current repo CI and GLH unit tests against the exact PR HEAD; Vercel Preview must be READY. Record source branch and head SHA.
5. Confirm GLH UI on real app target using active Supabase sign-in for relevant roles (in a controlled Pilot). Do not fabricate pass status from static test fixtures.

## Proposed phased Production execution (requires exact separate owner approval)

- Freeze **one** exact release SHA and 4 exact SQL contents, obtain named Production execution/rollback owners, record prior Production deployment.
- Read-only preflight rechecks target identity, source schema, roles/indexes, zero GLH tables and migration version, RLS advisor baseline, project env-name inventory and provider-off constant.
- Apply 4 SQL migrations *one at a time*, abort immediately on SQL failure/partial state; verify relations/functions/foreign keys/grants/RLS and post-migration Security/Performance Advisors.
- Keep Meta secrets absent and provider traffic disabled. No external account/channel subscription.
- Deploy/verify only the exact owner-approved app release if the code guard requires deployment; protect CPC, commercial documents and existing web routes.
- Verify admin, manager and sales authentication and read-only list/dashboard; verify empty state, API denial for unauthorized access, task/assignment permissions with isolated authorized canaries; verify blocked inbound and outbound.
- Record postflight observations, known empty-data limitation, and rollback deployment. On failure stop promotion/traffic, preserve records, revert app if necessary; **never DROP newly created Production tables or delete Production records as casual rollback**.

## Stop/rollback criteria

Any unauthorized cross-org access; RLS bypass; missing GLH schema/RPC; unexpected Production schema drift; functional GLH request failing under authorized profile; active real Meta channel; secret leakage; unexpected outbound/automatic customer send; CPC/finance/customer source-of-truth change; loss of audit or version history => STOP, report evidence and request bounded remediation.

## Human decisions

**Still required before database changes:** Exact Production migration/RLS/grant + code release approval for a frozen SHA, with DB test evidence and rollback identity attached. The earlier owner's instruction to *lead preparation* is not treated as blanket authorization to write Production schema.

**Business choice (separate):** Should Stage 1 allow salespeople to *manually add real leads* before WhatsApp launch? Current frozen V1 deliberately prohibits this path in Production. A yes requires an audited, genuinely Production-safe manual intake API/RPC and UI—not merely setting test/dev flags.
