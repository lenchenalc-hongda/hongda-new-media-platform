# CPC-P7C-REPORT-REVIEW-001

Status: READY_FOR_CODEX

Base master SHA: `c81d3e2e5c888b41b217dddf01ea5bbbceac78ad`

## Goal

Complete the remaining Phase 7 automatic daily-report loop by adding a manager/admin read-only review surface for submitted employee DAILY reports, while preserving employee ownership, immutable submitted history, deterministic metrics as the authoritative facts, and AI narrative as a separately attributable employee-accepted text layer.

## Business behavior

1. Employee personal report workflow remains unchanged. Only the report subject can generate/accept/reject AI narrative and submit/correct their own report.
2. Manager/admin gets a read-only review view of submitted DAILY reports for the same organization.
3. Manager/admin must NOT edit, accept AI for, reject AI for, submit, correct, or otherwise mutate another employee's report from this Phase 7C path.
4. Review list/detail should expose only useful management facts already present in confirmed report snapshots:
   - report date / revision / submitted time;
   - employee/profile identity display data already authorized by current org/profile model;
   - deterministic metrics with known/unknown state preserved;
   - formal narrative if one was explicitly accepted by the employee;
   - source/provenance cursors and correction/supersedes context where useful;
   - stale/unknown indicators where already derivable.
5. Do not add employee ranking, scoring, “best/worst”, attitude inference, message-count performance, click-count performance or synthetic productivity scores.
6. Do not infer missing order/payment/quote/receipt integrations as zero or no work.
7. Submitted report rows remain immutable. Corrections remain new revisions only.
8. Manager visibility must respect organization scope and existing manager/admin role authorization. A normal employee must not gain access to other employees' reports.
9. Do not create a second reporting source of truth. Reuse cpc_reports and existing Phase 7A/7B read models/contracts.
10. Prefer server-side authorized reads; no browser-direct privileged Supabase query/mutation.
11. No Production SQL/RLS/env execution or change in this task. If existing repository permissions make safe manager read impossible without a repository migration, stop with NEEDS_DECISION and provide exact evidence rather than bypassing authorization.
12. Add tests/contracts for:
   - employee cannot read another employee's report through manager endpoints/surface;
   - manager/admin can read same-org submitted daily reports;
   - cross-org access fails closed;
   - drafts are not exposed in manager submitted-report review unless explicitly required by existing design;
   - manager path contains no mutation;
   - submitted immutability and correction history remain intact;
   - deterministic/unknown semantics preserved;
   - no ranking/scoring/performance inference;
   - no legacy localStorage/site_data/generic /api/data SoT;
   - Phase 5/6/7A/7B regression stays green.
13. UI should be concise and operational: date, employee, report state/revision, key deterministic facts, accepted narrative, unknown/stale indicators, and drill-down. Avoid a large analytics dashboard; Team Board belongs to Phase 9.

## Not in scope

- Weekly reports (Phase 8)
- Team Board / employee comparison (Phase 9)
- old-customer/proactive-development analytics expansion (Phase 10)
- external customer/order/payment/quote integrations (Phase 11)
- Production deployment/database execution
- notifications
- manager editing/submitting employee reports
- performance scoring/ranking

## Completion contract

TASK_ID = CPC-P7C-REPORT-REVIEW-001
TASK_STATUS = PASS / FAILED / BLOCKED / NEEDS_DECISION
BRANCH =
HEAD_SHA =
PR_NUMBER =
FILES_CHANGED =
TESTS =
DATABASE_CHANGED =
MIGRATION_CREATED =
RLS_CHANGED =
PRODUCTION_CHANGED =
MANAGER_REVIEW_READ_ONLY = YES
CROSS_ORG_GUARD = PASS / FAIL
EMPLOYEE_CANNOT_READ_OTHERS = PASS / FAIL
SUBMITTED_IMMUTABILITY = PASS / FAIL
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO

AUTO_PRODUCTION = false.
