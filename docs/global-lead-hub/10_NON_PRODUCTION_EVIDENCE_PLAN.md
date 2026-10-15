# Global Lead Hub — Non-Production Evidence Plan

> TASK_ID = GLH-P9-EVIDENCE-PREP-002  
> BASE_MASTER_SHA = 1708f43753409b891a40c6110e2e6d3e7a549b2a  
> TRACK = REPOSITORY_ONLY  
> PRODUCTION_CHANGED = NO  
> PRODUCTION_EXECUTION_AUTHORIZED = NO

## Purpose and boundary

This plan defines the evidence that must be collected before anyone may ask
for a Global Lead Hub Production activation decision. It does not collect
Production values, connect a real channel, run SQL, alter RLS or grants, set
environment variables, send customer-facing messages, or publish externally.

Evidence contains references and outcomes only. Never paste tokens, app
secrets, verify tokens, service-role keys, cookies, customer payloads, phone
numbers, or environment-variable values into the repository, CI logs, issues,
pull requests, screenshots, or evidence bundles.

## Decision semantics

Every evidence item has one status:

- `PASS`: the exact acceptance rule was exercised in an approved isolated
  environment and a sanitized artifact reference is present.
- `FAIL`: the rule was exercised and did not meet its acceptance threshold.
- `UNKNOWN`: the item is missing, stale, ambiguous, ownerless, malformed,
  based only on future intent, or cannot be verified without crossing a Human
  Gate.

Missing evidence is always `UNKNOWN`, never inferred `PASS`. Any `FAIL` or
`UNKNOWN` makes the bundle `NOT_READY`. A complete `PASS` bundle means only
`READY_FOR_HUMAN_GATE`; it never authorizes Production execution.

## Evidence-record schema

Each item records: `id`, `status`, accountable `ownerRole`, sanitized
`evidenceRef`, UTC `observedAt`, tested release/head SHA, isolated target name,
acceptance result, and notes with no secret or customer data. The evaluator in
`phase9-evidence-prep.ts` validates these fields and fails closed.

## Required evidence catalog

| ID | Owner role | Evidence to collect | PASS rule |
| --- | --- | --- | --- |
| `META_BUSINESS_PREREQUISITES` | `CHANNEL_OWNER` | Business portfolio, WABA, phone-number identity, app review/permission and approved-template readiness, referenced by sanitized IDs only | Every prerequisite is reviewed against then-current official Meta requirements; no credential is stored |
| `META_WEBHOOK_VERIFICATION` | `GLH_SECURITY_OWNER` | Isolated valid/invalid verification-challenge results | Correct challenge passes; wrong/missing verify token fails without logging it |
| `META_WEBHOOK_SIGNATURE` | `GLH_SECURITY_OWNER` | Isolated `x-hub-signature-256` HMAC acceptance/rejection matrix | Valid body/signature passes; missing, malformed, tampered-body and wrong signature fail closed |
| `WEBHOOK_IDEMPOTENCY` | `GLH_ENGINEERING_OWNER` | Replay tests for `provider + external_event_id` and AI action key | Replays create exactly one logical message and no duplicate lead or auto-reply |
| `SUPABASE_SCHEMA_INVENTORY` | `DATABASE_OWNER` | Production inspection worksheet fields for migrations, `glh_` tables, columns, constraints and indexes | Worksheet is complete for later human collection; no Production query was run by this task |
| `SUPABASE_RLS_GRANTS` | `DATABASE_OWNER` | Later collection fields for RLS enabled state, policies, API grants, anon denial, authenticated scope and service-role boundary | Every exposed `glh_` table has explicit policy/grant evidence and `anon` has no business-data access |
| `SUPABASE_ADVISORS` | `DATABASE_OWNER` | Later sanitized Security/Performance Advisor report references | No unresolved high-risk finding affecting GLH authorization, exposure or integrity |
| `VERCEL_ENV_NAMES` | `RELEASE_OWNER` | Name-only inventory for required variables across Preview and Production | Names, scopes and responsible owners are recorded; no values are read or printed |
| `SECRET_REDaction` | `GLH_SECURITY_OWNER` | Browser/log/build/evidence redaction checks | No secret-like value appears in client bundles, logs or artifacts |
| `AI_FORBIDDEN_CLAIMS` | `GLH_PRODUCT_OWNER` | Deterministic tests for price, discount, payment, delivery, technical, adhesion/test, capacity, compensation, contract and agency commitments | AI refuses to commit and hands off every prohibited decision |
| `HUMAN_HANDOFF` | `GLH_PRODUCT_OWNER` | `AI_ACTIVE → HANDOFF_PENDING → HUMAN_ACTIVE` rehearsal | Customer-facing automation stops immediately at takeover while drafts/manual work remain available |
| `AI_PROVIDER_OUTAGE` | `SUPPORT_OWNER` | Provider timeout/auth/rate-limit simulation | Inbound is preserved, human task/handoff is created, and manual work remains usable |
| `RLS_ACCEPTANCE` | `DATABASE_OWNER` | Isolated role/organization matrix | Sales A cannot read restricted Sales B records; Manager/Admin only receive explicitly authorized scope |
| `ROLLOUT_DRY_RUN` | `RELEASE_OWNER` | No-cutover staged rollout rehearsal | Candidate identity, observation window, stop conditions and outbound-disabled state are verified |
| `CONTAINMENT_DRY_RUN` | `INCIDENT_COMMANDER` | Simulated auth/RLS, duplicate-send, secret-leak and provider-storm incidents | Expansion stops, evidence is preserved and owners are notified without destructive data action |
| `ROLLBACK_DRY_RUN` | `ROLLBACK_OWNER` | Isolated restoration rehearsal to recorded prior deployment/channel state | Restoration completes inside the agreed objective without Production DB rollback or data deletion |

