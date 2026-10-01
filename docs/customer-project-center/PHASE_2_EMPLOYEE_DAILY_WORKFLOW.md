# Customer Project Center Phase 2 Employee Daily Workflow

Status: merge-gated candidate for `CPC-P2-EMPLOYEE-DAILY-WORKFLOW-001`.

Approval gate: owner merge of the Draft PR containing this document. This phase freezes employee workflow only. It does not authorize schema, migration, RLS, Production, or final page/navigation implementation.

## 1. Goal

The system should help each project owner know what to advance today and leave only the minimum structured facts needed for downstream reminders, daily/weekly reports, and management views.

The workflow must reduce work, not create a second reporting layer.

Primary user in Phase 2: sales/project owner.

Management consumes derived status and exceptions; management does not require employees to separately rewrite the same progress.

## 2. Daily operating model

The employee day has four workflow moments:

1. `MORNING_FLOW`
2. `WORKING_FLOW`
3. `END_OF_DAY_FLOW`
4. `DAILY_REPORT_FLOW`

These are workflow contracts, not page names.

## 3. MORNING_FLOW

At the start of the day, the employee receives one prioritized work queue derived from confirmed business facts.

The queue may contain:

- overdue NEXT_ACTION;
- NEXT_ACTION due today;
- CUSTOMER_COMMITMENT due/overdue;
- project/customer waiting checks whose `next_check_at` is due;
- blocked items needing an employee action;
- active Projects with no valid next action/check;
- stale active Projects that exceeded an approved no-progress threshold;
- customer-level old-customer FOLLOW_UP already due under an approved cadence/source;
- explicit MANAGEMENT_DECISION items assigned back to the employee.

Priority classes are frozen at workflow level:

1. `P0 commitment/critical`: overdue or due-today customer commitments, delivery/order-critical blockers, and explicit management decisions blocking delivery or customer commitment;
2. `P1 due work`: overdue/due NEXT_ACTION and due waiting/check states;
3. `P2 project hygiene`: active Projects missing a valid next action/check, then stale active Projects;
4. `P3 relationship work`: already-due customer-level old-customer follow-up.

Exact scoring, stale-day thresholds, and old-customer cadence values are configuration/policy decisions for later phases. Phase 2 does not invent them.

Morning behavior:

1. Review the prioritized queue.
2. Confirm only exceptions:
   - wrong owner/assignee;
   - task no longer valid;
   - missing customer/project context;
   - schedule changed;
   - item should be cancelled/paused.
3. Start work from the queue.

The employee does not manually rewrite a daily plan from scratch.

### MORNING_FLOW replaces

| Current/manual behavior | Phase 2 replacement |
| --- | --- |
| Remembering projects from chat history or memory | Derived Today queue |
| Manually making a separate personal to-do list for project work | Confirm/use NEXT_ACTION queue |
| Repeated manual status chasing about “what are you advancing today?” | Management reads derived queue/exceptions |
| Manually scanning the whole customer list to remember follow-up | Only already-due customer-level FOLLOW_UP appears |

## 4. WORKING_FLOW

The normal unit of capture is a meaningful business change, not every message.

A working update should usually be completed in one confirmation step:

`what changed -> structured fact -> current stage/waiting state if changed -> next action/check`

The system may prepare an AI draft from employee input or source artifacts, but the employee confirms consequential facts.

### 4.1 Quick progress update

Use when a meaningful change happened:

- customer provided a requirement;
- artwork/material/process details became clear;
- quote was formally sent;
- sample/plate/trial was sent or completed;
- customer confirmed a result;
- order evidence was confirmed;
- production/delivery/install/training milestone changed;
- a meaningful blocker appeared;
- project was paused/lost/reopened/won/cancelled.

One confirmation should create/update the appropriate confirmed ProjectEvent and refresh the next action or waiting/check state.

Do not ask the employee to separately update:
- project history;
- current stage;
- “today progress” text;
- daily report text;
- weekly report text.

### 4.2 Customer reply with no meaningful change

If the customer merely replies, acknowledges, chats, or says “still checking”, do not force a progress event.

