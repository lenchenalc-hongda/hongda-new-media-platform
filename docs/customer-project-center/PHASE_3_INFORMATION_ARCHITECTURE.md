# Customer Project Center Phase 3 Information Architecture

Status: merge-gated candidate for `CPC-P3-INFORMATION-ARCHITECTURE-001`.

Approval gate: owner merge of the Draft PR containing this document. Phase 3 freezes page/navigation/role/mobile information architecture only. It does not authorize database schema, migrations, RLS, Production changes, or full feature implementation.

## 1. Design basis

Phase 3 must carry the approved Phase 1 business model and Phase 2 employee workflow into pages without adding a second administrative workflow.

Primary principle:

`work first -> capture once -> derive next action/reports/management views`

The existing CPC shell is reused:

- portal id: `sales`
- root route: `/customer-projects`
- feature flag: `customer_project_center`
- current roles with portal entry: admin / manager / sales
- current root page is a shell and contains no formal CPC data source

Existing disabled child-navigation entries are placeholders, not approved IA.

## 2. PAGE_MAP

### 2.1 My Workbench

Route: `/customer-projects`

Purpose: primary daily operating surface for sales/project owners and any manager/admin who has assigned CPC work.

Primary content, in order:

1. Today queue using Phase 2 P0 -> P3 priority classes
2. quick record / meaningful progress capture
3. exceptions that require action:
   - active Project missing next action/check
   - overdue commitments
   - blocked work
   - stale Project under an approved threshold
4. current waiting/check items
5. derived end-of-day summary/status

Rules:

- this is the default CPC landing page;
- do not make users visit a separate task page before seeing today's work;
- no fabricated/mock business metrics;
- quick record is available here and contextually from Customer/Project pages;
- management data is not mixed into the employee first screen.

### 2.2 Customers

List route: `/customer-projects/customers`

Detail route: `/customer-projects/customers/[customerReferenceId]`

Purpose: long-lived customer relationship and old-customer follow-up.

Customer list supports:

- search;
- customer ownership/reference visibility from the authoritative external source when integration exists;
- due customer-level follow-up;
- active opportunity/project count;
- last meaningful customer-level interaction;
- next relationship check;
- simple filters such as mine / due follow-up / has active Project.

Customer detail prioritizes:

1. customer identity/reference and external-source status;
2. next customer-level follow-up/check;
3. active and recent Projects;
4. recent confirmed customer-level events;
5. relevant external ownership/payment visibility when later integrated;
6. action: record customer follow-up;
7. action: create/promote concrete opportunity to Project.

Rules:

- customer ownership is displayed/referenced, not re-authored by CPC;
- no fake Project is created merely to follow an old customer;
- recent confirmed customer context should carry into Project creation without duplicate typing.

### 2.3 Projects

List route: `/customer-projects/projects`

Detail route: `/customer-projects/projects/[projectId]`

Guided creation route or sheet: `/customer-projects/projects/new`

Purpose: one concrete commercial opportunity per Project.

Project list prioritizes:

- Project title/customer;
- owner;
- project type;
- lifecycle status;
- current stage;
- waiting_on;
- next action/check;
- priority;
- exception/risk indicator.

Default filters should emphasize work, not database browsing:

- mine;
- active;
- needs action;
- waiting;
- blocked/stale;
- recently completed.

Project detail prioritizes:

1. business header: customer, Project type, owner, lifecycle, stage;
2. current NEXT_ACTION or waiting/check state;
3. primary action: record meaningful progress;
4. customer/commercial commitment state;
5. timeline of confirmed meaningful events;
6. collaborators/internal work;
7. source artifacts/references such as quotation or production handoff;
8. secondary history/audit information.

Rules:

- stage is not a wizard requiring users to click every prior stage;
- meaningful progress and next action/check should be updated together;
- repeat/reorder fast path is supported;
- Project.next_action_summary is display/projection, not an independently editable second truth;
- production-instruction traffic may be referenced but not presented as a canonical order ledger.

### 2.4 My Tasks

Route: `/customer-projects/tasks`

Purpose: complete work-item view beyond today's queue.

Use cases:

- future/open work;
- overdue work;
- waiting/check items;
- internal collaboration assigned to me;
- management decisions assigned to me;
- completed/cancelled history.

Rules:

- Workbench remains the daily priority view;
- My Tasks is for planning/search/history, not a duplicate Today page;
- one obligation must not appear as duplicate NEXT_ACTION and reminder rows.

