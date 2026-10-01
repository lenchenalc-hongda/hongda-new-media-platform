# Customer Project Center — Integration Gaps

Baseline: `3632fe898087979c6140067eb214206bbd330f79`  
These gaps are evidence/contract gaps, not permission to guess an implementation.

## Gate-blocking external gaps

### GAP-01 — Canonical customer master

Status: `EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`

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

Status: `EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`

Verified external evidence: workshop customer records carry `projectOwnerId/projectOwnerName`, and receipt creation copies the selected customer's owner attribution.

Remaining evidence:

- business approval that workshop customer ownership is the ownership authority CPC should reference;
- reassignment workflow;
- whether ownership history is retained;
- effective-date semantics;
- mapping from workshop employee `E...` identifiers to repository `profiles.id`.

CPC Project Owner must remain separate from customer ownership.

### GAP-03 — Payment / receipt source

Status: `EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`

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

Status: `UNVERIFIED_EXTERNAL`

Required evidence:

- authoritative order store;
- stable order id/order number;
- canonical customer link;
- order status lifecycle;
- relevant product/amount/date fields;
- cancellation/correction behavior;
- read/sync contract.

### GAP-05 — Quotation source and acceptance semantics

Status: `UNVERIFIED_EXTERNAL`

Required evidence:

- authoritative quote storage;
- stable quote id and version id;
- customer/project link;
- price/currency validity fields needed by CPC;
- what constitutes customer acceptance;
- revision/supersession behavior.

CPC must not infer acceptance from notes or AI output.

### GAP-06 — WhatsApp integration scope

Status: `UNVERIFIED_EXTERNAL`

Required decision/evidence:

- whether WhatsApp synchronization is in V1 or backlog;
- supported account/provider/API;
- stable customer/contact identifiers;
- conversation/message identifiers;
- inbound/outbound sync direction;
- retention/permission boundary;
- how a message is linked to canonical customer/project without making chat text an authoritative business fact.

No WhatsApp implementation is evidenced in the repository baseline.

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

Phase 0 may move from BLOCKED to PASS only after the PM closes the remaining contract gaps for the now-identified workshop customer/ownership/receipt sources, verifies order and quotation sources, records the WhatsApp V1/backlog decision, and verifies the required external-employee → `profiles.id` identity bridge.

Until then:

`PHASE_0_GATE = BLOCKED`

Formal CPC database/schema/RLS implementation must not start.
