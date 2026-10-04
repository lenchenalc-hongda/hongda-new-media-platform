# CPC-P8-WEEKLY-REPORTS-AI-001

Status: READY_FOR_CODEX

Base master SHA: `f9fa3becc7ee64d936bcb11d1b2305374439cbeb`

## Goal

Implement Phase 8 as one bounded end-to-end repository task: personal WEEKLY reports derived from confirmed CPC work plus traceable AI next-step suggestions. Reuse the Phase 7 report and AI-draft foundations instead of creating a parallel reporting or recommendation system.

## Frozen business boundaries

1. Weekly reports are personal and belong to one `subject_profile_id`.
2. Daily and weekly reports share the existing `/customer-projects/reports` employee surface; do not add a second top-level reporting workflow.
3. Management may read same-org submitted weekly reports through the existing read-only review model, but must not edit/submit/correct/accept AI on behalf of an employee.
4. Weekly report facts must be deterministic and derived from already-confirmed CPC facts/report snapshots. Missing external order/payment/receipt/quote sources remain UNKNOWN, never zero/no activity.
5. Submitted weekly reports are immutable. Corrections create a new revision and preserve history, matching Phase 7A rules.
6. Employee confirmation remains explicit before submit.
7. Reuse `cpc_reports` with `period_type = weekly`. Do not create another weekly-report source of truth.
8. Reuse `cpc_ai_drafts`; do not create a second AI table.
9. AI is non-authoritative. It may summarize the weekly report and propose concrete NEXT_ACTION/FOLLOW_UP work, but it must not mutate customer/project/ownership/amount/stage/lifecycle/due-date facts until an employee explicitly accepts an allowed proposal through existing controlled mutation paths.
10. Prefer existing `REPORT_NARRATIVE` for weekly narrative and existing `WORK_ITEM` proposal contracts for actionable suggestions. Only add a new proposal type if existing contracts provably cannot represent the required Phase 8 behavior, and then stop with NEEDS_DECISION before broadening schema.
11. Every AI suggestion must carry traceability back to the weekly report and the confirmed facts/cursors that justified it. The user must be able to see “why this suggestion exists” and what action would be created if accepted.
12. Suggested focus should cover, where supported by confirmed facts:
    - substantive project progress;
    - stalled/waiting/blocked work;
    - customer commitments due/overdue;
    - old-customer follow-up coverage;
    - concrete next-week NEXT_ACTION/FOLLOW_UP candidates.
13. Do not rank employees, score performance, infer attitude/effort, or use message/click/record volume as performance evidence.
14. Do not build Team Board / employee comparison; that is Phase 9.
15. No external finance/order/quote/payment integration work; that is Phase 11.
16. No Production SQL/RLS/env execution. Repository migrations are allowed only if narrowly required, non-destructive, and fully reviewed; Production database gate remains closed.

## Weekly deterministic report

Implement generation/refresh/read/submit/correction semantics equivalent to Phase 7A but for `period_type = weekly`.

Requirements:
- period is explicit and deterministic; use the repository's existing business-date conventions and document the chosen week boundary in code/tests;
- aggregate from confirmed CPC facts / authoritative report inputs only;
- preserve known vs unknown metric semantics;
- include coverage/provenance so missing daily/source coverage cannot silently become zero;
- no duplicated employee manual entry of progress;
- optimistic concurrency on draft mutations;
- submitted rows immutable;
- correction is new revision only;
- same-org manager/admin submitted-report review may include weekly reports in the existing review surface without enabling mutation.

At minimum expose useful weekly facts already supported by Phase 5–7 data:
- meaningful progress;
- stage/lifecycle/waiting changes;
- next actions created/completed/rescheduled;
- customer commitments due/completed/overdue;
- old-customer follow-up;
- quote/sample/customer-commercial/order-confirmed metrics with unknown semantics preserved;
- project created/won/lost;
- waiting/blocker signals where reconstructable.

## AI weekly narrative and suggestions

1. Extend the Phase 7B report-narrative path to WEEKLY drafts without weakening personal ownership or submitted immutability.
2. AI input must be bounded to deterministic weekly metrics, explicit unknowns, period/provenance and reconstructable confirmed CPC facts.
3. AI suggestions must be proposals only.
4. Prefer individual existing `WORK_ITEM` AI drafts for NEXT_ACTION/FOLLOW_UP so each suggestion is independently reviewable/acceptable/rejectable.
5. Accepting a suggestion must reuse the existing controlled work-item mutation path and existing authorization/concurrency/audit rules.
6. Reject/expire changes only the AI draft.
7. If weekly metrics/source cursors change, weekly narrative/suggestions generated from the old basis become stale and require explicit regenerate/review.
8. Persist safe provenance: weekly report id/version, source cursors/fingerprint, provider/model identifiers where available, actor/timestamps, and accepted/rejected result.
9. Never persist provider secrets.

## UI

Use the existing My Reports surface:
- Daily / Weekly period switch or equivalent clear filter;
- employee can generate/refresh/confirm/submit/correct their weekly report;
- employee can generate/review/accept/reject weekly narrative;
- employee can review AI next-week work suggestions with visible rationale/traceability;
- manager/admin review remains read-only for submitted reports;
- keep the UI operational and concise, not a dashboard.

## Tests / gates

Add focused Phase 8 tests and wire them into CI.

Must prove:
- personal ownership and same-org authorization;
- employee cannot mutate another employee's weekly report;
- manager/admin review is read-only;
- cross-org fails closed;
- draft/submitted/correction immutability rules;
- deterministic known/unknown semantics;
- missing external sources never become zero;
- AI cannot directly mutate formal facts;
- suggestion acceptance only through allowed controlled mutation path;
- stale weekly narrative/suggestions detected after source/report version change;
- traceability/provenance present;
- no ranking/scoring/performance inference;
- no direct privileged client mutation from browser;
- no localStorage/site_data/generic /api/data SoT;
- Phase 5/6/7 regressions stay green;
- TypeScript/build/secret audit/smoke/Vercel pass.

## Fast-path implementation policy

This is one bounded Phase 8 PR. Do not split into micro-PRs unless a concrete authorization/database safety boundary requires it. Fix deterministic compile/lint/test failures in the same PR and in batches. Run focused tests before publishing.

## Completion contract

TASK_ID = CPC-P8-WEEKLY-REPORTS-AI-001
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
WEEKLY_REPORT_PERSONAL = PASS / FAIL
MANAGER_REVIEW_READ_ONLY = PASS / FAIL
UNKNOWN_SEMANTICS = PASS / FAIL
AI_NON_AUTHORITATIVE = PASS / FAIL
SUGGESTION_TRACEABILITY = PASS / FAIL
SUBMITTED_IMMUTABILITY = PASS / FAIL
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO

AUTO_PRODUCTION = false.
