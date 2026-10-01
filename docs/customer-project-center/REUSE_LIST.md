# Customer Project Center — Reuse List

Baseline: `3632fe898087979c6140067eb214206bbd330f79`

CPC should reuse the following existing assets rather than rebuild them.

## 1. Organization and profile foundation

Reuse:

- `organizations`;
- `profiles`;
- `profiles.id` as the business-person foreign-key identifier;
- `(profiles.id, profiles.org_id)` composite-reference pattern used by Review Center;
- same-org active profile-directory behavior where a controlled selector is needed.

Condition:

- authenticated `auth.users.id` must be deliberately resolved to `profiles.id` before formal CPC business writes.

## 2. Server authentication and authorization patterns

Reuse the hardened server-side approach in:

- `src/lib/auth/current-user.ts`;
- `src/lib/auth/supabase-user.ts`;
- Review Center route authorization helpers.

Preferred characteristics:

- verify session server-side;
- resolve active profile;
- fail closed;
- enforce org boundary in database/RPC and server route;
- avoid trusting client-provided role or owner fields.

Do not copy older permissive RLS patterns blindly.

## 3. Review Center database/RPC patterns

Reuse as engineering precedent:

- org-scoped tables;
- composite profile/org foreign keys;
- narrow authenticated RPCs;
- controlled profile directory;
- explicit lifecycle mutations;
- immutable/audit-friendly fields;
- database-level constraints plus RLS;
- error envelopes that fail closed.

Reuse the pattern, not the Review Center's business data.

## 4. Customer Project Center domain decisions already merged

Reuse the semantics in:

- `docs/customer-project-center/ARCHITECTURE_BASELINE.md`;
- `docs/customer-project-center/DOMAIN_MODEL_V1.md`;
- `docs/customer-project-center/DECISION_LOG.md`;
- existing CPC domain code/types.

In particular preserve:

- Customer is distinct from Project;
- Project represents one concrete commercial opportunity;
- one Project Owner plus collaborators;
- confirmed facts are distinct from AI drafts/suggestions;
- customer ownership/payment remain externally authoritative until integration is decided;
- reports derive from confirmed work.

## 5. CPC page shell and feature-gated entry point

Reuse `src/app/customer-projects/page.tsx` as the current shell rather than starting another parallel module. Replace empty states incrementally only after the relevant business/data gates pass.

## 6. Knowledge infrastructure

Reuse existing knowledge cards and retrieval infrastructure for:

- product/process context;
- suggested next actions;
- AI drafting context;
- explanatory assistance.

Boundary:

Knowledge/AI output remains advisory. It must not directly establish customer ownership, accepted quotation, order, payment, promised delivery or other consequential business fact.

## 7. Existing integration adapters where their scope matches

The WeChat Official Account adapter may be reused for its existing publishing scope if later CPC functionality legitimately needs that capability.

Do not reinterpret it as customer chat synchronization or customer identity authority.

## 8. Existing test / CI / Agent Control delivery system

Reuse the proven bounded Agent Control workflow for subsequent CPC tasks:

- bounded file scope;
- deterministic Draft PR;
- artifact verification;
- same-HEAD CI/Vercel;
- PM review;
- replay guard;
- human merge;
- no autonomous Production changes.

## 9. Leads as an integration candidate, not automatic truth

The repository already has lead concepts and a Leads UI. CPC should reuse useful intake concepts only after Phase 0 resolves which live path is authoritative and how legacy localStorage/site_data state relates to the database `leads` table. No duplicate lead/customer master should be introduced merely to avoid that decision.


## 10. Hongda workshop/finance external references

Phase 0 external evidence identifies the existing workshop/finance tool as an operational source for customer records, customer-owner references and receipt records.

Reuse rule:

- preserve workshop customer `C...` IDs as external customer references;
- preserve workshop receipt `RCP...` IDs / receipt numbers as external financial references;
- preserve external ownership as an external reference rather than copying it into a second CPC ownership authority;
- create an explicit workshop employee ID → `profiles.id` bridge before any CPC business FK depends on that person;
- integrate through a narrow read/sync contract rather than coupling CPC directly to browser state or copying the whole `shared-data.json`.

The current production file format is evidence of the source, not the desired long-term integration API.