The employee may:
- keep current NEXT_ACTION;
- switch to `waiting_on = customer`;
- set/update `next_check_at`;
- add a brief ordinary-contact note only when useful.

Ordinary contact does not count as effective progress automatically.

### 4.3 Waiting state

When the next move belongs to customer, factory, technical colleague, supplier, management, or another party:

1. set `waiting_on`;
2. set `next_check_at`;
3. close/replace the prior employee NEXT_ACTION if appropriate.

Do not create repeated reminder WorkItems for the same waiting obligation.

When the check time arrives, the existing waiting state re-enters the Today queue.

### 4.4 Internal collaboration

If the owner needs technical/design/quality/management help, create an `INTERNAL_COLLABORATION` or `MANAGEMENT_DECISION` WorkItem.

The Project Owner remains the owner.

The collaborator task should reference the same customer/project and return a result to the Project; it must not create a second project-management record.

### 4.5 Quote workflow

When a formal Excel quotation is sent through the current WeCom workflow:

- record `QUOTE_SENT`;
- preserve/reference the source quotation artifact;
- set the next action or waiting/check state.

Do not ask the employee to re-enter the quotation solely for CPC.

`QUOTE_SENT` never means accepted.

### 4.6 Customer/commercial confirmation

`CUSTOMER_CONFIRMED`, equipment `commercial_confirmation`, and `order_confirmed` require explicit human confirmation and evidence context.

AI or chat parsing may propose the update but cannot confirm it.

### 4.7 Repeat/reorder

For a repeat/reorder:

1. employee confirms whether specification, artwork, material, process, fixture/application requirement, quality requirement, and relevant risk are unchanged;
2. unchanged work may start at the later valid stage;
3. changed facts return the Project to the relevant validation stage;
4. the employee should not recreate the full historical process.

### 4.8 Old-customer follow-up

Routine old-customer outreach stays customer-level.

Phase 2 consumes only follow-up that is already due from an approved cadence, explicit employee schedule, or later approved old-customer policy. It does not mass-create follow-up tasks for every old customer.

The employee may record:
- meaningful relationship follow-up result;
- next relationship action;
- next check/due time.

Only when a concrete commercial opportunity appears does the employee create a Project.

Promotion from customer follow-up to Project should reuse the existing customer and recent confirmed context rather than require duplicate re-entry.

### 4.9 Order / production handoff boundary

After human-confirmed order evidence, CPC may create the next owner action or an internal collaboration/handoff item. It does not treat current QQ production-instruction traffic as the canonical order ledger.

The existing Dongguan-to-Shantou production-instruction handoff remains usable during transition until a later approved workflow replaces it. Employees should not re-enter the same production instruction solely to satisfy CPC.

### 4.10 New Project creation

Create a Project only when the Phase 1 creation invariant is satisfied:

- CustomerReference;
- concrete need/objective;
- project type;
- one owner;
- valid starting stage;
- priority;
- NEXT_ACTION or explicit waiting/check state.

Project creation should capture these in one guided action, not as a multi-form administrative process.

## 5. Working update replacement map

| New CPC operation | Replaces / avoids |
| --- | --- |
| Confirm meaningful progress + next action together | Separate progress log + task creation + daily report entry |
| Set waiting_on + next_check_at | Repeated self-reminders and duplicate follow-up tasks |
| Confirm formal quote sent | Avoids adding a second CPC-only quotation-status re-entry |
| Create internal collaboration item | Chat-only handoff with no clear owner/due/result |
| Customer-level old-customer follow-up | Creating fake Projects just to remember a relationship |
| Promote concrete opportunity to Project | Re-entering customer and recent follow-up context |
| Repeat/reorder fast path | Replaying every first-order stage |
| Confirm consequential AI draft | Manual reconstruction of structured fields from free text |

## 6. END_OF_DAY_FLOW

The end-of-day flow is an exception review, not a second report-writing session.

The employee sees:

- completed meaningful work automatically derived from confirmed facts;
- open NEXT_ACTION items;
- due/overdue commitments;
- waiting/check items;
- active Projects with missing next action/check;
- unresolved drafts/unknowns that need confirmation;
- old-customer follow-ups completed/due.

