# Customer Project Center Phase 1 Business Model Freeze

Status: PM recovery candidate for `CPC-P1-BUSINESS-MODEL-FREEZE-001`.

Approval gate: this becomes the approved Phase 1 freeze only when the owner explicitly approves and merges the Draft PR containing it. Documentation/domain freeze only; no application code, database, migration, RLS, config, or Production change is authorized.

## Scope and non-goals

Phase 1 freezes Customer-versus-Project boundaries, Project creation requirements, old-customer follow-up, lifecycle-versus-stage semantics, type-specific stage profiles, repeat/reorder fast paths, commercial confirmation rules, and next-action single-source rules.

It does not freeze database schema/RLS, final UI, daily employee workflows, automatic message synchronization, or Production rollout.

## Customer versus Project

Customer is the long-lived commercial relationship. Project is one concrete commercial opportunity with a specific need, order, solution, or commercially actionable objective.

Routine old-customer relationship follow-up remains customer-level and does not create a Project until a concrete opportunity exists. Customer-level follow-up may use ProjectEvent/WorkItem with `customer_reference_id` present and `project_id = null`.

## Project creation invariant

A formal Project requires:

1. CustomerReference;
2. concrete objective/need;
3. `project_type`;
4. exactly one Project Owner;
5. an initial valid stage from that project type;
6. operational priority;
7. either a concrete `NEXT_ACTION`, or an explicit waiting state with `waiting_on` and a check time.

A formal Project starts as lifecycle `active`. Speculative or incomplete possibilities remain Lead, customer-level follow-up, or AI draft.

## Lifecycle versus stage

Lifecycle status is `active | paused | won | lost | cancelled`.

Stage is operational position, not lifecycle status and not a record of every chat. Active Projects expose owner, stage, `waiting_on`, and an actionable next step/check. Paused Projects require `next_check_at` and an audited pause reason.

Stage codes are configurable strings, never database enums.

## Frozen V1 stage profiles

- `transfer_film`: `requirement_alignment -> artwork_material_alignment -> quotation -> sampling_or_plate -> customer_confirmation -> order_confirmed -> production -> delivery`
- `transfer_processing`: `requirement_alignment -> material_fixture_process_alignment -> quotation -> trial_sample -> customer_confirmation -> order_confirmed -> production -> delivery`
- `equipment`: `application_assessment -> solution_definition -> validation_or_demo -> quotation_negotiation -> commercial_confirmation -> production -> delivery_installation -> acceptance_training`
- `uv`: `application_assessment -> sample_validation -> quotation -> customer_confirmation -> order_confirmed -> production -> delivery`
- `other`: `qualification -> solution -> quotation -> validation -> customer_confirmation -> fulfillment -> delivery`

The profiles are intentionally different. Repeat transfer-film work must not be forced through equipment-style stages.

## Repeat/reorder fast path

Repeat/reorder work may enter at a later valid stage when existing specification, artwork, material, process, and risk facts remain unchanged.

Changed artwork, material, process, fixture, application requirement, quality requirement, or material risk sends the Project back to the relevant validation stage.

Fast path means fewer unnecessary steps, not weaker evidence.

## Commercial truth

`QUOTE_SENT` means the formal quotation artifact was sent; it never means accepted.

`CUSTOMER_CONFIRMED` requires explicit human-confirmed evidence and cannot be inferred from chat or AI alone.

For equipment, `commercial_confirmation` is the equivalent commercial fact gate and also requires explicit human-confirmed evidence; it cannot be inferred from chat or AI.

`order_confirmed` requires explicit human-confirmed order evidence. Current QQ production-instruction traffic is not itself a canonical order ledger.

Current Excel quotation files in WeCom remain source artifacts during transition.

## Next action / WorkItem

`WorkItem NEXT_ACTION` is the actionable task source of truth.

`Project.next_action_summary` is a projection/summary of that confirmed task, not a second independently edited truth.

Where practical, one employee confirmation should update Project progress and next action together. Waiting uses `waiting_on` plus `next_check_at`; do not create repeated reminder rows for the same obligation.

Confirmed facts should feed next action, daily report, and weekly report without duplicate employee entry.

## Old-customer follow-up

Old-customer coverage is a customer-level responsibility until a concrete opportunity exists. Customer-level follow-up may have an assignee, due/check time, confirmed event, and next relationship action without creating a Project.

When a concrete opportunity appears, that context is promoted into a new Project and the Project creation invariant applies.

## Low-friction transition principle

The new system should replace employee steps, not add a second reporting layer. Phase 2 and Phase 3 must make business actions produce the structured facts needed downstream while current source artifacts remain usable during transition.

## Gate

`OPEN_BUSINESS_DECISIONS = NONE` for this Phase 1 scope.

`PHASE_1_GATE_CANDIDATE = PASS_ON_OWNER_MERGE`.

`BUSINESS_DATABASE_GATE = BLOCKED_BY_MASTER_CHECKLIST_2_TO_3_AND_PHASE_4_DESIGN`.

Even after Phase 1 merge, database implementation remains blocked until Phase 2 employee workflow, Phase 3 page/navigation/role/mobile architecture, and Phase 4 schema/RLS/authorization/audit design are explicitly approved.

`AUTO_MERGE = false`
`AUTO_PRODUCTION = false`
