# Customer Project Center — Data Source Map

Baseline: `3632fe898087979c6140067eb214206bbd330f79`  
Repository rows remain limited to repository evidence. External customer/ownership/receipt rows are extended by the verified production-evidence summary in `EXTERNAL_SOURCE_EVIDENCE.md`.

| Domain / fact | Repository evidence | Current authority evidenced here | Storage / identifier / org scope | Current write path | CPC treatment | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Organization | `organizations` in initial schema; Review Center RLS | Repository application organization identity | UUID `organizations.id`; org-scoped patterns | Supabase/application admin paths | Reuse; do not recreate | REUSE |
| User/profile | `profiles`, auth bridge, profile-directory RPC | Repository application profile identity | `profiles.id` UUID + unique `user_id -> auth.users.id`; `org_id` | Supabase authenticated/server paths | Reuse `profiles.id` for business FKs | REUSE |
| Runtime authentication | `src/lib/auth/current-user.ts`, `supabase-user.ts` | Supabase session + active profile for trusted server identity | Auth user id resolved through `profiles.user_id` | Server auth helpers | Reuse auth pattern; explicitly resolve profile id for business writes | REUSE_WITH_ID_BRIDGE |
| Leads DB model | initial `leads`, `lead_interactions`; legacy RLS | A repository lead model exists, but live authority is not proven | UUID; org_id; assigned_to references profiles | DB exists, but Leads UI does not directly use it | Treat as intake candidate only after reconciliation decision | AUTHORITY_UNRESOLVED |
| Leads UI state | `src/app/leads/page.tsx`, `src/lib/storage.ts` | UI convenience state, not CPC authority | browser keys + generic arrays | localStorage + `/api/data` | Do not use as CPC SoT | LEGACY |
| Generic site data | `site_data` migration + `/api/data` | Generic legacy sync store only | text key + JSONB; not entity-relational | generic GET/POST + file fallback | Prohibited for formal CPC truth | DO_NOT_USE_AS_SOT |
| Review Center cases | dedicated Review Center migrations/APIs | Authoritative for Review Center domain only | org-scoped UUID tables, profile FKs, lifecycle/RPCs | authenticated APIs/RPCs | Reuse patterns and links; do not duplicate case facts | REUSE_PATTERN |
| Knowledge | `knowledge_cards`, retrieval/embed APIs | Knowledge/content domain | UUID/org-aware knowledge records | knowledge APIs; server embedding update | Reuse as advisory context only | REUSE_ADVISORY |
| WeChat OA publishing | server-only publisher adapter | Publishing integration only | env-configured account/API identity | server adapter; some mock-style publish results | Do not treat as customer/conversation SoT | LIMITED_INTEGRATION |
| CPC shell | `src/app/customer-projects/page.tsx` | No business-data authority | Empty-state UI | none | Reuse shell only | NO_SOT |
| CPC domain model | `DOMAIN_MODEL_V1.md` and domain code | Design contract, not persisted business truth | typed/domain concepts | no formal CPC DB write path | Reuse semantics; schema still gated | DESIGN_ONLY |
| Canonical customer master | External workshop/finance production evidence; see `EXTERNAL_SOURCE_EVIDENCE.md` | Workshop `customers` is a concrete operational customer pool; final integration authority contract still pending | stable `C...` id; customer name/source/dates; no explicit org field evidenced in customer schema | workshop UI → state → `/api/data` → production `shared-data.json` | Reference stable external customer id; never recreate by name | EXTERNAL_OPERATIONAL_SOURCE_VERIFIED |
| Customer ownership | Workshop customer records carry `projectOwnerId/projectOwnerName`; downstream receipts copy owner attribution | Current operational ownership input in workshop tool; history/effective-date contract not evidenced | workshop employee `E...` reference + owner-name snapshot; repository `profiles.id` bridge missing | customer-pool edit path in workshop tool | Keep external; map responsible-person reference to `profiles.id` only through explicit bridge | EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS |
| Payment / receipt | Workshop `receiptRecords`; stable `RCP...` id, receiptNo and customerId linkage | Concrete operational receipt/commission source; correction/reconciliation contract incomplete | `RCP...` id + receiptNo + `customerId`; amount/account/date/commission snapshots; currency/status model not evidenced | workshop receipt entry/edit → `/api/data` → production `shared-data.json` | Read/integrate only after contract; no CPC financial ledger | EXTERNAL_OPERATIONAL_SOURCE_VERIFIED_WITH_GAPS |
| Order | No canonical order system implementation evidenced | Not established | Unknown | Unknown | Map only after source contract | UNVERIFIED_EXTERNAL |
| Quotation / acceptance | No canonical quote system implementation evidenced | Not established | Unknown | Unknown | Map only after source/version contract | UNVERIFIED_EXTERNAL |
| WhatsApp customer conversations | No repository integration found | Not established | Unknown | Unknown | Keep outside CPC until explicit integration contract | UNVERIFIED_EXTERNAL |

## Identity warning

CPC business relations are expected to use `profiles.id`. Authentication begins with `auth.users.id`, and legacy code/policies do not always keep those identifier types separate. Any CPC write path must explicitly resolve the authenticated user to the correct active same-org profile before storing business foreign keys.

## Authority rule

A repository table or UI representation is not automatically the business source of truth. Authority requires an explicit contract for stable identifier, ownership, organization scope, write path and reconciliation behavior. Missing external contracts remain `UNVERIFIED_EXTERNAL`.
