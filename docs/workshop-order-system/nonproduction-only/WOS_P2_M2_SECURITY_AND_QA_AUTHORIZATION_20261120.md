# HongdaOS WOS P2 M2 | Owner review / isolated QA installation candidate (NOT APPROVED)

**Issue #266, parent Draft PR #267:** business HEAD `ae0403f9b861b98e266c68fc7b482f704200729d` before M2. This document describes UNINSTALLED code and SQL. Never apply it to a real Supabase project without new exact-SHA Owner authorization and independent security review.

## 1. What actually exists in this change

- A new strict `p2-m2-action-contract.ts` Zod discriminated action parser validates MATERIAL_RECORD, BASELINE_SELECT, BASELINE_OFFICE_CONFIRM, and BASELINE_WORKSHOP_CONFIRM (no START). Role map Operator/Manager/Admin for material and workshop; Sales/Manager/Admin for Office image selection and confirmation. Actor, organization, user-submitted digest, production-start permission and direct table update fields are all rejected.
- A new `/api/workshop-orders/p2/m2` endpoint is *completely OFF* unless the dedicated, unset `WOS_P2_M2_QA_MUTATIONS_ENABLED=true`, Preview target, and exact QA Supabase origin match. Same-origin header, current Supabase Auth, active profile and same-organization test order `QA-%` are independently required. No service role, no P7 fallback, no unbounded order lookup.
- A dedicated `/workshop-orders/qa-m2` route plus RLS-backed `LiveQaM2OrderPicker` now supplies the future Office/Sales and Operator entrypoint. The page refuses all data when Supabase Auth mode, isolated QA origin or either dedicated M2 server/client flag is missing. On enablement, each actor must resolve one active current profile, exact same-org `QA-%` order and current numeric + business version; generic Viewer/foreign-deny text avoids order existence disclosure. The dropdown restricts actions by current role; SQL is the final authorizer. This route is **NOT DEPLOYED** or enabled, and a proposed M2 Gate still denies all real writes.
- A distinct `LiveQaWorkshopM2` QA-only form is rendered by existing workshop readiness UI ONLY if the dedicated, currently-UNSET `NEXT_PUBLIC_WOS_P2_M2_QA_MUTATIONS_ENABLED=true`. Existing RLS SELECT loads actual READY images and draft/current baselines for the same org+order+version. Buttons do not appear in the current QA Preview. Network failure preserves same requestId for replay verification; no `canStart` action exists.
- `WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql` is a proposal, NOT migration or deployed RPC. The transactional proposal reuses existing public material, image, baseline and verification tables, adds a **separate** two-role/one-order/15-minute M2 gate table (the legacy gate name CHECK remains untouched), a never-public-write M2 receipt ledger, one-CURRENT unique index, a server-only production-spec SHA-256 digest, and a strict CAS serializing SECURITY DEFINER RPC. It writes material ETA/arrival/counts, CURRENT baseline selection / supersession, and distinct Office/Workshop stamps, but every successful response deliberately states `proofStatus=UNVERIFIED` and `canStart=false`. It expressly REVOKEs public/anon/authenticated default EXECUTE privileges; even after accidental installation, further human-approved GRANT and actual owner gate activation are necessary.
- Defer full permission review/immutable spec anchor and independent SQL transaction acceptance until isolated PostgreSQL E2E and independent technical approval. Independent CI unit tests are not a database E2E. Do not upgrade old PR #263 v7 browser PASS to this code.

## 2. Detailed version and photo contract

- Numeric `wos_production_orders.version` is the optimistic-lock counter, not the production spec version. Production label `version_label` is required verbatim and compared to a server-read order row.
- SQL digest includes customer, product, printing scope, surfaces, position, acceptance, packaging, requested and batch quantities, CURRENT baseline image list, and each selected object's SHA proof. A material-only update can advance numeric version while leaving the digest unchanged; changing the CURRENT baseline changes digest and resets prior FILM/SIGNED_SAMPLE green states. The database receipt contains before/after digests, actor, request fingerprint and CAS expected/current numbers. There is currently no independently verified anchor across v7→v8+, hence every new M2 receipt remains UNVERIFIED (including a digest match). Any spec change outside M2 invalidates proof but separate human confirmation re-anchoring is needed before scheduling.
- Reference-image categories are actual QA CHECK values `PRODUCT`, `FILM_PATTERN`, `CUSTOMER_APPROVED_SAMPLE`, `SIGNED_SAMPLE` etc. Material category `FILM` is NOT an image category. `BASELINE_SELECT` requires at least PRODUCT/FILM_PATTERN/SIGNED_SAMPLE valid private images and records DRAFT only; Office rechecks all images at CURRENT promotion; old CURRENT is SUPERSEDED and FILM/SIGNED_SAMPLE approvals reset. A second, different Workshop identity can acknowledge CURRENT. No single-actor Office+Workshop.
- One crucial limitation: a checked `physicalCheckAttested` is an auditable human declaration but not itself an independent proof the fixture was physically fitted or a paper signed sample exists. Future real QA acceptance must observe actual authorised actors and physical evidence. Missing current-version proof, any open blocker, stale visual image, or failed workshop acknowledgment means production release remains prohibited.

