# Customer Project Center Decision Log

## Approved decisions

### DEC-001: External canonical customer source of truth

Customer ownership and payment truth remain in the existing external source of
truth. This repository may maintain a controlled CustomerReference/Mapping layer
for project use.

### DEC-002: Lead is not Customer

Lead remains acquisition-side. A Customer is a formal customer entity, and
Project is created only for a concrete commercial opportunity.

### DEC-003: Project means one concrete commercial opportunity

Project is not the permanent customer relationship. Customer-level follow-up may
exist without a Project.

### DEC-004: One Project Owner plus collaborators

Each Project has one owner profile and may have multiple collaborators.
Collaboration does not change customer ownership.

### DEC-005: Dedicated sales WorkItem

The Customer Project Center uses a dedicated sales WorkItem model and does not
reuse legacy tasks.

### DEC-006: Reports are derived

Daily and weekly reports derive from confirmed events, Work Items, follow-ups,
and deterministic metrics. Employees do not re-enter the same progress.

### DEC-007: AI proposals require human confirmation

AI produces drafts. Consequential business facts are not changed without an
authorized human acceptance step.

## Proposed decisions

### PROPOSED-001: Manual/unmatched CustomerReference lifecycle

Question: May an unmatched customer be represented by a marked temporary
CustomerReference before external canonical mapping?

Proposed direction:

- use status `pending_review`;
- keep the record visibly non-authoritative;
- prevent project ownership/payment claims from being inferred;
- require a reviewed merge/replace step when the canonical ID arrives.

Approval status: not approved.

### PROPOSED-002: Project stage profiles by type

Question: Which exact stages belong to each project type?

Proposed direction:

- keep common lifecycle states shared;
- allow type-specific stage code sets;
- use a repeat-order path for transfer film where appropriate;
- avoid forcing equipment-style workflow onto repeat orders.

Approval status: not approved.

### PROPOSED-003: Draft qualification state

Question: Should `draft` be a persisted Project state before `active`?

Proposed direction: yes, for incomplete qualification records that must not
appear as active commitments.

Approval status: not approved.

### PROPOSED-004: Reopening a lost Project

Question: When a lost opportunity re-engages, should the original Project be
reopened or should a new Project be created?

Proposed direction: allow a controlled `lost -> active` reopen transition for
the same commercial opportunity, with an audited reason. Use a new Project if the
objective changes materially.

Approval status: not approved.

### PROPOSED-005: Work Item blocked state

Question: Should `blocked` be an explicit WorkItem status?

Proposed direction: yes, because blocked work is not the same as unstarted work
and should not silently become overdue without context.

Approval status: not approved.

### PROPOSED-006: Event payload versioning

Question: Should ProjectEvent use strict per-event schemas immediately?

Proposed direction: start with validated event categories plus a versioned
payload envelope, then add event-specific schemas as workflows stabilize.

Approval status: not approved.

### PROPOSED-007: Report correction model

Question: How should an employee correct a submitted report?

Proposed direction: append a correction draft, submit a new immutable snapshot,
and link it through `supersedes_report_id`. Historical reports are not mutated.

Approval status: not approved.

## Change rule

New decisions must not be silently marked approved. They remain `PROPOSED-xxx`
until the business owner or designated PM explicitly approves them in Agent
Control.
