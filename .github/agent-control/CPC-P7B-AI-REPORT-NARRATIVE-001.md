# CPC-P7B-AI-REPORT-NARRATIVE-001

Status: READY_FOR_CODEX

Base master SHA: `14804832efd195840db0450f616a36071f9d827a`

This branch is the bounded implementation branch for Customer Project Center Phase 7B.

## Goal

Add AI-written daily-report narrative on top of Phase 7A deterministic report snapshots without making AI authoritative and without changing confirmed metrics.

## Required constraints

- Reuse `cpc_ai_drafts` with `proposal_type = REPORT_NARRATIVE`.
- Generate only for an existing personal DAILY report draft.
- AI input is bounded to deterministic metrics, unknowns, period metadata, and authorized confirmed CPC facts.
- Missing external order/payment/receipt/quote data remains unknown; never turn it into zero or "no work".
- AI output remains a proposal until the report subject explicitly accepts it.
- Reject/expire must not change the formal report.
- Only the report subject may generate/accept/reject a personal narrative through this path.
- Accept requires optimistic concurrency for both the AI Draft and report draft.
- Submitted reports remain immutable.
- If report metrics/source cursors change, an existing generated/accepted narrative must be marked stale and explicitly regenerated/reviewed.
- Preserve generation basis, provider/model identifier when available, actor/timestamps, and target report version audit.
- Do not rank employees, score performance, or use message/click/record counts as performance evidence.
- Reuse an existing server-side AI provider/client if safely configured. Do not add or change Production secrets. If no safe provider exists, stop with NEEDS_DECISION.
- Add My Reports API/UI for generate, review, accept, reject, and stale regenerate.
- Add tests for authorization, stale-source guard, submitted immutability, no metric mutation, no direct client Supabase mutation, no secret leakage, and Phase 5/6/7A regressions.
- No Production SQL/RLS/env changes.
- No weekly reports, Team Board, external finance/order/reporting integration, auto-submit, auto-accept, performance scoring, or external notifications.

## Completion contract

When implementation is complete, post to this PR:

```
TASK_ID = CPC-P7B-AI-REPORT-NARRATIVE-001
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
AI_PROVIDER_REUSED =
AI_NARRATIVE_HUMAN_ACCEPT_REQUIRED = YES
STALE_SOURCE_GUARD = PASS / FAIL
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO
```

AUTO_MERGE is controlled by ChatGPT PM under standing owner authorization.
AUTO_PRODUCTION = false.
