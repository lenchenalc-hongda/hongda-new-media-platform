# Customer Project Center Decision Log

## Approved decisions

### DEC-001: External canonical customer source of truth

Customer ownership and payment truth remain in the external source of truth.
This repository may hold a CustomerReference/Mapping layer for project use.

### DEC-002: Lead is not Customer

Lead remains acquisition-side. Customer is a formal customer entity. Project is
created only for a concrete commercial opportunity.

### DEC-003: Project means one concrete commercial opportunity

Project is not the permanent customer relationship. Customer-level follow-up may
exist without a Project.

### DEC-004: One Project Owner plus collaborators

Each Project has one owner profile and may have multiple collaborators.
Collaboration does not change customer ownership.

### DEC-005: Dedicated sales WorkItem

Customer Project Center uses a dedicated sales WorkItem model and does not reuse
legacy tasks.

### DEC-006: Reports are derived

Daily and weekly reports derive from confirmed events, Work Items, follow-ups,
and deterministic metrics. Employees do not re-enter the same progress.

### DEC-007: AI proposals require human confirmation

AI produces drafts. Consequential business facts are not changed without an
authorized human acceptance step.

### DEC-008: Provisional CustomerReference

A prospect with a concrete opportunity may temporarily use a clearly marked
provisional CustomerReference before an external canonical customer ID exists.

Rules:

- never use a fake external customer ID;
- canonical and provisional references are structurally distinguishable;
- provisional mapping does not create customer ownership or payment truth;
- before `won` or future order/payment linkage, the provisional reference must
  be mapped to a canonical external customer;
- merge/remap is audited.

### DEC-009: No persisted Project draft state

Do not persist a formal Project merely for incomplete qualification.

Before a concrete opportunity exists, work remains Lead, customer-level
follow-up, or AI draft. A formal Project starts as `active`.

### DEC-010: Lost Project reopen policy

The same commercial opportunity may transition `lost -> active` with an audited
reopen reason. A materially new objective, order, or opportunity creates a new
Project.

### DEC-011: WorkItem blocked state

Keep explicit `blocked` status.

- blocked is context, not a deadline waiver;
- blocked Work Items can still be overdue;
- only explicit rescheduling changes `due_at`;
- reschedule history is preserved.

### DEC-012: Event payload versioning

ProjectEvent uses an explicit `payload_schema_version`. Keep a versioned
envelope and add stricter per-event schemas incrementally.

### DEC-013: Report correction model

Submitted reports are immutable. A correction creates a new snapshot/version
linked through `supersedes_report_id`. Historical submitted content is never
mutated in place.

### DEC-014: Project stage strategy

Common lifecycle is shared. Stage is operational position and remains separate
from lifecycle status. Stage codes are type-specific configurable strings and
must not become database enum constraints. Repeat transfer-film business must
not be forced through equipment-style stages.

The exact V1 stage profiles are governed separately by the Phase 1 merge-gated
decision below so this previously approved strategy does not pre-approve the
new profile values before owner merge.

### DEC-015: Low-friction modernization over process preservation

Current tools describe today's work; they are not requirements to preserve forever.

New CPC workflows should:

- remove or replace an existing manual step rather than add duplicate entry;
- derive structured metadata from actions/files/events employees already perform where practical;
- keep current operational artifacts available during transition;
- prefer gradual cutover over a disruptive all-at-once replacement;
- never use "automation" as a reason to change customer ownership, financial truth or other consequential facts without the correct authority.

### DEC-016: No unified order source exists today

The business currently has no unified order system across Dongguan and Shantou.

For Dongguan work that requires Shantou transfer-film / fixture production, the current handoff is a production instruction sheet sent through QQ.

Implications:

- QQ is transport, not order source of truth;
- historical QQ traffic must not be retroactively treated as a canonical order ledger;
- future CPC may create a structured order/project coordination model because there is no existing unified order SoT to duplicate;
- migration should preserve the production-instruction handoff until the replacement flow is proven.

### DEC-017: Formal quotation artifact is Excel in WeCom

Formal quotations are currently Excel files stored/shared in WeCom. No structured quote-number/version/acceptance system is established.

Implications:

- preserve the original quotation file as the source artifact during transition;
- future CPC may add structured quotation metadata, versioning and acceptance evidence only if captured from the same workflow;
- employees should not re-enter quotation data solely to satisfy CPC;
- chat text or AI output cannot by itself establish quote acceptance.

### DEC-018: WhatsApp automatic synchronization remains backlog for V1

WhatsApp remains an operational communication channel. Automatic customer/conversation synchronization is not required for V1 and does not block Phase 0.

## Phase 1 approved decisions

Owner-approved PR #43 merged `CPC-P1-BUSINESS-MODEL-FREEZE-001`; DEC-019 through DEC-022 are approved.