## 3. Required independent security review before any SQL installation

**Blocking review points:**
0. Newly mounted Office order picker and role filter must be included in exact-SHA UI/role/browser QA once separate Preview deployment is authorised; code CI and offline PG are NOT real Office login acceptance.
1. Verify least-privilege on `SECURITY DEFINER` in exposed public schema, `search_path=''`, `auth.uid()` and active profile uniqueness; `REVOKE FROM PUBLIC, anon, authenticated`, explicit *later* GRANT only for QA and only after approval. Inspect owner role, function EXECUTE default, Data API exposure, RLS and all SQL statements.
2. Verify existing historical QA rows do not violate proposed partial UNIQUE CURRENT index; compare full public columns/constraints, check all expected image categories and verified proof expiry; check reference category selection and whether customer-approved sample is mandatory for this product.
3. Verify rechecking images for workshop confirmation, per-image object identity/sha and baseline supersession under concurrent Office/Operator requests; refuse images or attestations that were invalidated between attempts.
4. Verify `wos_qa_p2_m2_gate` CAS authorization change/expiry and emergency closure are independent from legacy `OPERATOR_WRITES` or Office write gates. Gate approval <=15 minutes tied to ONE NEW synthetic order, both roles and exactly one org. Never authorize existing v7 order.
5. Verify all actions are atomic with receipt idempotency, payload fingerprint, before/after immutable spec digest and no direct authenticated DML; no auto READY_TO_START transition, no production start, no sensitive data in 403.
6. Inspect rollback DDL (do NOT drop audit receipts if any QA write occurred) and preserve all new receipt evidence after test. A real gate shutdown needs both `enabled=false` and `enabled_until=NULL`, server/client flags OFF and a fresh independent negative probe. Do not use a fixed wait to infer CAS.
7. Require independent reviewer identity; owner-only checksum/CI cannot stand in for independent reviewer or approval. If SQL offline assertions cannot run, record `OFFLINE_PG_TRANSACTION=NOT_TESTED`.

## 4. Real QA baseline remains untouched

Project `xulmpqaknlwqqculbsek`; existing synthetic order `953d2204-3e65-4b75-b10e-c6e97f1bbb56` remains `WAITING_MATERIAL / v7`, six handoff rows, zero resource and visual baseline rows, one earlier image proof. The prior M1 exact-SHA CI Run #44716921002 was SUCCESS. M2 requires new exact-SHA CI.

## 5. NEXT owner authorization **NOT YET PROVIDED**

A future owner may authorize at most ONE new synthetic QA order and only the specified isolated QA project. Approval text must name:
- New business Draft PR final HEAD, exact SQL file Git blob SHA and independent reviewer run/artifact.
- Preview project/Deployment exact SHA (separate approval); server/client flags and M2 two DB Gate rows (each <=15min).
- QA Sales/Office + Operator identities and different-person signatures. Negative Viewer, wrong org, missing proof, concurrent CAS, requestId replay, mismatched payload, Gate expired, late network recovery, stale baseline and quantity shortages.
- An install preflight fingerprint, rollback/cleanup evidence, no deletion of created audit history, and explicit automatic closure on success/failure. No old synthetic order writes, no Production DB/RLS/Storage/Secrets changes, no PR merges or Agent Control V3.

**Status:** M2_CODE_PROPOSAL_POSSIBLE | SQL_INSTALL=NOT_AUTHORIZED | LIVE_QA_WRITE=NOT_AUTHORIZED | INDEPENDENT_SECURITY_REVIEW=PENDING | PRODUCTION_START=PROHIBITED.