Employee actions should be limited to:

1. resolve missing next action/check on active Projects;
2. correct wrong or incomplete confirmed facts;
3. reschedule/cancel tasks with a reason where necessary;
4. resolve important unknowns;
5. make one confirmation that the derived day summary is materially correct.

If all work was captured during the day, end-of-day should require no project-by-project rewriting and normally only a brief exception check plus one confirmation.

### END_OF_DAY_FLOW replaces

| Current/manual behavior | Phase 2 replacement |
| --- | --- |
| Recalling the whole day from memory | Derived confirmed activity |
| Writing a separate project-by-project daily report | Exception review + confirmation |
| Copying tasks into tomorrow manually | Open NEXT_ACTION/waiting automatically rolls forward |
| Manager chasing missing progress | System flags active Projects missing next action/check |

## 7. DAILY_REPORT_FLOW

Daily report data is derived from confirmed facts.

Deterministic facts include:

- meaningful progress events;
- stage/lifecycle/waiting changes;
- NEXT_ACTION completed/created/rescheduled;
- CUSTOMER_COMMITMENT due/completed/overdue;
- internal collaboration outcomes;
- old-customer follow-up activity;
- Projects with no progress or no next action;
- explicit blockers and management decisions.

AI may draft a short narrative from those facts.

The employee confirms/corrects the draft; the employee does not retype the same facts.

Submitted report snapshots remain immutable under the Phase 1 domain rules.

If source data is incomplete, the report says `unknown / needs confirmation`, not “no work”.

## 8. What must not become employee KPIs

Do not evaluate employees by:

- number of messages recorded;
- number of notes;
- number of clicks;
- number of AI drafts;
- number of created tasks by itself.

Management signals should focus on:

- substantive progress;
- commitment fulfillment;
- overdue obligations;
- stalled Projects;
- active Projects without next action/check;
- old-customer coverage and conversion;
- business outcomes.

## 9. Low-friction capture rules

- No mandatory logging of every chat.
- No duplicate daily-report entry.
- No duplicate project-status spreadsheet maintained solely for CPC.
- No duplicate reminder row when waiting/check state already represents the obligation.
- No duplicate customer creation for old-customer follow-up.
- No Project creation without a concrete opportunity.
- No automatic AI confirmation of consequential facts.
- Source artifacts remain usable during transition.
- Mobile capture should be possible later, but final mobile/page design belongs to Phase 3.

## 10. Phase 2 acceptance scenarios

Phase 2 workflow is considered coherent only if these scenarios work without duplicate entry:

1. New-media lead remains acquisition-side until it becomes a concrete transfer-film opportunity; only then is a Project created.
2. Existing customer routine follow-up produces no opportunity.
3. Existing customer follow-up produces a repeat transfer-film order with unchanged artwork/process.
4. Existing customer reorder changes material/artwork and returns to validation.
5. Quote is sent, customer has not accepted, employee waits three days.
6. Customer confirms sample; owner creates next action in the same confirmation.
7. Owner needs technical support; collaborator receives one internal task while Project ownership stays unchanged.
8. Equipment opportunity moves through validation and human-confirmed commercial confirmation.
9. Confirmed order needs Dongguan-to-Shantou production handoff without CPC pretending QQ is an order SoT.
10. Employee works all day and end-of-day report is generated without retyping progress.
11. Active Project has no next action/check and is surfaced as an exception before day end.

## 11. Phase 2 gate

`OPEN_BUSINESS_DECISIONS = NONE` for this workflow scope.

`PHASE_2_GATE_CANDIDATE = PASS_ON_OWNER_MERGE`.

`BUSINESS_DATABASE_GATE = BLOCKED_BY_PHASE_3_AND_PHASE_4_DESIGN`.

Phase 3 may design pages/navigation/mobile usage only after this workflow contract is accepted. Phase 4 schema/RLS/authorization/audit remains blocked until Phase 3 also passes.

`AUTO_MERGE = false`

`AUTO_PRODUCTION = false`