### DEC-019: Customer-level follow-up versus Project creation

Routine old-customer relationship follow-up stays customer-level. Create a
Project only when a concrete commercial opportunity exists. Customer-level
ProjectEvent/WorkItem may carry `customer_reference_id` with `project_id = null`.

### DEC-020: Repeat/reorder fast path

Repeat/reorder work may start at a later valid type-specific stage only when
existing specification, artwork, material, process, fixture, application
requirements, quality requirements, and risk facts remain unchanged. Relevant
changes return the work to the applicable validation stage.

### DEC-021: Frozen V1 stage profiles

Freeze the five Phase 1 V1 stage profiles in
`PHASE_1_BUSINESS_MODEL_FREEZE.md`. Stage codes remain configurable strings,
not database enums.

### DEC-022: NEXT_ACTION single source

`WorkItem NEXT_ACTION` is the actionable task source of truth.
`Project.next_action_summary` is a projection/summary only. Waiting is modeled
with `waiting_on` plus `next_check_at` without duplicate reminder rows.

## Resolved deferrals

### DEFERRED-001: Exact project stage profiles — resolved

Resolved by approved DEC-021 through owner-merged PR #43.

## Change rule

New business decisions remain open until the business owner or designated PM
approves them. Approved choices must not drift back into proposal status.


## Phase 2 approved decisions

Owner-approved PR #44 merged `CPC-P2-EMPLOYEE-DAILY-WORKFLOW-001`; DEC-023 through DEC-027 are approved.

### DEC-023: Today queue is derived, not manually rebuilt

Morning work is derived from confirmed NEXT_ACTION, commitments, due waiting/check states, blockers, stale/missing-action exceptions, and already-due customer-level follow-up. Employees do not rewrite a separate daily plan.

Workflow priority classes are: P0 commitments/critical blockers, P1 due work, P2 missing-action/stale-project exceptions, then P3 already-due relationship follow-up. Exact scoring, stale thresholds, and old-customer cadence values are not invented by Phase 2.

### DEC-024: Meaningful update and next action are one employee confirmation

Where practical, one confirmation records the meaningful business change and establishes the next action or waiting/check state. The same confirmed facts feed history, daily report, weekly report, and management views.

### DEC-025: End-of-day is exception review, not duplicate reporting

End-of-day work focuses on missing next actions/checks, corrections, reschedules, important unknowns, and confirmation of the derived day summary. If daytime capture is complete, little or no manual narrative is required.

### DEC-026: Waiting state replaces duplicate reminder rows

When the next move belongs to another party, use `waiting_on + next_check_at`. The same obligation must not also generate repeated reminder WorkItems.

### DEC-027: Routine old-customer work remains customer-level in the daily workflow

Due old-customer follow-up appears in the same daily work queue without creating a Project. When a concrete opportunity appears, promotion to Project reuses customer/context and applies the Phase 1 Project creation invariant.


## Phase 3 merge-gated decisions

Approval rule for `CPC-P3-INFORMATION-ARCHITECTURE-001`: while these entries are on an unmerged PR they are candidates; owner merge of that PR is the approval act.

### DEC-028: Workbench is the primary CPC home

`/customer-projects` is the default daily work surface. Today's prioritized work appears before management metrics, reports, or broad object browsing.

### DEC-029: CPC primary navigation is compact and role-aware

Primary navigation is My Workbench, Customers, Projects, My Tasks, My Reports, Team Board, Settings. Team Board is manager/admin only; Settings is admin only. Operator/viewer do not receive CPC portal access in V1.

### DEC-030: Daily and weekly reports share one My Reports surface

Replace the current disabled Daily + Weekly top-level placeholders with one `/customer-projects/reports` entry using a period selector/tabs. Reporting is a derived output, not two independent employee workflows.

### DEC-031: Customer and Project detail are the main contextual work surfaces

Old-customer follow-up happens from Customer context; concrete opportunity progress happens from Project context. Quick record, waiting/check, task completion/reschedule, collaboration, and consequential confirmation are contextual actions rather than separate top-level modules.

### DEC-032: Mobile uses the same responsive CPC routes

V1 does not create a separate mobile app. Mobile prioritizes Workbench, quick record, task actions, waiting/check, Customer/Project context, and end-of-day exceptions.

### DEC-033: Route visibility is not resource authorization

Role-based navigation controls UX only. Formal CPC reads/writes still require authenticated same-org profile resolution plus role/resource-relation authorization.

### DEC-034: Team Board is an exception/support view, not employee activity surveillance

Management views prioritize decisions, commitments, stalled/missing-action Projects, old-customer coverage, workload/support needs, and business outcomes. Raw notes/messages/clicks/task count are not staff performance rankings.
