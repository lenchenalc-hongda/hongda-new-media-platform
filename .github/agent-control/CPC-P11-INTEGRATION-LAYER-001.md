# CPC-P11-INTEGRATION-LAYER-001

Status: READY_FOR_CODEX

Base master SHA: `e2ccb2b4ca174f1ab2a8dba6044799be1fa3a716`

## Goal

Implement the repository-side Phase 11 integration layer for Customer Project Center without fabricating external authority and without any Production execution.

This phase must reduce future integration work and employee duplicate entry by giving CPC one typed, server-authorized integration boundary that clearly distinguishes:
- connected/known facts;
- unavailable/unknown facts;
- source artifacts/links;
- future external adapters.

Do not create fake customer/order/payment/quote truth.

## Current authoritative reality to preserve

1. Customer master: external Hongda workshop/finance tool `customers`, stable `C...` ids. External authority; CPC references it, does not recreate by name.
2. Customer ownership: external workshop customer `projectOwnerId/projectOwnerName`; workshop employee ids are `E...`. CPC Project Owner remains separate. No display-name matching as normal bridge.
3. Receipt/payment: external workshop `receiptRecords`, stable `RCP...` ids. CPC must not create a financial ledger.
4. Orders: no unified SoT today. Dongguan/Shantou are separate; production instruction sheet sent through QQ is an operational artifact, not an order database.
5. Quotations: Excel files stored/shared in WeCom; no structured quote lifecycle/acceptance SoT is proven.
6. Leads: repository has legacy DB + localStorage/site_data UI paths; live authority unresolved. Do not create a third lead store.
7. Review Center: repository-owned authority for review/case domain only; reuse/link, do not copy cases.
8. Knowledge: repository-owned advisory context; reuse retrieval, never promote knowledge/AI into confirmed business fact.
9. WhatsApp / customer WeCom conversation sync: backlog; no automatic sync in this task.
10. Formal CPC facts remain CPC-owned under existing Phase 4–10 rules.

## Deliverable A — Typed integration registry

Create one server-side CPC integration registry/read model describing each domain:
- customer_master
- customer_ownership
- receipt_payment
- orders
- quotations
- leads
- review_center
- knowledge
- whatsapp
- wecom_customer_conversation

For each expose typed fields similar to:
- authority
- status: connected | available_internal | external_contract_pending | current_artifact_only | backlog | unknown
- readCapability
- writeCapability
- stableIdKind
- freshness/lastSync when genuinely known
- knownLimitations
- sourceOfTruthStatement
- employeeAction / fallback

The registry itself is metadata, not business truth.

## Deliverable B — Narrow server API + admin/manager integration status surface

Add a read-only same-org server route and a compact management surface (prefer CPC Settings or a dedicated integration-status subview) showing:
- what is actually connected;
- what is internal and reusable now;
- what remains UNKNOWN;
- what requires a live adapter/Production approval later.

Sales users must not gain broad integration/admin visibility if existing IA reserves Settings for admin. Follow current role map. If manager visibility materially helps Team Board without widening Settings permission, expose only safe operational status.

No browser service-role access. No direct privileged Supabase client in the browser.

## Deliverable C — Internal integrations that can be real now

Where repository evidence already exists, wire real read-only integration helpers rather than placeholders:
- profiles/org identity reuse;
- Review Center as linked/read-only context only where a stable relation is genuinely available; otherwise expose availability without inventing joins;
- Knowledge as advisory availability/context using existing server interfaces.

Do not duplicate Review Center or Knowledge records into CPC tables.

## Deliverable D — External adapter contracts without invented endpoints

Define narrow interfaces/types for future workshop reads:
- canonical customer reference by stable external customer id;
- customer owner external employee id;
- receipt/payment reference by stable external receipt id;
- explicit external employee-id -> profiles.id mapping contract.

Important:
- there is no approved narrow live workshop API endpoint in repository evidence;
- therefore do NOT invent a URL/path or silently call generic whole-state `/api/data`;
- if no safe endpoint is configured/evidenced, adapter status is `external_contract_pending` / UNKNOWN;
- do not read production `shared-data.json` directly from this app;
- do not introduce Production env changes in this task.

## Deliverable E — Context on CPC surfaces

Use the integration registry to improve existing CPC surfaces with honest context:
- Customer/Project/Team Board may show compact source badges or “external data unavailable/pending integration” where useful;
- new_media_lead / proactive_outbound categories must remain UNKNOWN if no trusted source is integrated;
- receipt/order/quote values must remain UNKNOWN rather than zero;
- old-customer Phase 10 deterministic CPC facts remain intact.

Do not turn this into a large dashboard.

## Deliverable F — Phase 11 readiness report

Add a repository document (under docs/customer-project-center, not agent-control) that states:
- which Phase 11 domains are repository-ready;
- which need live external access/Production approval;
- exact next integration prerequisites;
- whether the repository can proceed to Phase 12 internal UI/QA without live finance/order/quote integration;
- clearly distinguish “V1 internal/pilot usability” from “full live integration”.

## Tests / CI

Add focused Phase 11 tests and wire them into CI.

Prove:
1. one fact = one authority; no duplicate customer/ownership/payment/lead SoT;
2. no localStorage/site_data/generic /api/data used as formal CPC source;
3. missing external endpoint/data remains UNKNOWN, not zero;
4. no invented workshop endpoint;
5. no customer ownership writes;
6. no financial writes;
7. Review Center/Knowledge remain read-only/advisory;
8. role authorization for integration status fails closed;
9. no browser service-role/direct privileged Supabase;
10. Phase 5–10 regressions stay green;
11. TypeScript/Build/Secret Audit/Smoke/Vercel pass.

## Speed / implementation policy

- One bounded PR for this repository-side Phase 11 layer.
- Front-load auth/SoT boundaries before UI.
- PM may directly fix deterministic low-risk compile/test wiring defects.
- Do not split into micro-PRs unless a real security/database boundary requires it.
- CI is a final gate, not a reason to idle.

## Production / high-risk boundary

PRODUCTION_CHANGED = NO.
Do not execute Production SQL/RLS/env/secrets.
Do not perform destructive migration or Production data writes.
Do not alter customer ownership or financial source-of-truth.
Do not publish externally.

If a real live external adapter cannot be implemented without a new endpoint/Production env/credential, finish the repository-side contract, mark that domain PENDING_EXTERNAL_GATE, and continue rather than fabricating data.

## Completion Contract

TASK_ID = CPC-P11-INTEGRATION-LAYER-001
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
INTEGRATION_REGISTRY = PASS / FAIL
NO_DUPLICATE_SOT = PASS / FAIL
UNKNOWN_SEMANTICS = PASS / FAIL
INTERNAL_REUSE = PASS / FAIL
EXTERNAL_ADAPTER_CONTRACT = PASS / FAIL
PHASE12_REPOSITORY_READY = YES / NO
PENDING_EXTERNAL_GATES =
KNOWN_LIMITATIONS =
READY_FOR_PM_REVIEW = YES / NO

AUTO_PRODUCTION = false.
