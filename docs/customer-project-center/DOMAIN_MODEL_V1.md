# Customer Project Center Domain Model v1

Status: design freeze candidate for Batch 2.

This document defines the domain contracts only. It does not authorize database
changes, migrations, RLS policies, service-role access, API implementation, or
Production deployment.

## Core rules

- Lead is not Customer.
- Customer official ownership and payment truth remain in the external source of truth.
- This repository may hold a controlled Customer Reference/Mapping layer.
- Project is one concrete commercial opportunity, not the customer relationship forever.
- One Project has one Project Owner and zero or more Collaborators.
- Collaborators never change customer ownership.
- Formal business FKs use `profiles.id`, never `auth.users.id`.
- AI produces drafts, not business facts.
- Reports are derived from confirmed events and Work Items, not duplicate data entry.

## A. CustomerReference

CustomerReference is a local mapping to an external canonical customer.

Required fields:

| Field | Contract |
| --- | --- |
| `id` | Local UUID |
| `org_id` | Organization UUID |
| `external_source` | Stable external system identifier |
| `external_customer_id` | Canonical customer identifier in the external system |
| `display_name_snapshot` | Display-only snapshot; refreshable without rewriting history |
| `external_owner_reference` | Optional non-authoritative reference/snapshot only |
| `source_synced_at` | Last successful source synchronization |
| `status` | `active`, `inactive`, or `pending_review` |
| `created_at` / `updated_at` | Audit timestamps |

Identity rule:

`org_id + external_source + external_customer_id` is the unique mapping key.

The helper `buildCustomerReferenceIdentityKey()` serializes all three values as
one unambiguous key. Display-name and owner-reference changes must not alter
historical Project facts.

A temporary or unmatched customer may only become a formal CustomerReference
through a reviewed lifecycle. The proposed lifecycle is recorded as
`PROPOSED-001`; it must not be treated as approved business behavior.

## B. Project

Required fields:

| Field | Contract |
| --- | --- |
| `id` | Local UUID |
| `org_id` | Organization UUID |
| `customer_reference_id` | Same-organization CustomerReference |
| `title` | Concise commercial opportunity title |
| `project_type` | `transfer_film`, `transfer_processing`, `equipment`, `uv`, `other` |
| `owner_profile_id` | Exactly one owner profile |
| `status` | Project lifecycle status |
| `stage` | Type-specific stage code |
| `waiting_on` | Waiting owner or `none` |
| `next_action_summary` | Current agreed next step |
| `next_check_at` | Next review/check time |
| `priority` | Operational priority |
| `version` | Optimistic concurrency version |
| `created_by_profile_id` | Creator profile |
| `created_at` / `updated_at` | Audit timestamps |

Optional fields:

- `risk_level`
- `expected_amount_minor`
- `currency`
- `expected_close_date`

`expected_amount_minor` and `currency` must either both be present or both be
absent. They represent an expected opportunity value only, not a confirmed
order, invoice, receipt, or payment fact.

### Stage profiles

Detailed stage workflow is not frozen. The proposal is:

- common lifecycle status is shared across all project types;
- stage codes may vary by `project_type`;
- a repeat transfer-film order must not be forced through the same stage sequence
  as a first-time equipment project;
- stage changes are explicit audited events, not inferred from every message.

See `PROPOSED-002` in the Decision Log.

## C. ProjectMember / Collaboration

Project ownership remains a single field on Project:

- `owner_profile_id`

Collaborators are separate records:

| Field | Contract |
| --- | --- |
| `id` | Local UUID |
| `org_id` / `project_id` | Same organization and project |
| `profile_id` | Collaborator profile |
| `collaborator_role` | `technical`, `design`, `quality`, `management`, `support` |
| `added_by_profile_id` | Actor who added the collaborator |
| `created_at` | Audit timestamp |

Rules:

- the owner cannot also be a collaborator record;
- duplicate collaborator profile IDs are invalid;
- collaborators may contribute Work Items and events;
- collaboration does not change customer ownership or Project ownership.

## D. FollowUp / ProjectEvent

