# CPC-P12-QA-PILOT-READINESS-001

Status: READY_FOR_CODEX

Base master SHA: `a4b142fe16c168da0e2ac9c15df9e35cec516d48`

## Goal

Complete the repository-only Phase 12 QA and small-pilot readiness layer for Customer Project Center. This task proves that the implemented V1 can be exercised safely by the five approved role classes and prepares a bounded 2–3 project-owner pilot without deploying to Production or claiming that a real pilot has passed.

This task may produce `PILOT_REPOSITORY_READY`. It must not produce `PILOT_PASS`; that requires real human pilot evidence in an approved environment.

## Scope

1. Build one durable Phase 12 E2E/acceptance matrix covering:
   - admin;
   - manager;
   - sales / project owner;
   - operator;
   - viewer.
2. Verify role and resource boundaries:
   - admin has CPC Settings;
   - manager has Team Board but not Settings;
   - sales has only relation-authorized CPC resources;
   - operator/viewer receive no CPC portal or formal CPC data in V1;
   - hidden navigation is not treated as authorization.
3. Exercise the complete repository-side employee flow:
   - Workbench priority queue;
   - Customer relationship follow-up;
   - concrete opportunity to Project;
   - meaningful progress plus NEXT_ACTION or waiting/check;
   - task complete/reschedule/cancel history;
   - AI draft accept/reject with stale guard;
   - derived daily and weekly reports;
   - manager/admin review;
   - Team Board exception/support view;
   - old-customer 30/60/90 suggestions;
   - Phase 11 integration-status UNKNOWN/read-only behavior.
4. Add automated tests for high-risk edge cases:
   - cross-org and unrelated-resource denial;
   - stale expected-version conflict;
   - duplicate/replayed mutations;
   - concurrent next-action/report/follow-up attempts;
   - missing/UNKNOWN external customer, ownership, payment, order, quotation and lead facts;
   - empty, partial, loading and denied UI states;
   - mobile-critical workflow contract;
   - no raw activity ranking or message/click/count KPI.
5. Add a repository pilot-readiness document and operator checklist for 2–3 project owners:
   - entry criteria;
   - seeded/non-production test-data rules;
   - scenario script;
   - observed evidence template;
   - blocker/severity rules;
   - rollback/stop conditions;
   - feedback questions;
   - explicit human sign-off fields.
6. Add an issue/defect triage template or equivalent repository artifact that separates:
   - repository defect;
   - business-policy decision;
   - Production/integration gate;
   - training/usability feedback.
7. Wire all Phase 12 focused tests into the existing CI path.

## Required outcomes

- Existing Phase 5–11 tests continue to pass.
- Phase 12 tests run in CI, not only locally.
- No route, test fixture, or pilot document implies real Production data is available.
- No test or UI converts UNKNOWN into zero, false, or fabricated facts.
- No localStorage, `site_data`, or generic `/api/data` becomes formal CPC source of truth.
- Customer ownership and financial truth remain external and read-only.
- Review Center remains its own authority; Knowledge remains advisory.
- No employee ranking by messages, clicks, notes, or raw record counts.
- The repository can state whether it is ready to begin a controlled non-production pilot.
- Real `PILOT_PASS`, Production rollout and business go-live remain human gates.

## Implementation guidance

Prefer tests and lightweight repository documentation over new product surface area. Fix deterministic gaps discovered by the matrix when they are small and within the approved V1 contracts. Do not invent new policy, stage semantics, thresholds, customer ownership, finance logic, or external endpoints.

If a scenario cannot be safely automated without Production access, represent it as a manual pilot check with an explicit gate; do not fake completion.

## Production / high-risk boundary

PRODUCTION_CHANGED = NO.

Do not:
- execute Production SQL or change Production RLS;
- change Production env variables or secrets;
- write, delete, migrate, or overwrite Production data;
- perform destructive migrations;
- change customer ownership or financial source-of-truth;
- send external customer messages;
- publish externally;
- mark the real pilot or go-live as passed.

## Acceptance evidence

The Completion Contract must include:

TASK_ID = CPC-P12-QA-PILOT-READINESS-001
TASK_STATUS = PASS / FAILED / BLOCKED / NEEDS_DECISION
BRANCH =
HEAD_SHA =
PR_NUMBER =
FILES_CHANGED =
TESTS =
DATABASE_CHANGED = NO
MIGRATION_CREATED = NO
RLS_CHANGED = NO
PRODUCTION_CHANGED = NO
ROLE_MATRIX = PASS / FAIL
E2E_MATRIX = PASS / FAIL
AUTH_NEGATIVE_TESTS = PASS / FAIL
CONCURRENCY_REPLAY_TESTS = PASS / FAIL
UNKNOWN_SEMANTICS = PASS / FAIL
NO_ACTIVITY_RANKING = PASS / FAIL
PILOT_REPOSITORY_READY = YES / NO
PILOT_PASS = NO
PENDING_HUMAN_GATES =
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO

AUTO_MERGE = false
AUTO_PRODUCTION = false
