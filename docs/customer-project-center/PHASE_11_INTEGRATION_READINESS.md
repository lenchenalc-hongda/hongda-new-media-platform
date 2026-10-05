# Customer Project Center — Phase 11 Integration Readiness

Status: repository-side integration layer complete
Production changes: none
Live external adapters: not enabled

## 1. Purpose

Phase 11 establishes one typed server-side integration registry and an
admin-only read boundary. The registry describes authority, availability,
identifiers, limitations and fallback behavior. It is metadata, not business
truth.

The repository can proceed to Phase 12 internal UI/QA while external finance,
order, quotation and lead integrations remain pending. That readiness applies
to **V1 internal/pilot usability** only. It does not mean full live integration
is ready.

## 2. Repository-ready now

| Domain | Repository state | Boundary |
| --- | --- | --- |
| `customer_master` | Reference contract ready | External workshop customer master remains authoritative; no approved narrow read adapter is configured |
| `customer_ownership` | Reference contract ready | External workshop ownership remains authoritative; external employee id to `profiles.id` rows are not present |
| `receipt_payment` | Reference contract ready | External receipt records remain authoritative; CPC must not create a financial ledger |
| `orders` | Registry and fallback ready | No unified order source of truth; current production instructions remain artifacts |
| `quotations` | Registry and fallback ready | Current Excel quotation artifacts remain the source; no structured lifecycle is invented |
| `leads` | Registry and fallback ready | Live lead authority remains unknown and no third lead store is created |
| `review_center` | Read-only availability probe ready | Review Center remains authoritative and is never copied into CPC |
| `knowledge` | Read-only availability probe ready | Knowledge remains advisory context and never becomes confirmed business fact |
| `whatsapp` | Backlog boundary documented | Automatic conversation synchronization remains backlog |
| `wecom_customer_conversation` | Backlog boundary documented | Customer conversation synchronization remains backlog |

Internal reuse currently includes:

- authenticated `profiles.id` and `profiles.org_id` resolution;
- same-organization read availability checks against `review_cases`;
- same-organization read availability checks against `knowledge_cards`.

No Review Center or Knowledge rows are copied into CPC tables.

## 3. Pending external gates

The following domains remain `external_contract_pending`, `unknown`,
`current_artifact_only`, or `backlog`:

- `customer_master`;
- `customer_ownership`;
- `receipt_payment`;
- `orders`;
- `quotations`;
- `leads`;
- `whatsapp`;
- `wecom_customer_conversation`.

There is no approved narrow workshop endpoint in repository evidence. Phase 11
therefore defines adapter interfaces only and returns
`EXTERNAL_CONTRACT_PENDING` when external reads are attempted. It does not
invent a URL, read production `shared-data.json` directly, or use the legacy
generic data transport.

## 4. Exact next integration prerequisites

### Customer master

- Business approval of the canonical customer authority.
- A narrow read/export contract with stable external customer ids.
- Organization scope, archive, duplicate and merge semantics.

### Customer ownership

- Approval of external ownership authority and reassignment behavior.
- Ownership history/effective-date semantics.
- Verified external employee id to same-organization `profiles.id` mapping rows.
- No display-name fallback in normal writes.

### Receipt / payment

- Approval of the receipt store as integration authority.
- Currency, reversal, refund and correction semantics.
- Reconciliation/cutoff rules and a narrow read contract.
- No CPC financial ledger or write-back.

### Orders

- An approved order lifecycle and stable identifier if CPC will replace the
  current fragmented process.
- Preservation of the current production-instruction handoff during transition.

### Quotations

- Structured quotation metadata/version/acceptance decisions.
- A stable relationship to the existing source artifact.
- A human-confirmation boundary for acceptance.

### Leads

- Resolution of the live lead authority.
- Reconciliation of legacy UI state and database lead records.
- A migration/cutover contract that avoids creating a third lead store.

### WhatsApp and customer WeCom conversation

- Provider/contact/message identity contracts.
- Permission and retention rules.
- Explicit confirmation boundaries before chat text can become a business fact.

## 5. Phase 12 decision

`PHASE_12_INTERNAL_UI_QA_READY = YES`

The repository may continue Phase 12 internal UI and QA using:

- confirmed CPC-owned facts from Phases 4–10;
- read-only Review Center and Knowledge availability/context;
- honest unknown states for external customer, ownership, receipt, order,
  quotation, lead and conversation facts.

`FULL_LIVE_INTEGRATION_READY = NO`

Full live integration still requires the external contracts, Production
approval, credentials/environment changes, and any separately approved schema
work listed above.
