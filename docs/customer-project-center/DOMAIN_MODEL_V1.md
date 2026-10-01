# Customer Project Center Domain Model v1

Status: domain freeze candidate updated by Phase 1 business-model freeze task `CPC-P1-BUSINESS-MODEL-FREEZE-001`; owner merge remains the approval gate.

This document defines domain contracts only. It does not authorize database
changes, migrations, RLS policies, service-role access, API implementation, or
Production deployment.

## Core rules

- Lead is not Customer.
- Customer official ownership and payment truth remain outside this repository.
- This repository may hold canonical and clearly provisional CustomerReference mappings.
- Project is one concrete commercial opportunity, not the lifetime customer relationship.
- Routine old-customer relationship follow-up remains customer-level until a concrete opportunity exists.
- Customer-level ProjectEvent/WorkItem may carry `customer_reference_id` with `project_id = null`.
- A formal Project starts as `active`; incomplete qualification remains Lead,
  customer-level follow-up, or an AI draft.
- One Project has one Project Owner and zero or more Collaborators.
- Collaborators never change customer ownership.
- Formal business FKs use `profiles.id`, never `auth.users.id`.
- AI produces drafts, not business facts.
- Reports are derived from confirmed events and Work Items, not duplicate data entry.

## A. CustomerReference

CustomerReference has two structurally distinct kinds.

### Canonical reference

Required fields:

| Field | Contract |
| --- | --- |
| `id` | Local UUID |
| `org_id` | Organization UUID |
| `reference_kind` | `canonical` |
| `external_source` | Stable external system identifier |
| `external_customer_id` | Canonical customer ID in the external system |
| `display_name_snapshot` | Display-only snapshot |
| `external_owner_reference` | Optional non-authoritative snapshot/reference |
| `source_synced_at` | Last successful source synchronization |
| `status` | `active` or `inactive` |
| `created_at` / `updated_at` | Audit timestamps |

Canonical identity is unique by:

`org_id + external_source + external_customer_id`

### Provisional reference

Required fields:

| Field | Contract |
| --- | --- |
| `id` | Local UUID |
| `org_id` | Organization UUID |
| `reference_kind` | `provisional` |
| `provisional_source_reference` | Lead/manual/import reference |
| `display_name_snapshot` | Display name |
| `status` | `pending_review` |
| `mapped_canonical_reference_id` | Canonical mapping once reviewed |
| `created_by_profile_id` | Creator profile |
| `created_at` / `updated_at` | Audit timestamps |

Provisional rules:

- a provisional record must never use a fake `external_customer_id`;
- it does not create ownership or payment truth;
- a Project using a provisional reference cannot be marked `won`;
- before future order/payment linkage or `won`, it must be remapped to a
  canonical reference;
- merge/remap is audited.

The identity-key helper applies only to canonical references.

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
| `status` | `active`, `paused`, `won`, `lost`, `cancelled` |
| `stage` | Type-specific/configurable stage code |
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

Rules:

- there is no persisted formal Project `draft` state;
- a Project begins at `active` when a concrete opportunity exists;
- Project creation requires a CustomerReference, concrete objective/need, project type,
  exactly one owner, an initial valid type-specific stage, priority, and either a
  concrete NEXT_ACTION or an explicit waiting/check state;
- `expected_amount_minor` and `currency` must both be present or both be absent;
- expected amount means expected opportunity value only, not confirmed order or payment;
- a paused Project requires `next_check_at`;
- a pause lifecycle event requires an audited pause reason.

### Stage strategy

Common lifecycle status is shared. Stage is operational position, separate from
lifecycle status, and stage codes remain configurable strings rather than
database enums.

Phase 1 freezes these V1 profiles:

- `transfer_film`: `requirement_alignment -> artwork_material_alignment -> quotation -> sampling_or_plate -> customer_confirmation -> order_confirmed -> production -> delivery`
- `transfer_processing`: `requirement_alignment -> material_fixture_process_alignment -> quotation -> trial_sample -> customer_confirmation -> order_confirmed -> production -> delivery`
- `equipment`: `application_assessment -> solution_definition -> validation_or_demo -> quotation_negotiation -> commercial_confirmation -> production -> delivery_installation -> acceptance_training`
- `uv`: `application_assessment -> sample_validation -> quotation -> customer_confirmation -> order_confirmed -> production -> delivery`
- `other`: `qualification -> solution -> quotation -> validation -> customer_confirmation -> fulfillment -> delivery`

