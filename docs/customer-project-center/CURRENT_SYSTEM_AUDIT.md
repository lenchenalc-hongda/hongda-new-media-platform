# Customer Project Center — Current System Audit

Audit task: `CPC-P0-CURRENT-SYSTEM-AUDIT-001`  
Repository baseline: `3632fe898087979c6140067eb214206bbd330f79`  
Scope: repository evidence only. No external system, Production database, customer ownership, order, quote, payment or WhatsApp fact is inferred when the repository does not provide evidence.

## 1. Audit purpose

Phase 0 exists to establish what already owns each business fact before Customer Project Center (CPC) creates any formal schema. The audit separates:

- repository-backed application authority;
- legacy/convenience storage that must not become CPC source of truth;
- reusable identity, authorization and workflow infrastructure;
- external business facts whose authoritative source is not evidenced in this repository.

The existing CPC architecture and domain documents already require one source of truth per business fact and explicitly prevent CPC from inventing a second customer-ownership or financial truth.

## 2. Repository-backed findings

### 2.1 Organizations, profiles and authenticated identity

Repository evidence:

- `supabase/migrations/001_initial_schema.sql` creates `organizations` and `profiles`.
- `profiles.id` is the repository profile identifier; `profiles.user_id` uniquely references `auth.users(id)`; `profiles.org_id` references `organizations(id)`.
- `src/lib/auth/current-user.ts` centralizes server-side current-user access.
- `src/lib/auth/supabase-user.ts` verifies the Supabase session and then resolves an active `profiles` row by `profiles.user_id = auth.users.id`.
- Review Center migrations use composite business foreign keys such as `(profile_id, org_id) -> profiles(id, org_id)`.
- `supabase/migrations/20260819_review_center_profile_directory.sql` exposes a same-organization active profile directory through a controlled authenticated RPC.

Audit conclusion:

- `organizations` / `profiles` are the reusable repository identity and organization foundation.
- CPC business foreign keys should use `profiles.id`, consistent with the existing CPC domain decision and Review Center database pattern.
- A deliberate bridge is still required wherever runtime auth code exposes an `auth.users.id`-shaped current-user id but business tables require `profiles.id`. CPC must not silently mix these identifier types.

### 2.2 Leads

Repository evidence:

- `supabase/migrations/001_initial_schema.sql` defines a `leads` table and `lead_interactions`.
- `supabase/migrations/20260705_rls_policies.sql` contains legacy lead RLS.
- `src/app/leads/page.tsx` does not read/write the `leads` table directly. It uses `usePersistentState(STORAGE_KEYS.LEADS, MOCK_LEADS)`.
- `src/lib/storage.ts` persists that state through browser `localStorage` plus the generic `/api/data` sync path.

Audit conclusion:

- The repository contains both a database lead model and a separate UI persistence path.
- Repository evidence does not establish one canonical live lead source across these paths.
- CPC may treat leads as an intake/integration domain only after the live authority and migration/reconciliation contract are decided.
- CPC must not assume the current Leads page is canonical customer or project truth.

### 2.3 `site_data`, `/api/data` and browser persistence

Repository evidence:

- `supabase/migrations/20260708_site_data.sql` creates generic `site_data(key, data JSONB, updated_at)`.
- That migration grants table access to `service_role`, `anon` and `authenticated`, with RLS policies allowing broad select/insert/update.
- `src/app/api/data/route.ts` provides generic key-based array GET/POST, prefers Supabase `site_data`, and also contains file-storage fallback behavior.
- `src/lib/storage.ts` combines `localStorage`, `/api/data` synchronization and polling.

Audit conclusion:

- These are legacy/convenience persistence mechanisms, not acceptable CPC formal business sources of truth.
- CPC customer, project, ownership, task, order, quote or financial facts must not be stored as generic `site_data`, generic `/api/data` arrays or browser `localStorage`.

### 2.4 Review Center

Repository evidence:

- Review Center has dedicated migrations, org-scoped tables, lifecycle mutations, RPCs, directory APIs and authorization helpers.
- `supabase/migrations/20260817_review_center_phase2_core_foundation.sql` uses org-scoped constraints, composite profile/org foreign keys and RLS.
- `src/app/api/review-center/profile-directory/route.ts` authenticates and calls a narrow RPC.
- `src/lib/review-center/case-route-auth.ts` distinguishes authentication/profile authorization failures without using a service-role shortcut.

Audit conclusion:

- Review Center is authoritative only for its review/case domain.
- Its server-auth, org scoping, composite profile FK, narrow RPC, lifecycle/audit and fail-closed API patterns are strong implementation precedents for future CPC work.
- CPC must not copy Review Center case facts into a second CPC review store.

### 2.5 Knowledge

Repository evidence:

- `knowledge_cards` exists in the initial schema and later knowledge migrations.
- Knowledge retrieval APIs exist under `src/app/api/knowledge/*`.
- `src/app/api/knowledge/embed/route.ts` may use the Supabase service-role key server-side to update embeddings.

Audit conclusion:

- Existing knowledge infrastructure can be reused as advisory/context material.
- Knowledge content must not be promoted into confirmed customer/project/financial facts without the CPC human-confirmation boundary.

### 2.6 WeChat integration

Repository evidence:

- `src/lib/integrations/wechat/WechatPublisherAdapter.ts` is a server-only WeChat Official Account publishing adapter.
- It reads WeChat configuration from server environment variables.
- Several publishing operations currently return mock-style identifiers rather than proving a production customer-conversation integration.

Audit conclusion:

- The repository evidences a content-publishing integration, not a canonical customer-conversation, customer-identity or sales follow-up source.
- It must not be treated as proof of CPC customer communication synchronization.

### 2.7 Customer Project Center implementation

Repository evidence:

- `src/app/customer-projects/page.tsx` is a shell/empty-state page.
- Existing CPC docs define the domain and safety boundaries.
- No CPC customer/project business tables, migrations or CPC RLS were found at this baseline.
- Existing domain work intentionally precedes formal database implementation.

Audit conclusion:

- CPC does not yet own formal customer/project persistence.
- Phase 0 and subsequent business-model gates must be completed before schema work.

## 3. Legacy security/identity observations relevant to reuse

The legacy repository is not uniformly safe to copy as-is.

Examples:

- `supabase/migrations/20260705_rls_policies.sql` includes older JWT metadata helpers.
- Lead policies mix `assigned_to` (declared as a `profiles.id` foreign key) with an auth-user helper, demonstrating why CPC must explicitly resolve profile identity.
- The legacy `site_data` migration is intentionally broad and is not a CPC authorization template.

Therefore CPC should reuse the hardened Review Center-era patterns, not mechanically copy older RLS or generic storage patterns.

## 4. External business-source status

The repository itself still does not contain these external sources, but a follow-up Phase 0 evidence pass identified the existing Hongda workshop/finance production tool as a concrete operational source candidate for three domains. See `EXTERNAL_SOURCE_EVIDENCE.md`.

Current evidence classification:

1. canonical customer pool / customer master — `EXTERNAL_OPERATIONAL_SOURCE_VERIFIED`: workshop `customers` with stable `C...` IDs; integration/authority contract still incomplete;
2. customer ownership — `EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`: `projectOwnerId/projectOwnerName` on workshop customer records; history/effective-date and `profiles.id` bridge unresolved;
3. payment / receipt — `EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS`: workshop `receiptRecords` with stable `RCP...` IDs and customer links; correction/reconciliation/currency/API contract unresolved;
4. order source — `CURRENT_PROCESS_VERIFIED_NO_UNIFIED_SOT`: there is no unified order system today; Dongguan and Shantou operate separately, and Dongguan sends transfer-film / fixture production instruction sheets to Shantou through QQ when production is required there;
5. quotation / quote-acceptance source — `CURRENT_FILE_SOURCE_VERIFIED_NO_STRUCTURED_SOT`: formal quotations are Excel files stored/shared in WeCom; no structured quotation id/version/acceptance system is evidenced;
6. WhatsApp customer identity / conversation integration — `V1_BACKLOG_DECIDED`: WhatsApp remains an operational communication channel, but automatic synchronization is backlog and is not a Phase 0/V1 source requirement;
7. external workshop employee ID → repository `profiles.id` mapping — `BRIDGE_CONTRACT_DEFINED_MAPPING_ROWS_DEFERRED`: CPC will use an explicit stable mapping and will not use display-name matching as the normal write contract.

The follow-up evidence narrows the unknowns but does not authorize CPC to become a second customer, ownership or financial authority.

## 5. What Phase 0 establishes now

Repository evidence is sufficient to establish:

- what CPC must reuse inside this repository;
- which legacy stores must not become CPC source of truth;
- that formal CPC customer/project persistence does not yet exist;
- that external business-source contracts are a prerequisite for safe schema work.

Repository evidence alone is not sufficient, but the follow-up external evidence identifies live workshop customer IDs, ownership references and receipt IDs. Order, quotation, WhatsApp, identity-bridge and complete synchronization/correction contracts remain unresolved.

## 6. Gate decision

`PHASE_0_GATE = PASS`

Owner closeout establishes the current business reality needed for the audit gate:

- customer / customer ownership / receipt facts have a concrete current operational source in the Hongda workshop/finance tool and remain external during transition;
- there is **no unified order source of truth today**;
- the current Dongguan → Shantou transfer-film / fixture production-instruction path uses a production instruction sheet sent through QQ;
- formal quotations are Excel files kept/shared in WeCom, without a verified structured quotation/version/acceptance store;
- WhatsApp automatic synchronization stays in backlog for V1;
- employee identity will use an explicit external employee id → `profiles.id` bridge when formal CPC writes need that relation.

The owner also approved a low-friction modernization principle: current tools are evidence of today's process, not constraints that must be preserved forever. CPC may replace fragmented steps when doing so removes work rather than adds duplicate manual entry.

Phase 0 PASS means **the current-state sources and gaps are mapped well enough to continue business/workflow design**. It does not authorize database implementation.

Before Phase 4 schema/RLS work can proceed, implementation-specific contracts still need to be completed for:

- customer/ownership/receipt read or synchronization boundary;
- actual external employee id → `profiles.id` mapping rows;
- quote/order identifiers and lifecycle only to the extent the future workflow chooses to create them;
- org/authorization and migration/cutover behavior.

The overall `BUSINESS_DATABASE_GATE` therefore remains blocked by Master Checklist Phases 1–3 and the Phase 4 design gate.
