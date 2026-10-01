# Customer Project Center Phase 4 Database & Authorization Design

Status: merge-gated candidate for `CPC-P4-DATABASE-AUTHORIZATION-DESIGN-001`.

Approval gate: owner merge of the Draft PR containing this document.

Phase 4 freezes schema, RLS, authorization, audit, concurrency, external-reference, and no-duplicate-source-of-truth contracts. It does **not** execute migrations, change Production RLS, import Production data, enable the CPC feature in Production, or authorize service-role shortcuts for ordinary user actions.

## 1. Phase 4 goal

Create a persistence design that can support the approved Phase 1–3 contracts without creating a second customer, ownership, receipt, quote, order, lead, Review Center, or knowledge source of truth.

Required gates:

- `SCHEMA = PASS_CANDIDATE`
- `RLS = PASS_CANDIDATE`
- `AUTHORIZATION = PASS_CANDIDATE`
- `AUDIT = PASS_CANDIDATE`
- `NO_DUPLICATE_SOURCE_OF_TRUTH = PASS_CANDIDATE`

## 2. Authority boundary

### CPC-owned truth

CPC may be authoritative for:

- CustomerReference mapping rows, not customer master data;
- Project;
- Project collaborator membership;
- confirmed Project/Customer events created under CPC rules;
- WorkItem;
- AI Draft;
- derived personal report snapshots;
- CPC audit history;
- external employee/profile identity bridge rows used only for integration mapping.

### External or existing truth that CPC must not duplicate

CPC must not create a competing authoritative table for:

- customer master;
- customer ownership;
- receipt/payment ledger;
- lead master;
- quotation master/lifecycle;
- order master/ledger;
- Review Center cases/actions;
- knowledge content;
- WeCom/WhatsApp/QQ message history.

Current authority treatment:

- workshop/finance customer records: external operational customer source;
- workshop customer owner fields: external operational ownership input;
- workshop receipt records: external operational receipt source;
- orders: no unified current SoT exists;
- Dongguan -> Shantou production instruction: source artifact sent through QQ, not an order ledger;
- quotation: Excel source artifact in WeCom, no structured quote lifecycle SoT;
- Leads: existing acquisition-side domain remains separate.

No Phase 4 schema may silently convert these external facts into CPC-owned truth.

## 3. Naming and tenancy convention

All new formal tables use a `cpc_` prefix.

Every tenant-scoped table includes:

- `org_id UUID NOT NULL`;
- composite uniqueness `UNIQUE (id, org_id)` where needed for same-org foreign keys;
- foreign keys to `profiles(id, org_id)` for business profile references;
- RLS enabled;
- no generic `site_data`, `/api/data`, browser `localStorage`, or opaque unscoped storage.

Business foreign keys always use `profiles.id`, never `auth.users.id`.

## 4. Proposed physical schema

### 4.1 cpc_customer_references

Purpose: local reference/mapping layer to external customers plus clearly provisional references.

Core columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- `reference_kind TEXT NOT NULL` — `canonical | provisional`
- `external_source TEXT`
- `external_customer_id TEXT`
- `provisional_source_reference TEXT`
- `display_name_snapshot TEXT NOT NULL`
- `external_owner_reference TEXT` — non-authoritative snapshot/reference only
- `source_synced_at TIMESTAMPTZ`
- `status TEXT NOT NULL`
- `mapped_canonical_reference_id UUID`
- `created_by_profile_id UUID`
- `created_at / updated_at`
- `version INTEGER NOT NULL DEFAULT 1`

Constraints:

- canonical requires `external_source + external_customer_id`;
- provisional must not carry `external_customer_id`;
- canonical uniqueness: `org_id + external_source + external_customer_id`;
- mapped canonical target must be same-org;
- canonical status limited to `active | inactive`;
- provisional status limited to `pending_review | mapped | inactive`;
- a mapped provisional reference requires `mapped_canonical_reference_id`;
- provisional creation requires `created_by_profile_id`;
- no name-based canonical identity.

This table is **not** a customer master. Snapshot fields are display/cache only.

### 4.2 cpc_external_profile_mappings

Purpose: explicit bridge from external responsible-person identifiers such as workshop `E...` ids to repository `profiles.id`.

Columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- `external_source TEXT NOT NULL`
- `external_person_id TEXT NOT NULL`
- `profile_id UUID NOT NULL`
- `display_name_snapshot TEXT`
- `status TEXT NOT NULL DEFAULT 'active'`
- `mapped_by_profile_id UUID NOT NULL`
- `mapped_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`
- `version INTEGER NOT NULL DEFAULT 1`

Constraints:

- unique `org_id + external_source + external_person_id`;
- at most one active mapping per `org_id + external_source + profile_id`;
- same-org profile/mapped_by composite FKs;
- normal integration writes must match by stable external id, never display name.

Changing this mapping is audit-required.

### 4.3 cpc_projects

Purpose: one concrete commercial opportunity.

Core columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- `customer_reference_id UUID NOT NULL`
- `title TEXT NOT NULL`
- `objective_summary TEXT NOT NULL`
- `project_type TEXT NOT NULL`
- `owner_profile_id UUID NOT NULL`
- `status TEXT NOT NULL`
- `stage TEXT NOT NULL`
- `waiting_on TEXT NOT NULL DEFAULT 'none'`
- `next_check_at TIMESTAMPTZ`
- `priority TEXT NOT NULL`
- `risk_level TEXT`
- `expected_amount_minor BIGINT`
- `currency TEXT`
- `expected_close_date DATE`
- `created_by_profile_id UUID NOT NULL`
- `version INTEGER NOT NULL DEFAULT 1`
- `created_at / updated_at`

Important physical-design choice:

`next_action_summary` is exposed as a **projection** from the current open `NEXT_ACTION` WorkItem rather than maintained as an independently editable base-table field.

This prevents a second next-action truth.

Constraints:

- project type: `transfer_film | transfer_processing | equipment | uv | other`;
- lifecycle: `active | paused | won | lost | cancelled`;
- stage stored as non-empty TEXT, never a PostgreSQL enum;
- stage validity against the approved project-type profile is validated by mutation functions/domain validators;
- title and objective_summary are non-empty after trim;
- expected amount and currency appear together or both are null;
- expected_amount_minor, when present, is >= 0;
- currency, when present, is a normalized three-letter uppercase code;
- paused requires `next_check_at`;
- same-org CustomerReference;
- same-org owner/creator profile;
- optimistic version >= 1.

Cross-table invariant enforced transactionally:

An active Project must end each successful mutation with either:

1. one open `NEXT_ACTION`; or
2. an explicit waiting state plus `next_check_at`.

A provisional CustomerReference cannot transition the Project to `won`.

A transition to terminal lifecycle `won | cancelled`, or to a closed/lost state with no active follow-up intent, must resolve any open Project NEXT_ACTION and waiting/check state in the same domain transaction so terminal Projects do not remain in the active Today queue. Reopening `lost -> active` re-establishes the active invariant.

### 4.4 cpc_project_members

Purpose: collaborators separate from the single Project Owner.

Columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- `project_id UUID NOT NULL`
- `profile_id UUID NOT NULL`
- `collaborator_role TEXT NOT NULL`
- `added_by_profile_id UUID NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `removed_at TIMESTAMPTZ`
- `removed_by_profile_id UUID`

Roles:

- `technical`
- `design`
- `quality`
- `management`
- `support`

Rules:

- no destructive delete for ordinary removal; use `removed_at`;
- one active collaborator row per Project/profile;
- owner cannot also be an active collaborator;
- removal is audited.

### 4.5 cpc_project_events

Purpose: append-only confirmed event ledger for Project and customer-level meaningful facts.

Columns:

- `id UUID PK`
- `event_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL`
- `org_id UUID NOT NULL`
- `customer_reference_id UUID`
- `project_id UUID`
- `event_type TEXT NOT NULL`
- `event_category TEXT NOT NULL`
- `occurred_at TIMESTAMPTZ NOT NULL`
- `recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `actor_profile_id UUID`
- `source TEXT NOT NULL`
- `source_reference_id TEXT`
- `raw_input TEXT`
- `payload_schema_version INTEGER NOT NULL`
- `payload JSONB NOT NULL DEFAULT '{}'`
- `correction_of_event_id UUID`
- `request_id UUID`

Rules:

- at least one of customer/project references must exist;
- if both exist, they must be same-org and Project must belong to the same CustomerReference;
- source: `user | accepted_ai_draft | integration | system`;
- user requires actor;
- accepted AI draft requires actor + source reference;
- integration requires stable source reference and may omit actor;
- system may omit actor;
- no fake actor profile;
- no UPDATE or DELETE path;
- correction is another event referencing the prior event.