### 2.5 My Reports

Route: `/customer-projects/reports`

Internal period selection: Daily / Weekly tabs or period selector.

Purpose:

- view derived report draft;
- resolve unknowns/exceptions;
- confirm/submit;
- review immutable submitted history.

Phase 3 intentionally replaces the current placeholder pair:

- `/customer-projects/daily`
- `/customer-projects/weekly`

with one primary navigation entry: `我的报告`.

Reason: daily and weekly reporting are derived outputs of the same confirmed work and should not occupy two separate top-level employee workflows.

Compatibility rule:

- the currently disabled placeholder routes are not business contracts;
- before those placeholders are enabled, implementation may redirect them to `/customer-projects/reports?period=daily|weekly` or remove them cleanly.

### 2.6 Team Board

Route: `/customer-projects/team`

Visible in primary navigation: manager/admin only.

Purpose: management exceptions and business operating view.

First screen order:

1. management decisions needing action;
2. customer commitments/delivery-critical exceptions;
3. overdue/stalled/missing-next-action Project exceptions;
4. team workload/support needs;
5. old-customer coverage and conversion;
6. business progress/outcomes.

Rules:

- this is not an employee click/message activity monitor;
- do not rank staff by notes, messages, clicks, or raw task count;
- Project/customer details remain drill-down sources;
- manager/admin same-org visibility does not alter Project/customer ownership.

### 2.7 Settings

Route: `/customer-projects/settings`

Visible: admin only.

Reserved configuration categories:

- stage display/configuration based on approved type-specific profiles;
- workflow thresholds after explicit policy approval;
- old-customer follow-up cadence after explicit policy approval;
- integration/source status;
- non-consequential display/configuration.

Rules:

- Phase 3 does not authorize changing canonical customer ownership or financial SoT;
- no schema/RLS/Production controls are implemented by this IA decision;
- defaults must not silently invent business policy.

## 3. Contextual surfaces, not top-level pages

These actions should use a modal, sheet, drawer, or inline panel when implementation permits:

- Quick record
- AI draft confirmation
- Complete/reschedule/cancel WorkItem
- Set/change waiting_on + next_check_at
- Add collaborator/internal collaboration task
- Confirm quote sent
- Confirm customer/commercial/order evidence
- Promote customer follow-up to Project

Reason: these are actions inside work, not destinations employees should navigate to as separate modules.

No separate V1 `AI Inbox` page is approved. Unresolved AI drafts should surface contextually or as Workbench/end-of-day exceptions.

## 4. NAVIGATION_MAP

Primary CPC navigation order:

1. `我的工作台` -> `/customer-projects`
2. `客户` -> `/customer-projects/customers`
3. `项目` -> `/customer-projects/projects`
4. `我的任务` -> `/customer-projects/tasks`
5. `我的报告` -> `/customer-projects/reports`
6. `团队看板` -> `/customer-projects/team` — manager/admin only
7. `设置` -> `/customer-projects/settings` — admin only

Navigation principles:

- Workbench first;
- objects (Customer/Project) before reports;
- tasks are available but do not replace Workbench;
- Daily + Weekly are consolidated into My Reports;
- role-ineligible entries are hidden, not merely disabled;
- phase-not-yet-implemented entries may remain visibly disabled only when that helps communicate staged rollout;
- page visibility is UX only; server/resource authorization remains authoritative.

## 5. ROLE_PAGE_MAP

### Sales

Primary navigation:

- My Workbench
- Customers
- Projects
- My Tasks
- My Reports

Hidden:

- Team Board
- Settings

Resource access:

- page access does not grant access to unrelated customer/project resources;
- enforce the approved Phase 1 relation/resource rules;
- customer ownership remains external authority;
- sales may work with Projects they own and authorized collaboration/assignment relations.

### Manager

Primary navigation:

- My Workbench
- Customers
- Projects
- My Tasks
- My Reports
- Team Board

Hidden:

- Settings

Behavior:

- same-org management visibility is for support, decisions, exception handling, and derived reports;
- manager may have personal assigned tasks, so Workbench/My Tasks remain useful;
- manager access must not silently rewrite customer ownership or Project ownership.

### Admin

Primary navigation:

- all CPC navigation including Settings.

Behavior:

- same-org administrative access;
- domain invariants still apply;
- admin does not bypass append-only event or immutable submitted-report rules.

### Operator

No CPC portal/navigation in V1.

