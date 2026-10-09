# 08 Implementation Checklist

> SPEC_LOCK_VERSION = GLH-SPEC-V1.0
> SOURCE = GitHub Issue #72 Frozen Spec V1.0
> AUDIT_BASE_MASTER_SHA = cf3736f5179c863e44100b2988ebc17f7dce6d65
> FROZEN = YES
> PRODUCTION_EXECUTION_AUTHORIZED = NO
> AUTO_MERGE = false
> AUTO_PRODUCTION = false

## Phase 0 status

- [x] Read the authoritative frozen contract from Issue #72.
- [x] Materialize the eight development contract files from `00_` through `07_`.
- [x] Audit the current repository boundaries and ownership rules.
- [x] Record the real Phase 1-9 implementation checklist.
- [x] Make documentation-only changes with no application code, migration, environment, Production, or Meta/WhatsApp change.
- [x] Leave no formal GLH business source of truth in `localStorage`, mocks, `site_data`, or generic `/api/data`.

## Repository-boundary audit

### Baseline

- Audited from `master` SHA `cf3736f5179c863e44100b2988ebc17f7dce6d65`.
- The repository is a Next.js 14.2 / React 18.3 / TypeScript application with Tailwind, Supabase SSR/client packages, Zod, and the existing OpenAI SDK.
- The App Router lives under `src/app`; shared layout and sidebar code lives under `src/app/layout.tsx` and `src/components/layout/`.
- Legacy `/leads` exists at `src/app/leads/page.tsx` and must remain untouched during the first GLH phases.
- No GLH route, API, library, component, migration, or test implementation currently exists.

### GLH-owned implementation roots

Future bounded GLH tasks may use only the paths granted in that task and, at most, these registered project-owned prefixes:

- `docs/global-lead-hub/`
- `src/app/global-lead-hub/`
- `src/app/api/global-lead-hub/`
- `src/lib/global-lead-hub/`
- `src/components/global-lead-hub/`
- `tests/unit/global-lead-hub-*`
- `tests/e2e/global-lead-hub-*`
- `supabase/migrations/<timestamp>_global_lead_hub_<suffix>.sql`

The migration path must match the registered Global Lead Hub regex. Production SQL/RLS execution is never part of repository implementation.

### Shared paths that require a separate lock

The following real repository paths are shared and must not be edited by an ordinary GLH task:

- `src/middleware.ts`
- `src/app/layout.tsx`
- `src/lib/auth/roles.ts`
- `src/lib/auth/types.ts`
- `src/lib/auth/current-user.ts`
- `src/lib/features.ts`
- `src/lib/constants/navigation.ts`
- `src/components/layout/`
- `src/lib/supabase/`
- `package.json` and `pnpm-lock.yaml`
- root application/config files
- `.github/`
- `docs/agent-control/`
- `scripts/agent-control/`
- `src/lib/agent-control/`

If a GLH phase needs one of these paths, PM must serialize it behind `SHARED_PATH_LOCK = true` and issue a bounded task with the exact path.

### Authentication and authorization findings

- Trusted identity is resolved through `src/lib/auth/current-user.ts`; the repository supports `AUTH_MODE=mock` in development and `AUTH_MODE=supabase` for trusted identity.
- Business user foreign keys must use `profiles.id`.
- The existing root role contract supports `admin`, `manager`, `operator`, `sales`, and `viewer`. GLH V1 human roles are Admin, Manager, and Sales; AI is not a human profile.
- The current root middleware has no `/global-lead-hub` page slug. It therefore does not provide GLH-specific role authorization yet.
- Phase 1 must either enforce fail-closed authorization inside GLH-owned server components/API handlers or request a shared-path task for `src/middleware.ts` and `src/lib/auth/roles.ts`. It must never assume root middleware protects the new module.
- Authorization must not trust user-editable `user_metadata`.
- RLS is required on every exposed `glh_` table; grants and RLS must be designed separately.

### Supabase and persistence findings

- Existing server/client factories live in `src/lib/supabase/` and are shared.
- Existing migrations are additive, timestamped, and use explicit grants and RLS. Existing helpers include `organizations`, `profiles`, `auth_profile_id()`, `auth_org_id()`, `auth_has_role(TEXT)`, and `set_updated_at()`.
- GLH migrations must be forward-only and non-destructive in normal project tasks. No DROP, TRUNCATE, or Production data mutation is authorized by this lock.
- Formal GLH data must use `glh_` tables in Supabase/PostgreSQL. `site_data` and `/api/data` are explicitly forbidden as GLH source of truth.
- Media uploads must use private storage with authorized access by default.

### UI and navigation findings

- Existing reusable patterns include `AppLayout`, `PageHeader`, UI primitives, and route-specific client/server components.
- Root navigation is shared and currently has no Global Lead Hub portal entry. Adding one is not part of Phase 0.
- A future navigation change requires a shared-path lock; until then, GLH development may use GLH-owned route shells and direct test/dev access.
- The GLH UI must remain operable for human work when AI is unavailable.

