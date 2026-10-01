# Customer Project Center — Do Not Duplicate List

Baseline: `3632fe898087979c6140067eb214206bbd330f79`

The following facts or foundations must not be recreated as parallel CPC sources.

## 1. Organizations and profiles

Do not create:

- a second organization table for CPC;
- a second employee/user directory;
- CPC-specific user ids that compete with `profiles.id`.

CPC business relations should reference the existing repository profile identity after the auth-user to profile-id bridge is explicit.

## 2. External canonical customer master

Existing CPC decisions reserve canonical customer identity to an external source that is not yet mapped in this repository.

Do not create a new CPC customer master and later attempt to reconcile it by name.

Allowed future repository data should be a deliberate reference/mapping layer once the canonical external customer id is verified.

## 3. External customer ownership

Do not create CPC as a competing ownership authority.

CPC Project Owner is a project responsibility role and is not a replacement for canonical customer ownership.

Ownership changes, history and the responsible-person source must be integrated from the verified authority.

## 4. Payment / receipt truth

Do not create a CPC payment ledger or manually duplicated receipt balance.

CPC may later derive visibility from the verified financial source, but amount/status/reversal/reconciliation truth must remain with the authoritative system.

## 5. Orders and quotations

Until the real systems are mapped:

- do not invent canonical CPC order numbers;
- do not invent quote/version/acceptance truth;
- do not treat free-text follow-up notes as accepted quotation or confirmed order.

Future CPC references must preserve the external stable ids and version semantics.

## 6. Review Center cases

Do not copy Review Center cases, participants, actions or lifecycle history into new CPC review tables.

If a project needs a review/case association, link to the existing review-domain identifier rather than duplicating the case.

## 7. Knowledge cards

Do not clone knowledge content into CPC-specific copies merely for AI prompts. Reference/retrieve from the existing knowledge domain and preserve version/source boundaries.

## 8. Legacy generic persistence

Do not formalize CPC business facts in:

- browser `localStorage`;
- `site_data`;
- generic `/api/data` arrays;
- file fallback storage;
- new opaque JSON blobs that bypass entity relationships and authorization.

These mechanisms are explicitly unsuitable as CPC source of truth.

## 9. A second Leads truth

The database `leads` model and the current Leads UI persistence path already diverge. Do not solve that divergence by creating a third CPC lead store. Phase 0 must first decide the live intake authority and reconciliation path.

## 10. Authentication / authorization forks

Do not introduce a CPC-only role system, client-trusted permission model or service-role shortcut for ordinary user actions. Reuse the repository auth/profile foundation and hardened same-org authorization patterns.
