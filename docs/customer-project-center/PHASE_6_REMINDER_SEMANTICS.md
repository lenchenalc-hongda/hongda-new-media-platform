# Customer Project Center Phase 6A — Reminder Semantics Freeze

Status: merge-gated candidate for `CPC-P6A-REMINDER-SEMANTICS-001`.

Approval gate: owner merge of the Draft PR containing this document.

Phase 6A freezes the **meaning of reminders** before any notification delivery, push cadence, message channel, or Production execution is introduced.

It does not execute migrations, change Production RLS, send notifications, create scheduled jobs, or invent stale-project / old-customer cadence values.

## 1. Goal

Phase 6 must help employees avoid missing confirmed work without creating a second task system.

The rule is:

> Formal reminders are projections from existing confirmed obligations. AI suggestions are proposals. They are not the same thing.

The system must preserve the distinction between:

1. confirmed obligation or check time;
2. derived reminder visibility;
3. AI suggestion;
4. optional future notification delivery.

Only item 1 is business truth.

## 2. Source-of-truth hierarchy

### 2.1 Formal obligations

Formal reminder-eligible facts come from existing CPC truth:

- open `NEXT_ACTION` WorkItem with `due_at`;
- open `CUSTOMER_COMMITMENT` WorkItem with `due_at`;
- open `INTERNAL_COLLABORATION` WorkItem with `due_at`;
- open `MANAGEMENT_DECISION` WorkItem with `due_at`;
- open customer-level `FOLLOW_UP` WorkItem with `due_at`;
- Project waiting/check state with `waiting_on != none` plus `next_check_at`.

The source row remains authoritative.

Reminder surfaces must not create a duplicate WorkItem merely to show that the source is due.

### 2.2 Derived exceptions

The following may appear as workflow exceptions but are not independent reminder truth:

- active Project missing a valid NEXT_ACTION / waiting-check invariant;
- blocked WorkItem that remains due/overdue;
- other deterministic integrity exceptions already approved by the daily workflow.

### 2.3 AI suggestions

AI may propose:

- a suggested next action;
- a suggested follow-up;
- a suggested reschedule;
- a suggested check date;
- a suggested management attention item.

Until an authorized human accepts the proposal through the same domain mutation used for a manual action:

- it is not a WorkItem;
- it is not a commitment;
- it is not overdue;
- it is not a missed KPI;
- it must not enter deterministic reminder counts;
- it must not change Project/customer ownership or other consequential facts.

## 3. Reminder classes

Phase 6A keeps the Phase 2 priority contract.

### P0 — confirmed commitment / critical

Examples:

- overdue or due-today `CUSTOMER_COMMITMENT`;
- explicit management decision blocking a confirmed customer/delivery commitment;
- other already-confirmed critical obligation represented by approved WorkItem truth.

P0 is based on confirmed source facts, not AI scoring.

### P1 — due work

Examples:

- overdue / due `NEXT_ACTION`;
- overdue / due internal collaboration;
- Project waiting/check whose `next_check_at` is due.

### P2 — deterministic project hygiene

Examples:

- active Project missing the required next-action or waiting/check state.

A stale-project reminder is **not enabled** until a stale threshold is separately approved.

### P3 — relationship work

Customer-level `FOLLOW_UP` becomes due only when a formal FOLLOW_UP already exists with `due_at`.

Phase 6A does not create follow-ups automatically from a 30/60/90-day rule.

## 4. Due / overdue semantics

For a formal WorkItem:

- `due_at > now` => not yet due;
- `due_at <= now` and open status => due/overdue according to UI time bucket;
- terminal `completed | cancelled` => no active reminder.

For a Project waiting/check state:

- `next_check_at > now` => not yet due;
- `next_check_at <= now` while the Project remains in that waiting/check state => due;
- changing or clearing the waiting/check state removes the derived reminder.

Phase 6A does not introduce a "due soon" window. That is a later policy decision.

## 5. Blocked does not waive the deadline

Existing DEC-011 remains authoritative.

A blocked WorkItem:

- remains open;
- keeps its original `due_at`;
- can remain overdue;
- is not silently rescheduled because it became blocked.

If the real commitment date changes, the user must perform an explicit authorized reschedule/change.

This preserves the distinction between:

- "we are blocked"; and
- "the deadline changed".

## 6. Reschedule and history

A reminder never owns the due date.

When a date changes:

1. update the source obligation through an approved domain mutation;
2. preserve before/after values in CPC audit history;
3. increment the source version where applicable;
4. derive current reminder visibility from the new effective due/check time.

The old due date remains historical evidence.

The UI must not show both old and new dates as two active reminder obligations.

## 7. No duplicate reminder rows

### 7.1 Current derived surfaces

Workbench / Today / My Tasks may display the same underlying obligation in different contexts, but they must reference the same source identity.

No additional persisted "reminder WorkItem" is created.

### 7.2 Future notification delivery

If Phase 6B later introduces push/email/app delivery logs, delivery dedup must use an occurrence identity derived from the underlying obligation, for example:

`source_type + source_id + effective_due_at + channel + delivery_policy_version`