First strict payload contracts to validate at mutation boundary:

- `QUOTE_SENT`
- `SAMPLE_SENT`
- `CUSTOMER_CONFIRMED`
- equipment commercial confirmation
- `ORDER_CONFIRMED`
- Project pause/reopen/won/lost/cancel transitions
- stage/waiting-state changes

Ordinary contact can remain a lighter versioned payload.

### 4.6 cpc_work_items

Purpose: dedicated sales-domain actionable tasks.

Columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- `work_type TEXT NOT NULL`
- `status TEXT NOT NULL`
- `customer_reference_id UUID`
- `project_id UUID`
- `title TEXT NOT NULL`
- `assignee_profile_id UUID NOT NULL`
- `created_by_profile_id UUID NOT NULL`
- `due_at TIMESTAMPTZ`
- `priority TEXT NOT NULL`
- `blocked_reason TEXT`
- `completed_at TIMESTAMPTZ`
- `completed_by_profile_id UUID`
- `cancelled_at TIMESTAMPTZ`
- `cancelled_by_profile_id UUID`
- `cancellation_reason TEXT`
- `version INTEGER NOT NULL DEFAULT 1`
- `created_at / updated_at`

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

Key invariant:

A partial unique index allows at most one open `NEXT_ACTION` per Project where status is pending/in_progress/blocked.

Waiting/check is **not** persisted as a WorkItem merely for reminder visibility.

State transitions and due-date reschedules are RPC-only and audit-required.

### 4.7 cpc_ai_drafts

Purpose: non-authoritative AI proposal staging.

Columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- optional `customer_reference_id`
- optional `project_id`
- `proposal_type TEXT NOT NULL`
- `raw_input TEXT NOT NULL`
- `structured_proposal JSONB NOT NULL`
- `proposal_schema_version INTEGER NOT NULL`
- `status TEXT NOT NULL`
- `created_by_profile_id UUID NOT NULL`
- `accepted_by_profile_id / accepted_at`
- `rejected_by_profile_id / rejected_at`
- `expires_at TIMESTAMPTZ`
- `created_at / updated_at`
- `version INTEGER NOT NULL DEFAULT 1`

Status:

- `draft | accepted | rejected | expired`

Terminal metadata must match status.

Acceptance does not directly mutate arbitrary tables. It calls the same authorized domain mutation used by a human action, with `source = accepted_ai_draft`.

### 4.8 cpc_reports

Purpose: derived personal Daily/Weekly report snapshots.

Columns:

- `id UUID PK`
- `org_id UUID NOT NULL`
- `subject_profile_id UUID NOT NULL`
- `period_type TEXT NOT NULL` — daily/weekly
- `period_start DATE NOT NULL`
- `period_end DATE NOT NULL`
- `revision_no INTEGER NOT NULL`
- `status TEXT NOT NULL` — draft/submitted
- `metrics_schema_version INTEGER NOT NULL`
- `deterministic_metrics JSONB NOT NULL`
- `narrative TEXT`
- `unknowns JSONB NOT NULL DEFAULT '[]'`
- `source_event_seq BIGINT`
- `source_audit_seq BIGINT`
- `supersedes_report_id UUID`
- `created_by_profile_id UUID NOT NULL`
- `submitted_by_profile_id UUID`
- `submitted_at TIMESTAMPTZ`
- `created_at / updated_at`
- `version INTEGER NOT NULL DEFAULT 1`

Rules:

- period_start <= period_end;
- same-org subject and actors;
- only one active draft per subject/period;
- submitted rows are immutable;
- correction creates a new draft revision with `supersedes_report_id`;
- old submitted snapshot is never updated to "superseded";
- deterministic metric JSON is a versioned snapshot, not a generic business-data store.

### 4.9 cpc_audit_log

Purpose: append-only strong audit for mutable CPC state.

Columns:

- `id UUID PK`
- `audit_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL`
- `org_id UUID NOT NULL`
- `entity_type TEXT NOT NULL`
- `entity_id UUID NOT NULL`
- `action TEXT NOT NULL`
- `actor_profile_id UUID`
- `reason TEXT`
- `before_values JSONB`
- `after_values JSONB`
- `metadata JSONB NOT NULL DEFAULT '{}'`
- `request_id UUID`
- `recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Rules:

- append-only;
- no UPDATE/DELETE;
- ordinary users never write it directly;
- domain mutation functions write the audit row in the same transaction;
- only changed/audit-relevant fields should be included, not uncontrolled full-row dumps.

Strong-audit actions include:

- Project owner/stage/lifecycle/expected amount/next-check changes;
- pause/reopen reason;
- collaborator add/remove;
- WorkItem due-date/state/completion/cancellation;
- CustomerReference mapping/remap;
- external profile mapping;
- AI draft accept/reject;
- report submit/correction.

## 5. Explicitly rejected tables

Phase 4 does **not** approve:

- `cpc_customers`
- `cpc_customer_ownership`
- `cpc_receipts`
- `cpc_payments`
- `cpc_orders`
- `cpc_quotes`
- `cpc_leads`
- CPC copies of Review Center cases/actions
- CPC copies of knowledge cards
- generic `cpc_data JSONB`
- generic user-editable `cpc_settings JSONB` as a back door for business rules

If future phases require one of these domains, a new authority decision is required first.

## 6. Derived views / read models

Read models may be SQL views, authenticated RPC responses, or server queries. They are projections, not new truth.

Planned projections:

### cpc_project_current_view

Combines:

- Project;
- current open NEXT_ACTION;
- waiting/check state;
- exception indicators;
- CustomerReference display snapshot.

Exposes `next_action_summary` as a derived field.

### cpc_today_queue

Derived from:

- WorkItems;
- due waiting/check states;
- Project invariant exceptions;
- approved stale threshold;
- already-due customer FOLLOW_UP;
- management-decision assignments.

Priority classes follow Phase 2 P0–P3.

### cpc_customer_work_view

Combines CustomerReference with:

- authorized active/recent Projects;
- due customer-level follow-up;
- next relationship check;
- external owner display only when a verified mapping is available.

### cpc_team_exception_view

Manager/admin only.

Contains decisions/commitments/stalled/missing-action exceptions and aggregate business signals, not click/message surveillance metrics.

## 7. Mutation architecture

### 7.1 Rule: no ordinary direct table mutation

Formal CPC writes use narrow authenticated PostgreSQL RPCs or equivalent authenticated server functions.

Ordinary client/application code must not directly INSERT/UPDATE/DELETE the formal CPC tables.

Reason:

- cross-table invariants;
- audit transactionality;
- optimistic concurrency;
- consequential human-confirmation boundary;
- relation-based authorization;
- append-only event/report rules.

RLS remains enabled as defense in depth and for SELECT visibility.

### 7.2 Authentication inside mutations

Every mutation must:

1. resolve `auth.uid()` to one active same-org `profiles.id`;
2. fail closed if no active profile;
3. derive org from that profile/session, never trust client org_id;
4. check role;
5. check resource relation;
6. validate expected version for mutable resources;
7. validate domain invariant;
8. write business mutation + audit in one transaction.

Security-definer functions must:

- use a fixed `search_path = pg_catalog, public`;
- be revoked from `PUBLIC` and `anon`;
- grant only explicitly approved functions to `authenticated`;
- never accept a caller-supplied actor id as authority;
- never infer identity by display name.

### 7.3 Planned mutation RPCs

Candidate names:

- `cpc_create_provisional_customer_reference`
- `cpc_map_customer_reference`
- `cpc_manage_external_profile_mapping` — admin-only
- `cpc_create_project`
- `cpc_reassign_project_owner` — manager/admin, strong-audit
- `cpc_record_progress`
- `cpc_set_waiting_state`
- `cpc_transition_project`
- `cpc_add_project_member`
- `cpc_remove_project_member`
- `cpc_create_work_item`
- `cpc_transition_work_item`
- `cpc_reschedule_work_item`
- `cpc_create_ai_draft`
- `cpc_accept_ai_draft`
- `cpc_reject_ai_draft`
- `cpc_upsert_report_draft`
- `cpc_submit_report`
- `cpc_create_report_correction`

`cpc_record_progress` should be able to atomically:

- append a confirmed event;
- update allowed Project stage/lifecycle/waiting fields;
- complete/replace the old NEXT_ACTION;
- create the new NEXT_ACTION or waiting/check state;
- create audit rows;
- increment Project/WorkItem versions.

This implements Phase 2 "one confirmation, many uses."

## 8. RLS read policy

All tables enable RLS.

Cross-org is always denied.

Authenticated/anon table grants and policies:

- `anon`: no CPC table access and no CPC mutation-function execute grants;
- `authenticated`: no direct INSERT/UPDATE/DELETE privilege path for formal CPC tables;
- ordinary authenticated mutations happen only through explicitly granted narrow RPCs;
- direct table SELECT is allowed only where the table's RLS policy below permits it;
- security-definer mutation owners are not a reason to expose broad table grants.

Table read policy intent:

| Table | admin | manager | sales | operator/viewer |
| --- | --- | --- | --- | --- |
| cpc_customer_references | same-org | same-org | relation helper only | deny |
| cpc_external_profile_mappings | same-org read | same-org read | no direct read | deny |
| cpc_projects | same-org | same-org | relation helper only | deny |
| cpc_project_members | same-org | same-org | only for readable Project | deny |
| cpc_project_events | same-org | same-org | only through readable Customer/Project relation | deny |
| cpc_work_items | same-org | same-org | assignee/creator or readable parent relation | deny |
| cpc_ai_drafts | same-org | same-org | creator/authorized resource relation | deny |
| cpc_reports | same-org | same-org | own subject reports only | deny |
| cpc_audit_log | same-org | same-org | no direct raw-audit access | deny |

Sales-facing history required by the product should be returned through domain-specific Project/WorkItem history read models rather than exposing the generic raw audit table.

Cross-org is always denied.

### Admin

Same-org read of all CPC resources.

Mutation authority remains RPC/domain constrained; admin does not bypass append-only or submitted-report immutability.

### Manager

Same-org read of Projects, CustomerReferences, Events, WorkItems, AI Drafts, Reports, members, and management views.

Mutation authority remains RPC/domain constrained.

### Sales

Read is relation-based.

A sales user may read a Project when any approved relation is true:

- Project owner;
- active Project collaborator;
- WorkItem assignee/creator linked to that Project;
- Project creator where approved by domain contract.

A sales user may read a CustomerReference when there is an authorized relation through:

- an accessible Project;
- an assigned/created customer-level WorkItem;
- an AI draft they are allowed to access;
- a provisional reference they created;
- verified external customer-owner mapping to their `profiles.id`, when that integration is available.

A sales user does not receive all same-org customers merely because the Customers page exists.

### Operator / Viewer

No formal CPC table access in V1.

Future collaboration-role expansion requires a new access decision.

## 9. Resource authorization helpers

Candidate internal helpers:

- `cpc_can_read_customer_reference(profile_id, customer_reference_id)`
- `cpc_can_read_project(profile_id, project_id)`
- `cpc_can_mutate_project(profile_id, project_id, intent)`
- `cpc_can_read_work_item(profile_id, work_item_id)`
- `cpc_can_mutate_work_item(profile_id, work_item_id, intent)`
- `cpc_can_read_ai_draft(profile_id, ai_draft_id)`
- `cpc_can_read_report(profile_id, report_id)`

Helpers must be same-org aware and fail closed.

Profile-id arguments shown above are internal helper contracts, not client authority. Public RPCs derive the actor from auth.uid() and must not trust a caller-supplied actor/profile id.

If implemented as security-definer SQL helpers, recursion/RLS interaction must be tested explicitly.

## 10. CustomerReference authorization

### Sales

Allowed:

- create provisional reference for a concrete opportunity;
- update non-authoritative provisional display/context before mapping.

Denied:

- create canonical external customer identity;
- remap provisional to canonical;
- modify canonical external id/source;
- change external ownership truth.

### Manager/Admin

May perform canonical CustomerReference mapping/remap only through audited functions using a verified external customer id.

External employee/profile identity mapping is stricter: only admin may create/change/deactivate `cpc_external_profile_mappings`, because those rows can affect ownership display and relation-based visibility. Manager may read the mapping for management visibility but cannot mutate it.

A mapping row does not write back to the workshop/finance source.

## 11. Project authorization

### Create

Sales may create a Project for themselves when creation invariant passes.

Manager/admin may explicitly assign another same-org owner.

The server sets creator from authenticated profile.

### Update/transition

Owner may update ordinary Project operational fields through approved RPCs.

Collaborator may create events/internal WorkItems but cannot change Project owner or canonical business authority.

Manager/admin may perform same-org management transitions, subject to domain invariants and audit.

Project owner reassignment is high-audit and requires manager/admin authority.

## 12. WorkItem authorization

- assignee can update their own actionable state as allowed;
- creator can read and manage where domain contract allows;
- Project owner/collaborator may create appropriate WorkItems inside an accessible Project;
- manager/admin same-org access;
- unrelated sales denied;
- direct due-date mutation is forbidden; use reschedule intent with reason;
- completion/cancellation metadata is server-generated from actor/time.

## 13. AI Draft authorization

AI Draft is not an authorization bypass.

- creator/authorized Project owner may accept/reject their draft;
- collaborator may read only where allowed by relation;
- manager/admin same-org read/decision authority under domain rules;
- acceptance reruns the target domain authorization at acceptance time;
- stale permissions or changed versions must fail acceptance.

## 14. Report authorization

- subject sales user: read/update/submit own draft;
- manager/admin: read same-org reports and perform explicitly authorized correction/submit actions;
- collaborator relation alone gives no report ownership;
- submitted rows cannot be updated/deleted by any role;
- correction creates a new draft snapshot.

## 15. Referential and deletion safety

All business parent references use same-org composite foreign keys where applicable.

Default deletion behavior is RESTRICT / NO ACTION for CustomerReference, Project, Event, WorkItem, Report, Audit and profile relations. CPC must not use broad ON DELETE CASCADE to erase business/audit history.

Lifecycle closure, collaborator removal, WorkItem cancellation and mapping deactivation are explicit domain mutations rather than destructive row deletion.

## 16. Audit and optimistic concurrency

Mutable resources carry `version`.

Mutation requests for an existing mutable row require `expected_version`.

On mismatch:

- return conflict;
- do not silently overwrite;
- UI reloads current state and lets user reconcile.

Every successful strong-audit mutation:

1. verifies expected version;
2. writes the mutation;
3. increments version;
4. appends audit row;
5. commits atomically.

## 17. Ingestion cursor decision

Phase 4 resolves the prior cursor technical decision with monotonic sequences.

- ProjectEvent cursor: `event_seq`;
- mutable-resource/reporting change cursor: `audit_seq`.

Reasons:

- no equal-timestamp ambiguity;
- late writes receive a later sequence naturally;
- deterministic pagination;
- simpler report snapshot provenance.

Timestamps remain business/audit context but are not the only ingestion cursor.

## 18. Source artifact treatment

Quotation and production-instruction files remain source artifacts.

V1 does not require a separate quote/order master table.

An event may store:

- source type;
- stable external/file reference when available;
- human-readable artifact metadata;
- link/path reference where safe.

Do not copy entire external documents into generic JSON merely to claim structured ownership.

Review Center and knowledge associations should link to their existing identifiers when later needed.

## 19. External integration contract

### Workshop/finance customer source

Allowed future direction:

- read stable customer id and display snapshot;
- store/update CustomerReference mapping;
- display external ownership through explicit employee-profile mapping;
- display derived receipt visibility through read-only integration.

Not authorized by Phase 4:

- CPC writes customer owner back to workshop;
- CPC edits receipt truth;
- CPC directly mutates `/opt/hongda-workshop/data/shared-data.json`;
- browser-name matching as identity.

### External employee bridge

Mapping uses stable external employee id -> `profiles.id`.

Display-name comparison may be an admin review aid only; it is never the normal write key.

### Quotations

Keep Excel in WeCom as source artifact during transition.

CPC may later store confirmed `QUOTE_SENT` event metadata/reference without becoming a duplicate quotation lifecycle system.

### Orders / production handoff

No `cpc_orders` table in Phase 4.

Confirmed order evidence may be represented by a human-confirmed event.

Dongguan -> Shantou production instruction remains an operational source artifact until a future approved workflow replaces it.

## 20. Migration implementation order

After Phase 4 owner merge, the implementation may be split into bounded PRs.

Recommended order:

1. reusable CPC auth/authorization helpers and schema-only migration;
2. CustomerReference + external profile mapping;
3. Project + ProjectMember;
4. Event + Audit;
5. WorkItem;
6. AI Draft;
7. Report snapshot;
8. read-model views/RPCs;
9. write RPCs;
10. RLS/authorization regression tests;
11. feature-gated API/UI integration.

Each actual migration PR must be separately reviewed.

Phase 4 merge is **not** permission to run Production SQL.

## 21. Migration safety rules

Every migration implementation must:

- avoid DROP/TRUNCATE/DELETE of existing Production data;
- avoid modifying legacy leads/site_data/ai_jobs unless explicitly in scope;
- use additive changes first;
- keep the CPC feature flag off until the relevant Phase 5 flow is ready;
- provide rollback/disable strategy;
- run schema/RLS tests before any Production approval;
- require explicit owner approval before Production SQL/RLS execution.

## 22. No generic service-role shortcut

Ordinary CPC user actions must not use a service-role client to bypass RLS.

Server-side elevated credentials may only be introduced for a separately approved integration/background job where:

- purpose is explicit;
- source authority is explicit;
- data direction is explicit;
- least privilege is documented;
- audit/reconciliation behavior is documented.

Phase 4 does not approve such a Production integration job.

## 23. Test matrix required before Phase 5 persistence

### Tenant isolation

- cross-org select denied;
- cross-org relation insert denied;
- cross-org RPC mutation denied.

### Role/resource access

- anon denied everywhere;
- authenticated direct DML denied outside narrow RPCs;
- admin/manager same-org read;
- sales owner read/write allowed only for approved intents;
- collaborator limited correctly;
- assignee limited correctly;
- unrelated sales denied;
- raw audit denied to sales;
- external profile mapping mutation admin-only;
- operator/viewer denied.

### CustomerReference

- canonical uniqueness;
- no fake external id on provisional;
- sales cannot canonical-map;
- mapping audit exists;
- no normal-write name matching;
- provisional Project cannot become won.

### Project

- project type/lifecycle validation;
- stage validated against project type in mutation layer;
- title/objective non-empty;
- amount non-negative and amount/currency pair valid;
- paused requires check date;
- active invariant requires one open NEXT_ACTION or waiting/check;
- terminal transition resolves active NEXT_ACTION/waiting state;
- Project owner is not collaborator;
- version conflicts fail.

### Event

- append-only;
- actor/source invariants;
- strict consequential payload validation;
- correction appends new event;
- event sequence monotonic.

### WorkItem

- one open NEXT_ACTION per Project;
- blocked may still be overdue;
- reschedule requires reason and audit;
- waiting/check is not duplicated as a WorkItem;
- terminal rows cannot silently return to open state outside approved transition.

### AI Draft

- AI cannot confirm consequential facts by itself;
- accepted draft reruns current authorization/version checks;
- terminal metadata consistent.

### Reports

- subject access;
- manager/admin access;
- submitted immutable;
- correction creates new revision;
- deterministic metrics cannot be overwritten by AI narrative;
- unknown remains unknown;
- event/audit cursor provenance stored.

### Audit

- all strong-audit mutations append exactly one coherent audit action per logical mutation;
- audit row is immutable;
- admin cannot bypass append-only rule.

### Source-of-truth regression

Tests/document assertions must confirm that Phase 4 does not introduce:

- CPC customer master;
- CPC ownership master;
- CPC financial ledger;
- CPC order ledger;
- CPC quote lifecycle master;
- third Lead store;
- CPC copies of Review Center/knowledge.

## 24. Phase 4 implementation boundary

After Phase 4 Gate passes, Phase 5 may begin implementing the **V1 core project system** using this design.

Phase 5 implementation still requires bounded migrations and code PRs.

Production remains separately gated.

## 25. Gate

`SCHEMA = PASS_CANDIDATE`

`RLS = PASS_CANDIDATE`

`AUTHORIZATION = PASS_CANDIDATE`

`AUDIT = PASS_CANDIDATE`

`NO_DUPLICATE_SOURCE_OF_TRUTH = PASS_CANDIDATE`

Resolved technical decisions:

- mutation path: narrow authenticated RPC/server-domain functions;
- Project next action: derived from one current NEXT_ACTION, not separately editable project truth;
- report ingestion cursor: monotonic event/audit sequences;
- first strict event payloads: consequential commercial/lifecycle/stage/waiting events.

Deferred outside Phase 4:

- blocked reminder timing policy -> Phase 6;
- actual workshop/finance integration implementation -> Phase 11 unless pulled forward by an explicitly bounded dependency;
- exact stale-day/old-customer cadence values -> later approved policy;
- Production migration execution -> explicit human gate.

`OPEN_PHASE_4_DECISIONS = NONE`.

`PHASE_4_GATE_CANDIDATE = PASS_ON_OWNER_MERGE`.

`BUSINESS_DATABASE_GATE = PASS_CANDIDATE_ON_PHASE_4_OWNER_MERGE`.

`AUTO_MERGE = false`

`AUTO_PRODUCTION = false`