Repeat/reorder work may enter at a later valid stage only when existing
specification, artwork, material, process, fixture, application requirements,
quality requirements, and risk facts remain unchanged. Relevant changes return
the Project to the applicable validation stage. Repeat transfer-film business
must never be forced through equipment-style stages.

## C. ProjectMember / Collaboration

Project keeps the single owner in `owner_profile_id`.

Collaborators are separate records:

- `id`, `org_id`, `project_id`
- `profile_id`
- `collaborator_role`: `technical`, `design`, `quality`, `management`, `support`
- `added_by_profile_id`
- `created_at`

Rules:

- owner cannot also be a collaborator record;
- collaborator profile IDs are unique per Project;
- collaborators may create events and Work Items;
- collaborators cannot change customer ownership or Project core fields.

## D. FollowUp / ProjectEvent

Recommendation: one append-only ProjectEvent ledger.

Tradeoffs:

- one ledger preserves actor, source, occurrence, recording time, and audit in
  one chronological truth;
- separate FollowUp and history tables risk duplicate facts and drift;
- event-type payload validation must be added incrementally.

ProjectEvent fields:

- `id`, `org_id`
- `customer_reference_id` and/or `project_id`
- `event_type`, `event_category`
- `occurred_at`, `recorded_at`
- `actor_profile_id`
- `source`
- `source_reference_id`
- `raw_input`
- `payload_schema_version`
- versioned `payload`
- `correction_of_event_id`

Actor rules:

- `actor_profile_id` is nullable in the domain contract;
- `source = user` requires a human `actor_profile_id`;
- `source = accepted_ai_draft` requires a human `actor_profile_id` and
  `source_reference_id`;
- `source = integration` may have a null actor and requires a stable source
  reference;
- `source = system` may have a null actor;
- system/integration events must never invent a fake `profiles.id`.

Approved payload rule:

- every event carries `payload_schema_version`;
- an envelope is versioned immediately;
- stricter per-event schemas are added incrementally as workflows stabilize.

Progress versus meaningful change:

`projectEventCountsAsEffectiveProgress()` returns true only for:

- `EFFECTIVE_PROGRESS_RECORDED`
- `QUOTE_SENT`
- `SAMPLE_SENT`
- `CUSTOMER_CONFIRMED`
- `PROJECT_WON`

It returns false for:

- ordinary contact;
- generic customer response;
- stage change alone;
- paused, reopened, or lost lifecycle events.

`projectEventCountsAsMeaningfulChange()` separately includes stage, waiting,
reopen, pause, and loss changes for summaries without calling them progress.

A free-text note does not automatically become progress. It remains ordinary
contact or an AI draft until a human confirms the structured event.

Commercial truth rules:

- `QUOTE_SENT` means a formal quotation artifact was sent; it never means accepted;
- `CUSTOMER_CONFIRMED` requires explicit human-confirmed evidence and cannot be inferred from chat or AI;
- `order_confirmed` requires explicit human-confirmed order evidence;
- current QQ production-instruction traffic is not a canonical order ledger;
- current Excel quotations in WeCom remain source artifacts during transition.

## E. WorkItem

WorkItem is a dedicated sales-domain task model and does not reuse legacy tasks.

Types:

- `NEXT_ACTION`
- `CUSTOMER_COMMITMENT`
- `INTERNAL_COLLABORATION`
- `FOLLOW_UP`
- `MANAGEMENT_DECISION`

Status:

- `pending`
- `in_progress`
- `blocked`
- `completed`
- `cancelled`

Fields include:

- `assignee_profile_id`
- `created_by_profile_id`
- optional customer/project references
- `due_at`
- `priority`
- `blocked_reason`
- completion/cancellation actors and times
- `version`
- audit timestamps

Blocked rules:

- blocked is context, not a deadline waiver;
- a blocked Work Item can still be overdue;
- only an explicit reschedule changes `due_at`;
- reschedule history preserves previous/new due date, reason, actor, time, and
  Work Item version.

