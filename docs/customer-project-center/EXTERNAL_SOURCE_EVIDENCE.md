# Customer Project Center — External Source Evidence

Audit task: `CPC-P0-EXTERNAL-SOURCE-MAP-001`  
Repository baseline: `daf6eb818138d528f0c663fd8f944db2dd01366d`  
Evidence scope: previously captured Hongda workshop/finance production audits plus the repository audit already merged in Phase 0. No Production data is modified by this document.

## 1. External system identified

The existing Hongda workshop/finance tool is a separate operational system from this repository.

Verified deployment evidence from prior production audits:

- server process: `/opt/hongda-workshop/server.cjs`;
- production data file: `/opt/hongda-workshop/data/shared-data.json`;
- the server reads/writes that file and exposes the existing `/api/data` synchronization path;
- the production JSON has included `customers`, `receiptRecords` and `employees` among its top-level keys;
- historical production health checks showed the JSON parsed successfully and was actively served by the running application.

A GitHub repository named `lenchenalc-hongda/hongda-workshop-tool` exists but is empty as of this audit. It is not a usable source contract. The evidence below therefore refers to the operational production tool/data shape, not to a versioned implementation in GitHub.

## 2. Customer pool evidence

Observed customer record shape:

`id, customerName, projectOwnerId, projectOwnerName, firstConfirmedOrderDate, customerSource, remark, newCustomerRewardPaid, newCustomerRewardPaidMonth, newMediaRewardPaid, newMediaRewardPaidMonth, newMediaOperatorId, newMediaOperatorName, sourcePlatform, sourceContent, firstContactDate, createdAt, updatedAt`

Observed behavior:

- customer IDs use stable application identifiers such as `C...`;
- customer ownership is stored directly on the customer record as `projectOwnerId` / `projectOwnerName`;
- the customer pool is used by the production UI and persisted through the workshop tool;
- later production non-regression evidence confirmed customer ownership values were actively present in production data.

Phase 0 classification:

`CUSTOMER_SOURCE = EXTERNAL_OPERATIONAL_SOURCE_VERIFIED`

This proves a concrete external customer-pool source exists. It does **not** yet prove:

- a formal ownership-history/effective-date model;
- deletion/archive semantics;
- multi-organization scope;
- a stable API designed for CPC consumption;
- an approved business decision that CPC may treat every workshop customer record as canonical without reconciliation.

CPC must reference the stable external customer ID rather than create a second customer identity by name.

## 3. Customer ownership evidence

The operational customer record carries `projectOwnerId` and `projectOwnerName`. Workshop employee identifiers use values such as `E...`.

Receipt entry reads the selected customer and copies the customer's current owner reference into the receipt record. This demonstrates that the workshop customer pool is currently used as the operational ownership input for downstream receipt/commission attribution.

Phase 0 classification:

`CUSTOMER_OWNERSHIP_SOURCE = EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`

Remaining contract gaps:

- no ownership history/effective-date model has been evidenced;
- owner reassignment audit semantics are not yet evidenced as a dedicated domain;
- workshop employee IDs are not repository `profiles.id`;
- name matching is not an acceptable permanent identity bridge.

Required integration rule: maintain customer ownership outside CPC and build an explicit external employee/reference → `profiles.id` bridge where CPC needs a local person relation.

## 4. Receipt / payment evidence

Observed receipt record shape:

`id, receivedDate, receiptNo, customerId, customerName, projectOwnerId, projectOwnerName, receivedAmount, collectionAccount, customerType, commissionRate, commissionAmount, includeInCommission, isSampleOrDevelopment, isTaxIncluded, remark, createdAt, updatedAt, createdBy, updatedBy`

Observed behavior:

- receipt IDs use stable application identifiers such as `RCP...`;
- receipt number uniqueness is checked by the UI;
- a receipt cannot be saved unless its `customerId` exists in the workshop customer pool;
- receipt creation stores `customerId` and snapshots customer/owner values;
- receipt records are used by the workshop tool for commission/reporting calculations;
- later production checks confirmed active monthly receipt data remained independent of unrelated attendance simulations.

Phase 0 classification:

`PAYMENT_RECEIPT_SOURCE = EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`

This is sufficient to identify the existing operational receipt source that CPC must not duplicate. It is not sufficient to design a financial integration yet because the available evidence does not define:

- currency semantics;
- reversal/void/refund state;
- immutable correction history;
- financial reconciliation/cutoff rules;
- a stable read-only integration API or export contract.

CPC must not create its own payment ledger from these records.

## 5. Employee / profile identity bridge

Workshop ownership uses workshop employee IDs (for example `E...`). CPC business foreign keys use repository `profiles.id`.

Prior operational evidence proves many workshop employees can be matched to business people, but matching by display name/case/whitespace is not a durable identity contract.

Required before CPC schema/RLS implementation:

- an explicit mapping list or stable source key from workshop employee ID → repository `profiles.id`;
- rules for resigned/missing/unmatched people;
- same-organization validation;
- no fallback to raw display-name matching during normal writes.

## 6. Sources still not evidenced

The available workshop/finance evidence does **not** establish authoritative contracts for:

- order source / stable order ID;
- quotation source / quote version / acceptance semantics;
- WhatsApp customer/contact/conversation identity;
- a customer-facing WeCom conversation source.

A workshop `firstConfirmedOrderDate` customer field is only a date attribute. It is not an order entity or order source of truth.

The existing workshop `/api/wecom/status` server route is not evidence of an active frontend customer-conversation integration.

## 7. Phase 0 gate

After this external evidence pass:

- canonical customer source: concrete operational source identified, integration/authority details still incomplete;
- customer ownership: concrete operational source identified, history/profile bridge incomplete;
- receipt/payment: concrete operational source identified, correction/reconciliation/API contract incomplete;
- order: unresolved;
- quotation: unresolved;
- WhatsApp: unresolved;
- external employee → `profiles.id`: unresolved.

Therefore:

`PHASE_0_GATE = BLOCKED`

This is a narrower blocker than the repository-only audit. Formal CPC schema/migration/RLS work must still wait until the remaining source contracts and identity bridge are verified.
