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

The following required authorities are **UNVERIFIED_EXTERNAL** in this repository baseline:

1. canonical customer pool / customer master;
2. customer ownership and ownership-change history;
3. payment / receipt source of truth;
4. order source of truth;
5. quotation / quote-acceptance source of truth;
6. WhatsApp customer identity / conversation integration;
7. stable identifier mapping between those external systems and repository `profiles.id` / future CPC references.

Repository documents state that customer ownership and financial truth remain outside CPC until an explicit integration decision is made, but they do not provide the live external schemas, stable IDs, APIs/files, write contracts or reconciliation rules needed to implement that integration.

## 5. What Phase 0 establishes now

Repository evidence is sufficient to establish:

- what CPC must reuse inside this repository;
- which legacy stores must not become CPC source of truth;
- that formal CPC customer/project persistence does not yet exist;
- that external business-source contracts are a prerequisite for safe schema work.

Repository evidence is **not** sufficient to establish the live canonical IDs, ownership semantics or financial/order/quote synchronization contracts.

## 6. Gate decision

`PHASE_0_GATE = BLOCKED`

Blocking evidence still required before formal CPC schema work:

- verified canonical customer-source mapping and stable customer identifier;
- verified customer-ownership authority, responsible-person identifier and reassignment/history contract;
- verified payment/receipt source, customer link and reconciliation semantics;
- verified order source and stable order/customer identifiers;
- verified quotation source/version/acceptance semantics;
- explicit decision on WhatsApp integration scope and customer/conversation identifiers;
- explicit bridge from external responsible-person identities to repository `profiles.id` where applicable.

Until those mappings are evidenced and reviewed, Phase 0 must remain blocked and CPC must not create a competing customer, ownership, order, quotation or financial source of truth.
