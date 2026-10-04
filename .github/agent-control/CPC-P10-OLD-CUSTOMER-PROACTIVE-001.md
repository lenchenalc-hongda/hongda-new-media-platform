# CPC-P10-OLD-CUSTOMER-PROACTIVE-001

Status: READY_FOR_CODEX

Base master SHA: `14fb502d6fa607e8095090c36c6f524873480707`

## Owner-approved Phase 10 policy

The owner explicitly approved the Phase 10 V1 policy on 2026-10-04:

1. Segment A — key customer / confirmed recent transaction evidence: suggested follow-up every 30 days.
2. Segment B — historical transacting customer with no active/recent opportunity: suggested follow-up every 60 days.
3. Segment C — long-silent / ordinary historical customer: suggested follow-up every 90 days.
4. Cadence output is a **recommendation only**. Before explicit employee acceptance it is not a WorkItem, not overdue, not a missed commitment, and not performance evidence.
5. Suppress duplicate relationship recommendations when the customer already has an active Project or an open customer-level FOLLOW_UP.
6. Keep three business-motion categories separate in reporting:
   - new_media_lead
   - proactive_outbound
   - old_customer_reactivation
7. Old-customer conversion means: a relationship follow-up produces a concrete commercial opportunity and a Project is explicitly created. Mere reply/contact is not conversion.

## Safety interpretation of the approved policy

The repository does not currently have an authoritative key-customer flag, a fully integrated historical transaction feed, or an approved normalized acquisition-source mapping.

Therefore:
- never infer "key customer" from name, amount guess, message volume, activity volume or free text;
- never infer transaction history from generic customer.updated_at/source_synced_at;
- never infer new-media vs outbound from arbitrary source strings unless an already-approved explicit mapping exists;
- missing authoritative evidence remains UNKNOWN, never zero/no-business;
- Phase 11 remains the external customer/ownership/payment/lead-source integration phase.

## Goal

Implement Phase 10 as one bounded end-to-end repository PR that turns approved old-customer cadence into a useful, low-friction recommendation workflow while preserving source-of-truth boundaries.

Primary outcome:
- sales users can see which authorized customers are candidates for relationship follow-up;
- the system explains why and which cadence applies;
- employee can explicitly turn a recommendation into a formal customer-level FOLLOW_UP;
- managers can see old-customer coverage/recommendation/conversion facts without rankings;
- new-media / proactive-outbound / old-customer categories remain structurally separate and UNKNOWN where source evidence is absent.

## Deterministic recommendation model

### Eligibility

Only customers the actor is already authorized to read may appear.

Old-customer cadence recommendations apply only to active canonical CustomerReferences.
Provisional references are not treated as old customers.

### Suppression

Do not emit an old-customer recommendation when:
- the customer has any active Project; or
- the customer already has an open customer-level FOLLOW_UP.

No duplicate reminder/task is created.

### Evidence and segment assignment

Use only confirmed CPC facts currently available.

Trusted transaction evidence for Phase 10 V1 may include explicit confirmed CPC facts such as:
- ORDER_CONFIRMED ProjectEvent;
- PROJECT_WON lifecycle evidence / won Project with trustworthy CPC timestamps where the implementation can prove it from repository truth.

A:
- confirmed trusted transaction evidence within the last 365 days; OR
- future authoritative key-customer signal if/when already safely available.
- cadence = 30 days.

B:
- confirmed historical transaction evidence exists;
- not A;
- no active Project.
- cadence = 60 days.

C:
- active canonical customer;
- not A/B;
- no active Project;
- cadence = 90 days only when there is a confirmed relationship baseline (for example latest customer-level CONTACT_LOGGED/CUSTOMER_RESPONSE_RECEIVED).
- if no confirmed baseline exists, return `needs_baseline` / UNKNOWN and do not mark due.

Do not use customer row updated_at/source_synced_at as last-contact truth.

### Cadence clock

For A/B, use the latest trustworthy confirmed relationship/transaction timestamp available for that customer.
For C, use latest confirmed customer-level relationship interaction.
If no valid baseline exists, recommendation state is UNKNOWN/needs_baseline.

Recommendation states should distinguish at minimum:
- not_due
- due
- suppressed_active_project
- suppressed_open_follow_up
- needs_baseline
- evidence_unknown

Do not label a recommendation "overdue" before formal FOLLOW_UP acceptance.

## Explicit employee acceptance

Provide a narrow employee action such as “安排回访” / “创建回访任务”.

Acceptance must create a real customer-level FOLLOW_UP using the existing controlled WorkItem creation rules (`cpc_create_work_item`) and existing authorization model.

Prefer adding a narrow server mutation command/route that reuses the existing RPC rather than new business persistence.

Requirements:
- customer_reference_id set;
- project_id = null;
- work_item_type = FOLLOW_UP;
- explicit due_at chosen/confirmed by employee (a sensible cadence-derived default may be shown, but server mutation remains explicit);
- existing duplicate-open-follow-up protection applies;
- audit continues through existing controlled RPC path;
- no AI auto-accept.

## Conversion provenance

Conversion is only known when there is explicit evidence that a customer-level follow-up produced the Project.

Preferred implementation:
- from Customer context, after recording a follow-up, provide an explicit “产生商机 / 创建项目” flow;
- carry a trustworthy source follow-up event id into Project creation provenance;
- if existing persistence can record this in existing audit/event metadata without a new table, do so;
- if a repository-only RPC signature/migration update is necessary for explicit provenance, it may be added, but:
  - do not execute it in Production;
  - no destructive schema change;
  - no new competing customer/order/payment/lead SoT;
  - PM must review migration/RLS/authorization carefully.

