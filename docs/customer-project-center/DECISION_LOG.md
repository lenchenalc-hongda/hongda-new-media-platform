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

Common lifecycle is shared. Stage codes are type-specific and configurable.
Exact stage lists are not frozen and must not become database enum constraints
in the next batch. Repeat transfer-film business must not be forced through
equipment-style stages.

## Deferred decisions

### DEFERRED-001: Exact project stage profiles

Exact stage values for transfer film, transfer processing, equipment, UV, and
other project types are deferred until pilot/workflow validation. This deferral
does not block the v1 domain contract freeze.

## Change rule

New business decisions remain open until the business owner or designated PM
approves them. Approved choices must not drift back into proposal status.