Operator may later participate through explicitly approved collaboration surfaces only if role policy changes. Phase 3 does not broaden access.

### Viewer

No CPC portal/navigation in V1.

Management visibility should use manager/admin roles rather than broad viewer access.

## 6. Route authorization principle

Role-level route access and resource-level authorization are separate.

A user being allowed to open `/customer-projects/projects` does not mean they may read every Project.

Future implementation must resolve:

- authenticated user -> active same-org `profiles.id`;
- role;
- resource relation;
- org scope;

before returning formal CPC data.

Client-side hidden navigation is never an authorization boundary.

## 7. MOBILE_USAGE_MAP

V1 uses the same responsive web application. No separate mobile app is approved.

### Mobile high-frequency surfaces

Must be optimized for phone use:

1. My Workbench / Today queue
2. Quick record
3. complete/reschedule task
4. set waiting/check
5. Customer detail summary + follow-up
6. Project detail summary + record progress
7. internal collaboration request
8. end-of-day exception confirmation

Mobile interaction principles:

- one primary action per screen section;
- cards/compact lists instead of wide mandatory tables;
- important action/context visible before long history;
- avoid multi-column forms for routine capture;
- text entry minimized;
- date/check shortcuts allowed, but consequential confirmation remains explicit;
- attachments/source-artifact references should be accessible without forcing download/re-entry.

### Desktop-first surfaces

These may use denser layouts:

- Customer list bulk review
- Project list with filters
- My Tasks planning/history
- My Reports history/correction review
- Team Board
- Settings

They must remain usable on mobile, but mobile is not required to expose every management column at once.

## 8. Workbench composition contract

The existing root shell has the right conceptual blocks but Phase 3 refines them.

Approved first-screen composition:

1. Today queue
2. Quick record
3. Needs attention / exceptions
4. Waiting/check
5. Today's derived summary

Do not put global team metrics above the employee's own actionable queue.

Do not show mock sales/project numbers.

## 9. Detail-page interaction contract

### Customer detail

Primary action depends on context:

- customer-level follow-up;
- if concrete opportunity exists: create Project.

### Project detail

Primary action:

- record meaningful progress.

Secondary actions:

- complete/change next action;
- set waiting/check;
- create collaboration task;
- manage lifecycle transition when authorized.

Do not make "edit all Project fields" the dominant action.

## 10. Rollout/enablement map

Phase 3 freezes information architecture; it does not require all routes to be enabled immediately.

Suggested enablement sequence aligned to the Master Checklist:

- Phase 5: Workbench, Customers, Projects, My Tasks
- Phase 7: My Reports daily capabilities
- Phase 8: My Reports weekly capabilities
- Phase 9: Team Board
- Phase 10: old-customer policy/configuration expansion
- later approved admin work: Settings

Routes may exist earlier behind feature/role/implementation gates.

## 11. Phase 3 acceptance scenarios

The IA is coherent only if:

1. a sales user can start the day without leaving Workbench to discover today's priority work;
2. an old-customer follow-up can be completed from Customer context without creating a Project;
3. a concrete opportunity can move from Customer context into Project creation without duplicate customer/context entry;
4. a Project owner can record progress and establish next action/check from Project detail;
5. future tasks/history are available without turning My Tasks into a second Today queue;
6. daily and weekly reports share one employee report surface;
7. manager/admin can reach team exceptions without exposing Team Board to sales;
8. admin-only Settings is hidden from manager/sales;
9. operator/viewer do not receive the CPC portal in V1;
10. mobile can perform daily capture without a separate app;
11. route visibility alone cannot expose unrelated resources;
12. disabled shell placeholders can be migrated to the approved navigation before they become active.

## 12. Gate

`PAGE_MAP = PASS_CANDIDATE`

`NAVIGATION_MAP = PASS_CANDIDATE`

`ROLE_PAGE_MAP = PASS_CANDIDATE`

`MOBILE_USAGE_MAP = PASS_CANDIDATE`

`OPEN_BUSINESS_DECISIONS = NONE` for this information-architecture scope.

`PHASE_3_GATE_CANDIDATE = PASS_ON_OWNER_MERGE`.

`BUSINESS_DATABASE_GATE = BLOCKED_BY_PHASE_4_DESIGN`.

After owner merge of Phase 3, Phase 4 may design CPC schema/RLS/authorization/audit contracts. No Production database changes are authorized by Phase 3.

`AUTO_MERGE = false`

`AUTO_PRODUCTION = false`
