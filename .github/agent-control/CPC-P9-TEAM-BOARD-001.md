# CPC-P9-TEAM-BOARD-001

Status: READY_FOR_CODEX

Base master SHA: `8d593273e44d7ca71583d4a7e3ce162b735cd18a`

## Goal

Implement Phase 9 as one bounded end-to-end repository task: the manager/admin Team Board at `/customer-projects/team`.

The board must follow the frozen Phase 3 information architecture and Master Checklist:
1. management decisions needing action first;
2. customer commitments / delivery-critical exceptions;
3. overdue / stalled / missing-next-action Project exceptions;
4. team workload / support needs;
5. old-customer coverage and conversion;
6. business progress / outcomes.

This is a management exception-and-support surface, not an employee surveillance or leaderboard product.

## Frozen authorization and source-of-truth boundaries

1. Team Board primary navigation and route are manager/admin only. Sales must not gain team-wide visibility.
2. All data is same-org only and server-authorized. Client-side hidden navigation is not an authorization boundary.
3. Reuse existing confirmed CPC facts and read models:
   - profiles
   - cpc_projects / customer references
   - cpc_work_items including MANAGEMENT_DECISION, CUSTOMER_COMMITMENT, NEXT_ACTION, INTERNAL_COLLABORATION, FOLLOW_UP
   - waiting / next_check / reminder projections already implemented
   - submitted cpc_reports where useful
   - existing customer follow-up / project event facts
4. Do not create a second source of truth for ownership, project status, commitments, reports, orders, quotes, payments, or customer identity.
5. Existing external customer ownership/payment sources remain authoritative where already frozen.
6. Missing external order/payment/quote/receipt integrations remain UNKNOWN. Never display missing data as zero or “no activity”.
7. No Production SQL/RLS/env execution or change. If safe same-org manager reads cannot be implemented with existing repository authorization without a repository migration, stop with NEEDS_DECISION and provide evidence. Do not bypass RLS/auth with an unsafe browser or service-role shortcut.

## Board behavior

### A. Management decisions — first section

Use formal `MANAGEMENT_DECISION` WorkItems as the authoritative source.

Show actionable open decisions with:
- title / priority / due or overdue state;
- project/customer context where available;
- assignee / creator display identity where authorized;
- blocked reason if present;
- drill-down to existing Project / Task surfaces.

No new mutation workflow is required in this phase unless an existing controlled task action can be safely reused without widening authorization. Prefer read-only drill-down from Team Board.

### B. Customer commitments / delivery-critical exceptions

Surface confirmed formal exceptions such as:
- overdue CUSTOMER_COMMITMENT items;
- due-now / near-due commitments according to already-approved reminder semantics;
- blocked/waiting work that is delivery-critical where existing confirmed fields support it.

Do not invent promised dates, delivery dates, order dates, or external finance facts.

### C. Project exceptions

Surface Projects that need management attention using confirmed existing fields only, e.g.:
- overdue formal next action;
- blocked next action;
- waiting with next_check_at due/overdue;
- active Project missing required next action where the frozen model says it should exist;
- stale/no substantive progress only if the repository already has a deterministic approved definition/threshold. Do not invent a new business-policy threshold in Phase 9.

### D. Team workload / support needs

Show support-oriented workload/context by person without ranking:
- open/blocked/overdue formal work items;
- active/waiting Project context;
- management/internal collaboration obligations;
- submitted weekly-report signals where already confirmed and useful.

Rules:
- no “best/worst”;
- no employee score;
- no attitude/effort inference;
- no raw message/click/note/record counts as performance evidence;
- no sort that implies performance ranking by default;
- do not reduce support need to one synthetic score.

### E. Old-customer coverage / conversion

Phase 9 may only show confirmed facts already available from existing customer follow-up/project data.
Do not implement Phase 10 proactive-development policy, cadence, recommendation logic, or new conversion definitions here.
If coverage/conversion facts are not yet safely available, show explicit unavailable/UNKNOWN state instead of inventing metrics.

### F. Business progress / outcomes

Show useful confirmed management-level totals/status distribution such as:
- active / waiting / won / lost Project state where available;
- meaningful progress / confirmed outcomes already represented by existing facts or submitted reports;
- current exception counts.

Do not infer revenue, order value, payment, quotation acceptance, or conversion if their authoritative source is not integrated.

## UI / IA

1. Route: `/customer-projects/team`.
2. Manager/admin only in primary navigation; sales route access must fail server-side, not merely hide the link.
3. Desktop-first dense management surface, but usable on mobile.
4. First screen order must match Phase 3:
   decisions -> commitments/exceptions -> project exceptions -> team support -> old-customer coverage/conversion -> business progress/outcomes.
5. Prefer concise cards/lists with drill-down over a giant analytics dashboard.
6. Do not duplicate Project/Customer detail; link to existing detail sources.
7. Avoid charts unless they materially improve understanding; simple operational counts/lists are preferred for V1.

## API / read model

- Prefer one bounded Team Board server read model / API that returns authorized same-org management data.
- Keep browser free of privileged direct Supabase/service-role queries.
- If multiple existing read models are reused, keep one consistent response contract for the Team page.
- Include explicit known/unknown metadata where facts may be unavailable.
- Bound query sizes and avoid N+1 patterns where practical.
- Reuse profiles.id for business identities.

## Tests / gates

Add focused Phase 9 contract tests and wire them into CI.

Must prove:
- sales cannot access Team Board API or route;
- manager/admin same-org access;
- cross-org data fails closed;
- no manager mutation path introduced by Team Board;
- MANAGEMENT_DECISION appears first / is represented as formal WorkItem truth;
- customer commitments / project exceptions use formal confirmed facts;
- no rankings/scoring/attitude inference/message-click performance;
- missing external finance/order/quote/payment facts remain UNKNOWN, not zero;
- old-customer section does not implement Phase 10 policy or fabricated conversion;
- no browser-direct privileged Supabase/service-role mutation/read;
- no localStorage/site_data/generic /api/data source of truth;
- Phase 5–8 report/reminder/AI regressions stay green;
- TypeScript / build / secret audit / smoke / Vercel pass.

## Fast-path implementation policy

This is one bounded Phase 9 PR. Implement end-to-end where existing authorization permits. Batch deterministic compile/test fixes in the same PR. ChatGPT PM may directly fix low-risk TypeScript/lint/test wiring issues. Production/high-risk gates remain closed.

## Out of scope

- Phase 10 proactive old-customer cadence/recommendation policy
- employee ranking / performance scoring
- message/click surveillance
- revenue/finance/order/payment/quote integration
- customer ownership changes
- Team Board mutations that require new authorization policy
- Production SQL/RLS/env
- external notifications
- new settings/business thresholds

## Completion contract

TASK_ID = CPC-P9-TEAM-BOARD-001
TASK_STATUS = PASS / FAILED / BLOCKED / NEEDS_DECISION
BRANCH =
HEAD_SHA =
PR_NUMBER =
FILES_CHANGED =
TESTS =
DATABASE_CHANGED =
MIGRATION_CREATED =
RLS_CHANGED =
PRODUCTION_CHANGED =
TEAM_ROUTE_MANAGER_ADMIN_ONLY = PASS / FAIL
SAME_ORG_GUARD = PASS / FAIL
MANAGEMENT_DECISIONS_FIRST = PASS / FAIL
NO_RANKING_SCORING = PASS / FAIL
UNKNOWN_SEMANTICS = PASS / FAIL
TEAM_BOARD_READ_ONLY = PASS / FAIL
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO

AUTO_PRODUCTION = false.
