# Global Lead Hub — Production Remediation Plan

> TRACK = PLAN_ONLY  
> PRODUCTION_CHANGED = NO  
> PRODUCTION_EXECUTION_AUTHORIZED = NO  
> AUTO_PRODUCTION = false  
> OWNER_APPROVAL_REQUIRED = YES

## 1. Why this plan exists

The owner-authorized read-only inspection in
`docs/global-lead-hub/owner-evidence/9152a3ae63a4.md` confirmed that the
repository implementation is ahead of the current Production infrastructure.

The application repository contains the GLH domain, UI, webhook, AI,
handoff, follow-up and attribution code, but the Production Supabase project
does not currently contain the `glh_` schema and the Production Vercel
environment does not contain the server-side WhatsApp variable names read by
the current webhook implementation.

This document prepares the exact remediation sequence. It does **not** approve
or execute any Production change.

## 2. Database migration inventory

The repository already contains four GLH migration files that must be reviewed
as one ordered Production migration set before execution:

1. `supabase/migrations/20261009181000_global_lead_hub_phase1_foundation.sql`
   - creates the core GLH tables, indexes, authorization helpers, grants and RLS
     design;
   - includes contacts, leads, lead profiles, conversations, messages, webhook
     events, scoring, assignments, tasks, follow-ups, AI/automation records,
     role bindings and audit events.
2. `supabase/migrations/20261010074500_global_lead_hub_phase2_core_human_ui.sql`
   - adds activity events and controlled human mutation functions used by the
     core UI.
3. `supabase/migrations/20261010182400_global_lead_hub_phase3_whatsapp_inbound.sql`
   - adds the controlled WhatsApp inbound persistence function used by the
     webhook route.
4. `supabase/migrations/20261011181500_global_lead_hub_phase5_handoff_persistence.sql`
   - adds controlled human-takeover and queued-human-message persistence.

Production evidence currently shows none of these migrations applied.

### Required review before any apply

Before Production execution, the exact four-file set must be reviewed against
the then-current Production schema and candidate release SHA. The review must
confirm:

- every business actor foreign key targets `profiles.id`, not `auth.users.id`;
- all exposed `glh_` tables have RLS enabled and explicit policies;
- `anon` has no GLH business-data access;
- authenticated grants are only the minimum required by the reviewed UI/RPC
  model;
- service-role-only functions remain server-only and are never reachable from
  browser code;
- helper/RPC functions have explicit safe `search_path` and reviewed
  `SECURITY DEFINER` exposure;
- organization isolation and Sales owned/assigned scope match the frozen GLH
  role model;
- required uniqueness/idempotency constraints exist before WhatsApp inbound is
  enabled;
- indexes cover the hot foreign keys and list/inbox query paths;
- a fresh Supabase Security and Performance Advisor run is captured after
  migration.

Any mismatch becomes a new migration/repair PR first. Do not hot-edit
Production to make the checklist pass.

## 3. Vercel environment-name remediation

Current webhook code reads these server-side names:

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

The Phase 9 rollout boundary also requires:

- `GLH_PROVIDER_CALLS_ENABLED`

Current Production name-only inspection found all three absent.

Core Supabase names already exist in Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

No secret value was read during evidence collection.

### Naming rule

The Production gate must follow the **actual code-referenced names**. Older
planning references to `WHATSAPP_VERIFY_TOKEN` or `META_APP_SECRET` must
not cause duplicate parallel variables unless a reviewed code change explicitly
normalizes those names.

No environment variable may be added or changed until a separate owner
approval names the exact variables and target scope. Values must be entered
through the secret-management surface and must never be committed to GitHub,
issues, PRs or evidence documents.

## 4. Release identity

The earlier evidence task was bound to
`720ea2e33de8a22668938fab73f17d2043bef6a2`, but the repository and Production
deployment have advanced since then.

Therefore the previous SHA must **not** be reused as the final activation
candidate.

Immediately before the Production gate:

1. merge all required repository-only remediation;
2. freeze the then-current master SHA as the new GLH candidate;
3. verify CI and Preview on that exact SHA;
4. record the current Production deployment as rollback identity;
5. bind all database/env/channel evidence to the new candidate SHA.

Any later repository change invalidates that candidate and requires a new
freeze.

## 5. Meta / WhatsApp account evidence

Current account-level state remains `UNKNOWN`.

Before activation, an authorized Meta/WABA account connection must provide
sanitized current metadata for:

- Business Portfolio/WABA ownership;
- phone-number registration and display state;
- app mode/review and required permissions;
- webhook subscription state;
- approved template availability and messaging-window constraints;
- account quality/rate state;
- accountable channel owner and incident contact.

Missing account access stays `UNKNOWN`; it is not a reason to request,
copy or expose credentials in repository tooling.

## 6. Safe execution order after owner approval

A future explicitly approved Production execution should proceed in this order:

1. freeze exact release SHA and rollback deployment identity;
2. re-run read-only Production preflight and confirm no unexpected schema/env
   drift;
3. execute only the reviewed GLH migration set;
4. run schema/RLS/grant verification and Security/Performance Advisors;
5. stop if any authorization or integrity check fails;
6. configure the approved server-side WhatsApp variables in Production without
   exposing values;
7. keep provider/outbound behavior disabled;
8. deploy the exact approved application candidate;
9. verify authentication, RLS, cross-organization denial, webhook verification,
   webhook HMAC rejection, idempotency, human takeover and AI outage behavior;
10. collect Meta/WABA channel evidence;
11. require a separate explicit decision before any real outbound customer
    messaging or broad provider cutover.

## 7. Stop conditions

Stop immediately on any of the following:

- RLS or organization-isolation failure;
- unintended `anon` or broad authenticated access;
- migration drift or unexpected destructive SQL;
- webhook verification/signature failure;
- duplicate logical message or replay failure;
- secret value exposure;
- current Production data mutation outside the reviewed GLH migration scope;
- customer ownership or finance source-of-truth change;
- provider/outbound behavior becoming enabled before its separate gate.

Containment must be non-destructive by default: stop rollout/provider traffic,
preserve evidence, restore the prior deployment target when appropriate, and
do not delete Production data merely to roll back application behavior.

## 8. Human Gate package

The next owner approval request should be short and exact. It must present:

- frozen release SHA;
- four migration files and any repair migration added by review;
- database preflight/advisor result;
- exact Vercel variable names to be added or changed, without values;
- Meta/WABA evidence status;
- rollout owner and rollback deployment;
- stop criteria;
- explicit statement that customer messages/provider cutover remain separately
  gated unless specifically approved.

Until that package is complete, GLH remains `HUMAN_GATE / NOT_READY`.