AI suggestions are not Work Items and cannot become overdue until accepted by a
human.

NEXT_ACTION single-source rule:

- `WorkItem NEXT_ACTION` is the actionable task source of truth;
- `Project.next_action_summary` is a projection/summary, not a second independently edited truth;
- where practical, one employee confirmation updates Project progress and next action together;
- `waiting_on` plus `next_check_at` represent waiting/check state without duplicate reminder rows.

## F. AIDraft

AIDraft is non-authoritative.

Required fields:

- `id`, `org_id`
- `raw_input`
- `structured_proposal`
- `proposal_type`
- optional customer/project references
- `status`
- audit timestamps

Status:

- `draft`
- `accepted`
- `rejected`
- `expired`

Metadata invariants:

- draft/expired cannot carry terminal metadata;
- accepted requires `accepted_by_profile_id` + `accepted_at` and no rejection metadata;
- rejected requires `rejected_by_profile_id` + `rejected_at` and no acceptance metadata.

Acceptance creates a confirmed event, Work Item, report narrative, or proposed
patch. It never silently confirms customer ownership, payment, won/lost status,
owner, or other consequential facts.

## G. Daily / Weekly Derived Report Contract

Reports are derived.

Each report belongs to one `subject_profile_id`. In v1:

- daily/weekly reports are personal;
- the subject confirms or corrects their own draft report;
- management may read team reports;
- a project collaborator relation alone does not grant report ownership;
- team/department report persistence is deferred.

Deterministic server/SQL calculations:

- confirmed effective-progress counts;
- meaningful lifecycle/waiting changes;
- Work Item creation/completion/reschedule/overdue states;
- waiting/blocker duration;
- stage changes;
- commitments due;
- explicit project exceptions.

Narrative:

- AI may summarize deterministic metrics and confirmed events;
- AI narrative cannot override metric values.

Snapshot rules:

- submitted reports are immutable;
- a correction creates a new snapshot/version linked through `supersedes_report_id`;
- the old submitted row is not updated to `superseded`;
- a newer snapshot referencing an older snapshot represents supersession;
- missing data remains `unknown`, never silently "no work".

Metric semantics:

- action/event count is not unique customer count;
- action/event count is not unique project count;
- quote count is not confirmed order count;
- expected opportunity amount is not confirmed order amount or payment;
- mixed currencies must not be aggregated without an approved FX policy;
- missing/incomplete data remains `unknown`, not zero or "no work".

Ingestion cursors:

A timestamp alone is ambiguous for late or equal-time records.

The contract uses an explicit `IngestionCursor`:

- `recorded_at_id` with `recorded_at + record_id`
- or `monotonic_sequence`

`source_event_cursor` and `source_work_item_cursor` use this contract.

## H. Permissions Matrix

The access input separates:

1. base app role: `admin`, `manager`, `sales`, `operator`, `viewer`
2. resource relation: `owner`, `collaborator`, `assignee`, `creator`,
   `subject`, `unrelated`, `none`
3. same-organization boolean; `sameOrg = false` denies every role/resource/action

Resource matrix:

| Role/relation | CustomerRef | Project | Event | WorkItem | AI Draft | Report | Settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| admin | read/create/update | read/create/update | read/create | read/create/update | read/create/accept/reject/expire | read/create/submit | read/manage |
| manager | read/create/update | read/create/update | read/create | read/create/update | read/create/accept/reject/expire | read/create/submit | read |
| sales owner | read | read/create/update | read/create | read/create/update | read/create/accept/reject | subject: read/update/submit | none |
| sales collaborator | read | read | read/create | read/create/update | read | subject: read/update/submit | none |
| sales assignee | read | read | read/create | read/update | read | none | none |
| sales creator | read | read | read/create | read/create | read/create/accept/reject | subject: read/update/submit | none |
| unrelated sales | none | none | none | none | none | none | none |
| operator | none | none | none | none | none | none | none |
| viewer | none | none | none | none | none | none | none |

Project creation:

- a sales user may create a Project when a concrete opportunity exists;
- server enforcement later must force `owner_profile_id` and
  `created_by_profile_id` to the authenticated profile unless manager/admin
  explicitly assigns another owner;