### Testing and delivery findings

- Unit tests for this project belong under `tests/unit/global-lead-hub-*`.
- E2E tests belong under `tests/e2e/global-lead-hub-*`.
- No package-script change is allowed from an ordinary GLH lane. Tests can be invoked with the existing `tsx` tooling unless PM separately authorizes a shared `package.json` task.
- Required repository gates remain `pnpm typecheck`, relevant GLH tests, lint/build as required by the phase, and the Agent Control path validator.
- CI, exact-head review, and PM review remain mandatory. `AUTO_MERGE = false`.

### Boundary conclusion

Phase 0 is spec and documentation only. Phase 1 may begin only through a new bounded GLH task whose allowed paths fit the GLH ownership prefixes above. Root middleware, navigation, role, feature, package, shared Supabase, Agent Control, and Production changes are not silently included.

## Phase 1 - Foundation

### Implementation

- [ ] Create the GLH route shell under `src/app/global-lead-hub/`; do not alter legacy `/leads`.
- [ ] Create GLH domain, authorization, channel, and audit modules under `src/lib/global-lead-hub/`.
- [ ] Add fail-closed server authorization before exposing human or AI actions.
- [ ] Add additive GLH migrations matching `supabase/migrations/<timestamp>_global_lead_hub_<suffix>.sql`.
- [ ] Create `glh_` tables needed for the foundation phase, using `profiles.id` for business user foreign keys.
- [ ] Enable RLS on every exposed `glh_` table and grant only intended API access.
- [ ] Add channel/account abstractions without calling a real Meta/WhatsApp Production endpoint.
- [ ] Add append-oriented audit foundations for assignment, grade, stage, AI send, handoff, channel-setting, and role changes.
- [ ] Request a shared-path lock before changing root middleware, root navigation, feature flags, roles, auth, or package files.

### Exit gate

- [ ] Unauthorized or unauthenticated users fail closed.
- [ ] No formal GLH source of truth uses localStorage, mock constants, `site_data`, or `/api/data`.
- [ ] No Production SQL/RLS/env action is required or executed.
- [ ] Relevant GLH tests, typecheck, and repository gates pass.

## Phase 2 - Core Human UI

### Implementation

- [ ] Build the Today shell from `05_页面与UX规格.md`.
- [ ] Build the lead library and lead detail surfaces.
- [ ] Add manual lead creation for test/dev only, using the real GLH schema.
- [ ] Implement assignment and reassignment with audit history.
- [ ] Implement tasks and follow-ups.
- [ ] Keep all core human workflows usable without a provider or AI dependency.

### Exit gate

- [ ] Sales can work only within authorized lead scope.
- [ ] Manager/Admin access follows explicit organization/team rules.
- [ ] Transfer preserves original messages, assignment history, prior actor, and audit trail.
- [ ] No hard-delete path exists in normal business UI.

## Phase 3 - WhatsApp Inbound

### Implementation

- [ ] Implement webhook verification and ingest in the GLH API namespace.
- [ ] Persist `glh_webhook_events` before downstream processing.
- [ ] Enforce inbound uniqueness on `provider + external_event_id`.
- [ ] Normalize payloads and resolve/create contact, conversation, message, and lead records.
- [ ] Preserve original messages when media download or downstream processing fails.
- [ ] Configure a test account only.

### Exit gate

- [ ] Webhook replay creates no duplicate message, lead, or auto-reply.
- [ ] Provider secrets remain server-side and are never logged or returned to the browser.
- [ ] Media failure does not delete/drop the original message.
- [ ] No Production channel cutover occurs.

## Phase 4 - AI Qualification

### Implementation

- [ ] Persist the original inbound message before AI processing.
- [ ] Implement language detection and business-intent classification.
- [ ] Extract structured qualification fields from provider messages.
- [ ] Implement completeness and the frozen 100-point scoring model.
- [ ] Select only the 1-3 most important missing questions at a time.
- [ ] Implement every immediate human-handoff trigger.
- [ ] Add forbidden-claim and safety-boundary tests.
- [ ] Record prompt version and AI action outcomes for audit.

### Exit gate

- [ ] A "Hi price?" request does not invent a price and asks for missing product/material/quantity context.
- [ ] A machine query is classified as machine, asks machine-specific fields, and routes promptly to a human.
- [ ] Processing/printing-service customers are distinguished from film-only/machine inquiries.
- [ ] AI outage preserves inbound data and creates a human task/handoff.
- [ ] AI cannot autonomously commit any forbidden commercial, technical, or contractual claim.

## Phase 5 - Inbox And Handoff

### Implementation

