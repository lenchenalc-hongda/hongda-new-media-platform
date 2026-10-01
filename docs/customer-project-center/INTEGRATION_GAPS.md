# Customer Project Center — Integration Gaps

Baseline: `3632fe898087979c6140067eb214206bbd330f79`  
These gaps are evidence/contract gaps, not permission to guess an implementation.

## Phase 0 mapped external domains and later implementation gaps

### GAP-01 — Canonical customer master

Status: `PHASE0_MAPPED_PHASE4_CONTRACT_REQUIRED`

Verified external evidence: the Hongda workshop/finance production tool persists a `customers` collection with stable `C...` IDs and a defined customer record shape. See `EXTERNAL_SOURCE_EVIDENCE.md`.

Remaining evidence before schema work:

- business approval that the workshop customer pool is the canonical customer source CPC should reference;
- branch/org scope;
- duplicate/merge semantics;
- read/write direction;
- deletion/archive semantics;
- a narrow supported read/export contract instead of coupling CPC to the generic whole-state `/api/data` payload.

Until these are closed, CPC may design only a reference boundary, not a competing customer authority.

### GAP-02 — Customer ownership

Status: `PHASE0_MAPPED_PHASE4_CONTRACT_REQUIRED`

Verified external evidence: workshop customer records carry `projectOwnerId/projectOwnerName`, and receipt creation copies the selected customer's owner attribution.

Remaining evidence:

- business approval that workshop customer ownership is the ownership authority CPC should reference;
- reassignment workflow;
- whether ownership history is retained;
- effective-date semantics;
- mapping from workshop employee `E...` identifiers to repository `profiles.id`.

CPC Project Owner must remain separate from customer ownership.

### GAP-03 — Payment / receipt source

Status: `PHASE0_MAPPED_PHASE4_CONTRACT_REQUIRED`

Verified external evidence: workshop `receiptRecords` uses stable `RCP...` IDs, unique receipt numbers and explicit `customerId` linkage; the operational UI stores amount/date/account and commission-related snapshots.

Remaining evidence:

- business approval of the workshop receipt store as the integration authority;
- currency semantics;
- correction/reversal/void/refund semantics and immutable correction history;
- order linkage once the authoritative order source is mapped;
- attribution/reconciliation rules CPC may use for derived reporting;
- a narrow supported read/synchronization contract.

No CPC financial ledger should be created before this is verified.

### GAP-04 — Order source

Status: `CURRENT_PROCESS_VERIFIED_NO_UNIFIED_SOT`

Owner-confirmed current state:

- there is no unified order system;
- Dongguan and Shantou operate separately;
- when Dongguan needs Shantou to produce transfer film / fixtures, a production instruction sheet is sent through QQ.

Phase 0 consequence:

- there is no existing canonical order ledger for CPC to duplicate;
- QQ is a transport channel, not an order database;
- the production instruction sheet is a current operational artifact;
- future order/project structure may be created by CPC only if it replaces fragmented work and preserves the existing handoff during transition.

Detailed order lifecycle, identifiers and cutover behavior are Phase 1/2/4 design work, not a remaining Phase 0 evidence blocker.

### GAP-05 — Quotation source and acceptance semantics

Status: `CURRENT_FILE_SOURCE_VERIFIED_NO_STRUCTURED_SOT`

Owner-confirmed current state:

- formal quotations are Excel files;
- they are stored/shared in WeCom;
- no structured quote id/version/acceptance system is evidenced.

Phase 0 consequence:

- the quotation file is the current source artifact;
- CPC must not infer customer acceptance from notes, chat text or AI output;
- a future structured quotation workflow may add metadata/version/acceptance around the existing file flow, but should not require sales to manually re-enter the same quote.

Exact quote numbering, versioning and acceptance capture are later workflow/schema decisions.

### GAP-06 — WhatsApp integration scope

Status: `V1_BACKLOG_DECIDED`

WhatsApp is used operationally for customer follow-up, but Master Checklist V1 already places automatic WhatsApp/WeChat synchronization in backlog.

Therefore Phase 0 does not require provider/contact/message mapping for V1. Future integration must still define permissions, identifiers and confirmation boundaries before chat content can create business facts.

## Repository gaps that must be resolved during design

### GAP-07 — Auth user to profile-id write bridge

Repository auth verification begins with `auth.users.id`, while formal business FKs should use `profiles.id`.

Required contract:

- one reusable server helper/RPC pattern that returns the active same-org profile id for business writes;
- tests that prevent auth-user UUIDs from being stored in profile-id FKs.

### GAP-08 — Lead authority / reconciliation

The repository has a database `leads` model, but the current Leads UI persists through localStorage + generic `/api/data`.

Required decision:

- identify the live lead source actually used by the business;
- determine whether database leads contain authoritative/legacy/test data;
- define migration/reconciliation and cutover behavior;
- prevent CPC from creating a third lead source.

This gap does not authorize fixing legacy lead RLS inside an unrelated CPC task.

### GAP-09 — Legacy RLS patterns

Older RLS includes identity/org patterns that should not be copied into CPC.

Required action during Phase 4 design:

- derive CPC authorization from hardened current patterns;
- verify org isolation and profile-id semantics with dedicated tests;
- review any legacy helper reuse explicitly.

### GAP-10 — WeChat publishing versus customer communication

The existing WeChat adapter demonstrates Official Account publishing configuration, not customer-sales conversation authority.

Required decision:

- whether CPC needs only links to published content, or a different customer-communication integration;
- do not conflate the two.

## Phase 0 exit criteria

The current-state audit is now complete enough to proceed:

- customer / ownership / receipt source identified;
- current order reality identified as no unified SoT;
- current quotation reality identified as WeCom-hosted Excel artifacts without structured lifecycle truth;
- WhatsApp V1 automatic sync explicitly remains backlog;
- employee/profile bridge strategy is explicit.

Therefore:

`PHASE_0_GATE = PASS`

This PASS closes the **current-system audit gate only**. It does not start formal database work.

Still required before Phase 4 implementation:

- narrow read/sync boundary for workshop customer/ownership/receipt data;
- actual external employee id → `profiles.id` mapping rows;
- org isolation and authorization design;
- order/quotation structured lifecycle choices produced by Phase 1/2 workflow design;
- migration/cutover behavior that avoids duplicate employee work.

Formal CPC database/schema/RLS implementation remains blocked by Master Checklist Phases 1–3 and Phase 4 review.