- an unrelated sales user cannot read or mutate another sales user's Project.

CustomerReference creation:

- sales may create a provisional reference for a concrete opportunity;
- sales cannot create or update canonical mapping authority;
- provisional creation sets `created_by_profile_id` to the authenticated profile
  at server enforcement.

CustomerReference mutation intents:

- `create_provisional`
- `update_provisional_details`
- `map_to_canonical`
- `update_canonical`

Authority:

- sales may create provisional records and update non-authoritative provisional details;
- sales cannot map/remap provisional to canonical or update canonical authority;
- manager/admin may perform canonical mapping where audited;
- operator/viewer denied;
- cross-org denied for everyone.

Report behavior:

- draft: subject employee may read/update/submit their own report;
- draft: manager/admin may read and correct/submit where authorized;
- submitted: no role can update/delete content in place;
- correction creates a new draft snapshot with `supersedes_report_id`;
- project collaborator relation alone does not grant subject report access.

Invariants:

- ProjectEvent is append-only and cannot be updated or deleted by any role;
- submitted report snapshots cannot be updated or deleted in place;
- admin status does not bypass these domain invariants;
- settings are admin-managed.

Relation scope:

- `unrelated` blocks sales access to another sales user's resources;
- admin/manager same-org access remains governed by their org-scoped matrix rather
  than by project ownership relation.

## I. Audit & Concurrency

Mutable entities use:

- `version`
- expected-version writes
- append-only audit/history
- same-org composite references

Strong audit is required for:

- Project Owner
- Project stage
- Project lifecycle/status
- expected amount/currency
- next check date
- pause/reopen reason
- Work Item due date/reschedule
- Work Item completion/cancellation
- CustomerReference mapping/remap
- AI draft acceptance/rejection
- report submission/correction

Same-org reference examples:

- `(org_id, customer_reference_id)` -> CustomerReference `(org_id, id)`
- `(org_id, project_id)` -> Project `(org_id, id)`
- `(org_id, owner_profile_id)` -> same-org profile

## J. Domain State Machines

### Project lifecycle

States:

- `active`
- `paused`
- `won`
- `lost`
- `cancelled`

Transitions:

- `active -> paused | won | lost | cancelled`
- `paused -> active | lost | cancelled`
- `lost -> active | cancelled`
- `won` terminal
- `cancelled` terminal

Pausing requires a next check date and audited pause reason.

Reopening a lost Project in place is allowed for the same commercial
opportunity and requires an audited reopen reason. A materially new objective,
order, or opportunity creates a new Project.

### Work Item lifecycle

Transitions:

- `pending -> in_progress | blocked | completed | cancelled`
- `in_progress -> blocked | completed | cancelled`
- `blocked -> in_progress | completed | cancelled`
- `completed` terminal
- `cancelled` terminal

### AI Draft lifecycle

Transitions:

- `draft -> accepted | rejected | expired`
- accepted/rejected/expired are terminal

## OPEN_BUSINESS_DECISIONS

None at domain-model freeze time.

## OPEN_TECHNICAL_DECISIONS

- Decide whether report ingestion cursors use `recorded_at + id` or a monotonic
  sequence when persistence is designed.
- Decide which event types receive strict payload schemas first after pilot
  validation.
- Decide whether Work Item blocked reminders require a separate policy.

## SAFE_TO_IMPLEMENT_NEXT

- Pure domain types and validators using the frozen Phase 1 V1 stage profiles as configurable application data, not database enums.
- Repeat/reorder fast-path validation rules that return changed artwork/material/process/fixture/application/quality/risk to the relevant validation stage.
- NEXT_ACTION single-source/projection validators and waiting/check invariants.
- Event progress/meaningful-change classification.
- AI draft acceptance workflow without persistence.
- Read-only external customer contract mapping after authority approval.
- Deterministic report metric specifications.

## MUST_NOT_IMPLEMENT_YET

- Customer/project database tables
- Supabase migrations or RLS
- Service-role customer data access
- Production environment changes
- Competing customer ownership or payment truth
- AI writes to consequential business facts without confirmation
- Exact project stage lists as database enum constraints
- Legacy `tasks`, `leads`, `site_data`, or `/api/data` as source of truth