- [ ] Build the three-column Unified Inbox.
- [ ] Implement `AI_ACTIVE → HANDOFF_PENDING → HUMAN_ACTIVE`.
- [ ] Stop autonomous customer-facing AI sends immediately on human takeover.
- [ ] Keep AI draft, summary, missing-info, and next-action assistance available as Copilot.
- [ ] Route all sends through a controlled server-side adapter.
- [ ] Preserve assignment/transfer history and prior actors.

### Exit gate

- [ ] Human takeover stops automatic sends immediately.
- [ ] Sales can use, edit, or ignore AI drafts.
- [ ] Automatic follow-up after human takeover remains out of V1.
- [ ] UI components cannot call provider send APIs directly.

## Phase 6 - Follow-up And Dashboard

### Implementation

- [ ] Implement today, overdue, upcoming, and dormant task views.
- [ ] Implement manager workload and lead-quality views.
- [ ] Add simple funnel/conversion views only when the underlying facts exist.
- [ ] Keep V1 analytics bounded and avoid a large BI warehouse.

### Exit gate

- [ ] Priority and overdue work surfaces clearly.
- [ ] Managers can resolve assignment and follow-up exceptions.
- [ ] Analytics use accepted business facts rather than AI proposals.

## Phase 7 - Ad Attribution

### Implementation

- [ ] Capture campaign, adset, ad, creative/referral identifier, and source platform when supplied by Meta.
- [ ] Store `UNKNOWN` when attribution is absent; never invent attribution.
- [ ] Connect attribution to source/creative lead-quality views.

### Exit gate

- [ ] Lead records retain provider attribution when available.
- [ ] Ad-source reporting does not fabricate campaign, creative, or referral data.

## Phase 8 - Non-Production Pilot

### Implementation

- [ ] Use isolated test channel/users.
- [ ] Use synthetic or approved test contacts where possible.
- [ ] Verify RLS for Sales A versus restricted Sales B access.
- [ ] Verify Manager/Admin organization and team rules.
- [ ] Verify webhook replay/idempotency.
- [ ] Verify takeover stops auto-send.
- [ ] Verify AI outage and provider failure behavior.
- [ ] Verify desktop UX at the 1366x768 minimum target.

### Exit gate

- [ ] Required acceptance cases A-G pass in the non-Production pilot.
- [ ] Secrets do not appear in browser or log artifacts.
- [ ] Salespeople can continue human work if AI is down.
- [ ] No Production data or channel is touched.

## Phase 9 - Production Readiness Gate

### Implementation

- [ ] Produce an exact Production runbook.
- [ ] Produce channel, environment, and security checklists.
- [ ] Define rollback and containment procedures.
- [ ] Define the explicit owner approval record.
- [ ] Confirm non-Production pilot completion and all acceptance evidence.

### Exit gate

- [ ] Explicit owner approval is recorded before any Production activation.
- [ ] No Production SQL/RLS/env/secrets change is autonomous.
- [ ] No destructive migration, Production delete/overwrite, customer ownership truth change, financial source-of-truth change, external publishing, or Production WhatsApp/Facebook cutover occurs without the required human gate.
- [ ] `AUTO_PRODUCTION = false` remains true throughout delivery.

## Acceptance Matrix

| Case | Requirement | Phase | Status |
| --- | --- | --- | --- |
| A | "Hi price?" is persisted, no invented price, missing context requested | 3-4 | Pending |
| B | Machine query is classified, qualified, and routed promptly | 4-5 | Pending |
| C | Processing/printing-service customer is handled separately | 4 | Pending |
| D | Human takeover stops automatic AI sends immediately | 5 | Pending |
| E | Webhook replay yields one logical message and no duplicate auto-reply | 3 | Pending |
| F | Sales A cannot read restricted Sales B lead; Manager/Admin follow rules | 1, 8 | Pending |
| G | Transfer preserves messages, assignment history, actor, and audit | 2, 5 | Pending |

## Agent Control And Safety Checklist

- [ ] `ONE_ACTIVE_TASK_PER_PROJECT = true`.
- [ ] `MAX_PARALLEL_PROJECTS = 2`.
- [ ] `SHARED_PATH_LOCK = true`.
- [ ] `MAX_AUTO_FIX_ROUNDS = 3`.
- [ ] `AUTO_MERGE = false`.
- [ ] `AUTO_PRODUCTION = false`.
- [ ] No force push or direct push to `master`/`main`.
- [ ] No Production SQL/RLS/env/secrets change.
- [ ] No Production data delete/overwrite.
- [ ] No customer ownership truth, financial source-of-truth, or external publishing change.
- [ ] No real Meta/WhatsApp Production cutover.
- [ ] No service-role secret exposure or logging.
- [ ] Any stale task, head, project identity, path ownership, or lock state fails closed.
- [ ] Any frozen-spec change requires an explicit PM spec revision in Issue #72 before implementation.