Recommendation: use **one append-only ProjectEvent ledger**, not a separate
FollowUp table plus a second history table.

Tradeoffs:

- one ledger keeps chronological truth, actor, source, and audit in one place;
- a separate FollowUp table risks duplicate truth and synchronization errors;
- the one-ledger approach requires event-specific payload validation.

ProjectEvent fields:

- `id`, `org_id`
- `customer_reference_id` and/or `project_id`
- `event_type`, `event_category`
- `occurred_at`, `recorded_at`
- `actor_profile_id`
- `source`: `user`, `accepted_ai_draft`, `integration`, or `system`
- `source_reference_id`
- `raw_input`
- structured `payload`
- `correction_of_event_id`

Event categories:

- `CONTACT`: ordinary contact such as `CONTACT_LOGGED`
- `PROGRESS`: explicit effective-progress record
- `WAIT`: waiting/blocker started or resolved
- `COMMERCIAL`: quote, sample, or customer confirmation events
- `LIFECYCLE`: stage, pause, reopen, win, or loss events

Deterministic progress rule:

`projectEventCountsAsEffectiveProgress()` returns true only for explicit
progress/commercial/lifecycle events. Ordinary contact and a generic customer
response do not automatically count as effective progress.

Corrections are appended as new events referencing the corrected event. Events
are not edited in place.

A free-text note is not automatically a formal progress event. It may be stored
as ordinary `CONTACT_LOGGED`, or it may remain an AIDraft until a human confirms
the structured event. This prevents every message from inflating progress
metrics.

## E. WorkItem

WorkItem is a dedicated sales-domain task model. It does not reuse legacy tasks.

Required fields:

- `id`, `org_id`
- optional `customer_reference_id`
- optional `project_id`
- `work_item_type`
- `title`
- `assignee_profile_id`
- `created_by_profile_id`
- `status`
- `priority`
- `version`
- `created_at`, `updated_at`

Optional or lifecycle fields:

- `description`
- `due_at`
- `blocked_reason`
- `completed_at`, `completed_by_profile_id`
- `cancelled_at`, `cancelled_by_profile_id`

Types:

- `NEXT_ACTION`
- `CUSTOMER_COMMITMENT`
- `INTERNAL_COLLABORATION`
- `FOLLOW_UP`
- `MANAGEMENT_DECISION`

Due-date changes create append-only WorkItemReschedule records with:

- previous and new due dates;
- reason;
- actor;
- occurrence time;
- WorkItem version at reschedule.

AI suggestions are not WorkItems and cannot become overdue. They may only become
formal WorkItems after an AIDraft is accepted by an authorized human.

## F. AIDraft

AIDraft is non-authoritative and never mutates formal business data by itself.

Required fields:

- `id`, `org_id`
- `raw_input`
- `structured_proposal`
- `proposal_type`
- optional customer/project references
- `status`
- `created_at`, `updated_at`

Optional fields:

- `confidence`
- `source_model`
- `source_run_id`

Acceptance metadata:

- `accepted_by_profile_id`, `accepted_at`
- `rejected_by_profile_id`, `rejected_at`

Acceptance may create a new ProjectEvent, WorkItem, report narrative, or proposed
field patch. It does not silently confirm customer ownership, payment, won/lost
status, project owner, or other consequential facts.

## G. Daily / Weekly Derived Report Contract

Reports are derived, not manually duplicated.

Deterministic server/SQL calculations:

- counts of confirmed effective-progress events;
- created/completed/rescheduled/overdue Work Items;
- waiting and blocker durations;
- stage and lifecycle changes;
- customer commitments due;
- project-level exceptions based on explicit rules.

Narrative generation:

- AI may summarize deterministic metrics and confirmed events;
- AI narrative is labelled as generated;
- narrative cannot override metric values.

Snapshot semantics:

- period has explicit start, end, and timezone;
- submitted reports are immutable snapshots;
- corrections create a new version with `supersedes_report_id`;
- source watermarks identify the event/WorkItem state used for calculation;
- missing data is `unknown`, never silently interpreted as "no work".

The pure `MetricValue<T>` contract encodes known versus unknown values.

## H. Permissions Matrix