Conversion metrics:
- count only explicit follow-up -> Project provenance;
- no inferred attribution window;
- no "customer replied" conversion;
- if provenance is unavailable for historical rows, mark historical conversion UNKNOWN rather than guessing.

## Source-category separation

Expose a typed/structured reporting contract with separate buckets:
- new_media_lead
- proactive_outbound
- old_customer_reactivation

For Phase 10:
- old_customer_reactivation may be known from this approved cadence/recommendation/follow-up flow;
- new_media_lead and proactive_outbound may only be known where an explicit trusted source/category is already captured;
- otherwise each remains UNKNOWN with reason.
- do not read localStorage/site_data/generic /api/data as formal CPC truth.
- do not create a third Leads store.

This separation must flow into management reporting/Team Board without combining unknown external acquisition data into old-customer metrics.

## UI surfaces

### Customers
Enhance the existing Customers surface/read model with concise relationship-planning fields:
- segment A/B/C/UNKNOWN;
- cadence days;
- evidence/basis;
- last confirmed relationship/transaction timestamp;
- recommendation state;
- next suggested follow-up date when deterministically known;
- suppression reason;
- explicit “安排回访” action.

Do not make the page a CRM analytics wall.

### Customer detail
Show:
- confirmed relationship history;
- existing formal FOLLOW_UP;
- Phase 10 recommendation;
- explicit schedule follow-up action;
- after a meaningful relationship follow-up, explicit “产生商机 / 创建项目” path preserving conversion provenance where implemented.

### Workbench / Today
Do NOT place unaccepted cadence recommendations into formal due/overdue queue.
Only accepted formal FOLLOW_UP WorkItems enter existing P3 relationship work/reminder behavior.

### Team Board
Upgrade the old-customer section from Phase 9 UNKNOWN where Phase 10 now has deterministic facts:
- eligible known customers;
- due recommendations (not overdue tasks);
- formal open FOLLOW_UP;
- recent confirmed relationship follow-up coverage where deterministic;
- explicit follow-up -> Project conversions where provenance exists;
- separate new_media/proactive/old_customer source buckets with UNKNOWN semantics where needed.

Still:
- no ranking/scoring;
- no employee performance inference;
- no activity-volume KPI.

## Decision log

Add approved Phase 10 decisions to `docs/customer-project-center/DECISION_LOG.md` using the next available DEC numbers, covering:
- A/B/C 30/60/90 cadence;
- recommendation vs formal FOLLOW_UP boundary;
- suppression/duplicate rule;
- explicit conversion provenance rule;
- source-category separation + UNKNOWN semantics.

Do not rewrite earlier decisions.

## Authorization

- same existing CPC roles and relation-based customer visibility;
- sales sees only authorized customers;
- manager/admin same-org management visibility;
- scheduling a formal FOLLOW_UP must use existing controlled authorization;
- Project creation rules remain unchanged except optional explicit conversion provenance;
- no customer ownership changes.

## Tests / gates

Add focused Phase 10 contract + surface tests and wire them into CI.

Must prove:
1. A = 30, B = 60, C = 90 according to trusted evidence.
2. active Project suppresses recommendation.
3. open customer-level FOLLOW_UP suppresses duplicate recommendation.
4. missing baseline remains UNKNOWN/needs_baseline, not due.
5. source_synced_at/customer.updated_at are not treated as last-contact truth.
6. recommendation is not a WorkItem/reminder/KPI before employee acceptance.
7. explicit acceptance creates formal FOLLOW_UP through the existing controlled mutation path.
8. formal FOLLOW_UP then appears through existing P3/Reminder behavior.
9. sales cannot see unrelated customers; manager/admin same-org rules remain.
10. new_media / proactive_outbound / old_customer_reactivation remain separate.
11. missing new-media/proactive source evidence remains UNKNOWN.
12. conversion requires explicit follow-up -> Project provenance; no reply-only/inferred conversion.
13. Team Board remains non-ranking/non-scoring.
14. no localStorage/site_data/generic /api/data SoT.
15. Phase 5–9 regressions remain green.
16. TypeScript / Build / Secret Audit / Smoke / Vercel pass.
17. Any repository migration is additive/non-destructive and not executed in Production.

## Fast-path policy

Use one bounded PR. Batch related fixes.
ChatGPT PM may directly repair deterministic low-risk TypeScript/lint/test-wiring defects.
Do not wait on Codex for trivial compile/test wiring failures.

## Out of scope

- Production migration execution
- external customer/payment integration implementation (Phase 11)
- customer ownership changes
- full lead-source reconciliation
- WhatsApp/WeCom conversation sync
- AI auto-contact / external publishing
- employee ranking/scoring
- arbitrary stale-project policy changes
- revenue/payment inference

## Completion contract

TASK_ID = CPC-P10-OLD-CUSTOMER-PROACTIVE-001
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
POLICY_30_60_90 = PASS / FAIL
RECOMMENDATION_NOT_KPI = PASS / FAIL
DUPLICATE_SUPPRESSION = PASS / FAIL
EXPLICIT_FOLLOW_UP_ACCEPTANCE = PASS / FAIL
CONVERSION_PROVENANCE = PASS / FAIL / UNKNOWN
SOURCE_BUCKET_SEPARATION = PASS / FAIL
UNKNOWN_SEMANTICS = PASS / FAIL
READY_FOR_PM_REVIEW = YES / NO

AUTO_PRODUCTION = false.