## Supabase evidence worksheet fields

The later, human-authorized Production inspection must record only sanitized
metadata and artifact references:

- project reference alias and inspected release SHA;
- applied migration names/checksums and expected-versus-observed result;
- every `glh_` table, primary/foreign keys, uniqueness and required indexes;
- RLS enabled/forced state and policy names per operation/role;
- table/function/schema grants for `anon`, `authenticated`, and controlled
  server roles, including explicit `anon` denial;
- organization and owner/assignment isolation matrix results;
- storage bucket privacy/policy results if media is enabled;
- Security Advisor and Performance Advisor run timestamps, summarized finding
  IDs/severity/status, and remediation references;
- evidence owner, observation time, target alias and sanitized artifact link.

This task must not run those Production queries or change schema, policies,
grants, data, extensions, advisor settings, or credentials.

## Vercel name-only prerequisites

Confirm the application-specific inventory against the deployed code before
the Human Gate. Expected names include `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Meta/WhatsApp
access-token and app-secret names, webhook verify-token name, provider/API key
names, and GLH provider/rollout feature-flag names. Record only each variable
name, intended Preview/Production scope, server/client classification, owner,
and presence status. Never fetch, compare, hash, copy, print, or screenshot a
value. Any `NEXT_PUBLIC_*` secret or server secret exposed to the browser is a
`FAIL`.

## Meta and WhatsApp prerequisites

Before a later cutover decision, the channel owner must verify against current
official documentation: business portfolio/WABA ownership, phone-number
registration and display status, app mode/review, least-privilege permissions,
system-user/token ownership, webhook subscription fields, verification and
signature behavior, messaging-window rules, approved templates, rate/quality
status, data retention, incident contacts, and distinct isolated versus
Production targets. Unknown or pending platform approval remains `UNKNOWN`.

## Evidence handling and retention

Use repository paths, CI artifacts, approved ticket IDs, or sanitized report
URLs as references. Evidence must be immutable or revision-addressed, owned,
dated in UTC, tied to a candidate SHA and target alias, and reviewable without
credential access. Screenshots must redact identifiers not needed for the
decision. Real customer content is never test evidence.

## Exact Human Gate

After every required item is `PASS`, a separate owner decision must name the
candidate release SHA, Production targets, execution owner, rollback target,
incident commander, observation window and stop criteria. The exact approval
phrase is:

```text
APPROVE GLH PRODUCTION EXECUTION FOR <40_CHAR_RELEASE_SHA> WITH REVIEWED META, SUPABASE, VERCEL, ROLLOUT AND ROLLBACK EVIDENCE
```

Even that phrase authorizes only the separately reviewed execution plan. Real
outbound Meta/WhatsApp cutover and external publishing require an additional
explicit decision if not unambiguously included in that plan. Until the Human
Gate is recorded, all Production SQL/schema/RLS/grants/data/env/secrets,
provider cutover, customer send, external release, auth weakening,
customer-ownership change and finance-SoT change remain prohibited.