This is an operational delivery key, not a second business truth.

Consequences:

- changing unrelated source fields must not create duplicate reminder delivery;
- an explicit reschedule creates a new effective reminder occurrence;
- repeated scheduler runs must be idempotent for the same occurrence;
- delivery history may be persisted later only as delivery/audit metadata.

No `cpc_reminders` business table is approved by Phase 6A.

## 8. Waiting/check reminder rule

DEC-026, DEC-036 and DEC-045 remain unchanged.

When another party owns the next move:

- keep Project `waiting_on`;
- keep `next_check_at`;
- derive Today/reminder visibility when the check becomes due;
- do not create a NEXT_ACTION or reminder WorkItem solely for the same waiting obligation.

If the waiting party changes or the check date changes, update the Project state through the existing authorized mutation and preserve audit history.

## 9. Customer relationship reminders

Routine old-customer work remains customer-level.

A formal customer reminder exists only when:

- there is an open customer-level `FOLLOW_UP`; and
- it has a due time.

Phase 6A does not approve:

- automatic "all customers every N days" follow-up;
- automatic follow-up creation from last-contact age;
- AI-generated relationship suggestions as formal overdue work.

Those can be considered later only with an explicit business policy.

## 10. AI suggestion separation

AI suggestion surfaces must be visually and semantically separate from formal due work.

Recommended labels:

- "AI 建议"
- "建议下一步"
- "建议检查时间"

Prohibited AI labels before acceptance:

- "逾期"
- "未完成承诺"
- "客户承诺已超时"
- any employee-performance implication

Acceptance rule:

`AI proposal -> human review -> approved domain mutation -> formal source fact -> derived reminder eligibility`

The acceptance step must not bypass the same permission, validation, expected-version, audit, and business invariant used by a human manual action.

## 11. Reminder cancellation / completion

A derived reminder disappears from active reminder surfaces only because the source state changes.

Examples:

- WorkItem completed;
- WorkItem cancelled;
- due date explicitly moved into the future;
- waiting/check state cleared or rescheduled;
- Project transitions to a lifecycle state where the source obligation is resolved under approved domain rules.

"Dismiss reminder" is not a business-state mutation.

Phase 6A does not approve a permanent dismiss action that hides an unresolved confirmed obligation.

A future UI may support local/session-level temporary hiding only if it does not change business truth or team-visible status; that is not required for V1.

## 12. Reporting and performance boundary

Reminder counts are operational support signals.

They must not be converted into employee performance scores merely from:

- number of reminders;
- number of AI suggestions;
- number of messages;
- raw overdue count without business context.

Confirmed commitment fulfillment and substantive progress may feed later management views under the approved Phase 7–9 rules.

AI suggestion rejection/ignore history must not be treated as employee underperformance.

## 13. Phase 6A implementation boundary

This phase approves semantics/design only.

Allowed follow-up implementation in Phase 6B+ may include:

- deterministic reminder/read-model projection;
- reminder badges/sections based on existing source facts;
- operational notification delivery log if separately designed;
- idempotent scheduled delivery if explicitly approved;
- AI suggestion surface clearly separated from formal reminders.

Not approved by Phase 6A:

- Production scheduler deployment;
- automatic email/WeCom/WhatsApp push;
- notification frequency;
- "due soon" window;
- stale-project days;
- old-customer follow-up cadence;
- automatic creation of relationship follow-up;
- employee performance scoring;
- Production SQL/RLS.

## 14. Deferred policy values

The following remain intentionally unset:

- `STALE_PROJECT_THRESHOLD_DAYS`;
- `OLD_CUSTOMER_FOLLOW_UP_CADENCE`;
- `REMINDER_DUE_SOON_WINDOW`;
- `NOTIFICATION_CHANNELS`;
- `NOTIFICATION_REPEAT_CADENCE`;
- `QUIET_HOURS`;
- escalation-after-N-reminders policy.

These require later business/product decisions.

Their absence does not block deterministic due/overdue semantics for already-confirmed source obligations.

## 15. Phase 6A gate candidate

- `FORMAL_REMINDER_SOURCE = EXISTING_CONFIRMED_OBLIGATION`
- `REMINDER_STORAGE = DERIVED_NOT_SECOND_WORKITEM`
- `AI_SUGGESTION = NON_AUTHORITATIVE_UNTIL_ACCEPTED`
- `BLOCKED_DEADLINE_WAIVER = FALSE`
- `RESCHEDULE_HISTORY = PRESERVED`
- `DUPLICATE_ACTIVE_REMINDER = PROHIBITED`
- `STALE_THRESHOLD = DEFERRED`
- `OLD_CUSTOMER_CADENCE = DEFERRED`
- `NOTIFICATION_DELIVERY = NOT_AUTHORIZED`
- `PRODUCTION_DATABASE_GATE = CLOSED`
- `OPEN_PHASE_6A_DECISIONS = NONE`
- `PHASE_6A_GATE_CANDIDATE = PASS_ON_OWNER_MERGE`
- `AUTO_MERGE = false`
- `AUTO_PRODUCTION = false`