All access is organization-scoped before resource-level checks.

| Role | CustomerRef | Project | Event | WorkItem | AI Draft | Report | Settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| admin | CRUD | CRUD | read/create | CRUD | read/create/accept | read/submit | manage |
| manager | read/create/update | read/create/update | read/create | read/create/update | read/create/accept | read/create/update/submit | read |
| sales owner | read | read/update | read/create | read/create/update | read/create/accept | read/create/update/submit | none |
| sales collaborator | read | read | read/create | read/create/update | read | read | none |
| unrelated sales | none | none | none | none | none | none | none |
| operator | none | none | none | none | none | none | none |
| viewer | none | none | none | none | none | none | none |

This matrix is proposed for the domain layer. It does not replace middleware,
server-side authorization, database RLS, or resource ownership checks.

## I. Audit & Concurrency

Mutable core entities use:

- `version`
- expected-version writes
- append-only audit/history
- same-org composite references where useful

Examples of the intended same-org reference pattern:

- `(org_id, customer_reference_id)` references CustomerReference `(org_id, id)`
- `(org_id, project_id)` references Project `(org_id, id)`
- `(org_id, owner_profile_id)` references a profile in the same organization

Strong audit is required for:

- Project Owner changes
- Project stage changes
- Project lifecycle/status changes
- expected amount/currency changes
- next check date changes
- Work Item due-date/reschedule changes
- Work Item completion/cancellation
- CustomerReference mapping changes
- AI draft acceptance/rejection
- report submission and supersession

Low-friction activity capture remains allowed because ordinary events do not
require a project lifecycle transition.

## J. Domain State Machines

These state machines are deterministic and testable. Business-specific choices
remain proposals until approved.

### Project lifecycle

Proposed states:

- `draft`
- `active`
- `paused`
- `won`
- `lost`
- `cancelled`

Proposed transitions:

- `draft -> active | cancelled`
- `active -> paused | won | lost | cancelled`
- `paused -> active | lost | cancelled`
- `lost -> active | cancelled`
- `won` terminal
- `cancelled` terminal

### Work Item lifecycle

States:

- `pending`
- `in_progress`
- `blocked`
- `completed`
- `cancelled`

Proposed transitions:

- `pending -> in_progress | cancelled`
- `in_progress -> blocked | completed | cancelled`
- `blocked -> in_progress | cancelled`
- `completed` terminal
- `cancelled` terminal

### AI Draft lifecycle

States:

- `draft`
- `accepted`
- `rejected`
- `expired`

Transitions:

- `draft -> accepted | rejected | expired`
- terminal after acceptance, rejection, or expiration

## OPEN_BUSINESS_DECISIONS

- `PROPOSED-001`: Whether an unmatched/manual customer may use a temporary
  CustomerReference, and what evidence/approval is required before formal mapping.
- `PROPOSED-002`: Exact stage profiles for transfer film, transfer processing,
  equipment, UV, and other project types.
- `PROPOSED-003`: Whether a persisted `draft` qualification state is required
  before a Project becomes active.
- `PROPOSED-004`: Whether a lost opportunity is reopened in place or represented
  by a new Project when the customer re-engages.

## OPEN_TECHNICAL_DECISIONS

- Whether event `payload` should use per-event-type Zod schemas immediately or a
  versioned envelope first.
- How report source watermarks should be stored consistently across event and
  WorkItem calculations.
- Whether WorkItem blocked state needs an explicit owner/reminder policy.

## SAFE_TO_IMPLEMENT_NEXT

- Pure domain types and validators.
- Event classification and state-transition tests.
- A non-persistent AIDraft acceptance workflow.
- Read-only contract adapters against the external customer source, once access
  and authority are approved.
- Report metric calculation specs derived from confirmed events and WorkItems.

## MUST_NOT_IMPLEMENT_YET

- Customer/project database tables
- Supabase migrations or RLS
- Service-role customer data access
- Production environment changes
- Competing customer ownership or payment truth
- AI writes to consequential business facts without human confirmation
- Legacy `tasks`, `leads`, `site_data`, or `/api/data` reuse as source of truth
