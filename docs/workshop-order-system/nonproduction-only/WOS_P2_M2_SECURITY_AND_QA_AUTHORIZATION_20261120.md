# WOS Issue #266 M2 | One-active-task immutable-proof review

**Status: CODE-ONLY DRAFT, NOT INSTALLED / NOT AUTHORIZED / no production release.**

Task: `WOS-P2-M2-PROOF-LOCK-001`; control Issue #104. New branch based on master `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`, rather than merging the older unreviewed stacked PR #268. Previous Draft PRs #263/#265/#267/#268 remain historical, **not machine-active**. No shared workflow/registry/config files may be changed by this task.

## Safety invariant: two people approve the exact same proof

The **single** SQL helper `wos_qa_p2_m2_checked_proof_set` is intended to be called inside an order-level CAS transaction for image selection, Office confirmation, and Workshop confirmation. It validates the actual organization, order, production `version_label`, selected READY non-superseded images, required categories PRODUCT/FILM_PATTERN/SIGNED_SAMPLE/CUSTOMER_APPROVED_SAMPLE, private `storage.objects` identity and version/update-time, verified SHA-256, expiry and replacement. Its digest uses a canonically sorted image proof list and immutable production specifications, including bucket/path/object identity and proof expiry. A separate numeric version marker links each signature to the corresponding order-CAS revision.

Office persists `office_proof_set_digest`, Office actor/time and `office_post_order_version`. Workshop must be an independent actor, re-check all current evidence and match the Office digest and expected numeric version **exactly** before writing its own signature. A newer proof verification timestamp, different image/category/order, changed object version, mutated SHA, expired proof or changed production specification denies signoff. Final FILM or SIGNED_SAMPLE material evidence is not accepted solely on historical signoff: in the same locked order-level transaction the server checks both saved proof digests, distinct signers, successive Office/Workshop numeric CAS bindings, a fresh canonical private Storage-proof digest and the current order version. A material record or new image selection revokes the previous pair, so a further final material record currently requires a new explicit Office+Workshop signature sequence; this conservative operating constraint is intentional until separately reviewed version-linked proof history exists. Direct starts remain prohibited. **Even a valid DB double-sign is NOT a production-start authorization.** The API response remains `proofStatus=UNVERIFIED` and `canStart=false`.

## Read-only QA facts behind the proposal

QA project `xulmpqaknlwqqculbsek`, fixed historic order v7/QA-R6/WAITING_MATERIAL. Real QA schema was read only: `public.wos_qa_verified_image_proofs` has `storage_object_id`, nullable `storage_object_version`, `storage_object_updated_at`, `verified_sha256`, `verified_at`, and `expires_at`; `storage.objects` has id/version/updated_at/archive/delete flags. Blank or null object versions fail closed; historic expired proof is never reused. Existing QA M2 Gate and receipts do **not** exist; no client EXECUTE grants are added.

## Mandatory review and E2E gates

- **Local/source unit checks:** strict v7-only contiguous six-stage timeline and static SQL guard checks are imported by the existing WOS test aggregator. They cannot establish PostgreSQL transaction correctness.
- **Independent GitHub-hosted exact-source CI:** TypeScript, complete WOS test suite, Next.js build, bundle secret audit, smoke. Pin and record the new business commit SHA in logs.
- **Independent disposable PG17:** create synthetic `storage.objects` with immutable id/version/update fields and current valid proofs; run the exact SQL from the new SHA with `ON_ERROR_STOP=1`. Test four-image category completeness (including CUSTOMER_APPROVED_SAMPLE), Office->Workshop success, post-double-sign final FILM/SIGNED_SAMPLE material positive and changed Storage object/filename/SHA/expiry negatives, numeric version drift refusal, baseline-item/category replacement, duplicate request, wrong org/role, gate expiry, numeric CAS race, rollback and denial of unsigned release. The previous original-source [Run #44734776597](https://github.com/lenchenalc-hongda/hongda-wos-p1-handoff-attestation/actions/runs/44734776597) **does not certify this patch**.
- **Independent security reviewer:** inspect the exact new SHA and the permission semantics of `SECURITY DEFINER` call to an invoker helper reading `storage.objects`. Confirm RLS, privilege grants, concurrency and Storage metadata trust. GitHub author/self-comment or CI success alone is not independent Reviewer PASS.
- **New explicit Owner decision required AFTER review** before installing any schema/functions, changing any QA data or Preview flag, opening any 15-minute CAS gate or performing a new synthetic E2E. No Production DB/RLS/Storage/Secrets, no automatic PR merge or external sends.

## Rollback outline (future isolated QA only)

For an approved and bounded QA installation, record exact blob/SQL schema fingerprints and a reversible rollback script before applying. Revoke any future client EXECUTE first, close both M2 gates atomically, preserve immutable receipt and signoff audit data, and only remove unused draft helper/columns once independent verification establishes no live references. Never use this outline as installation authority.

**Current release conclusion:** `SQL_DRAFT_ONLY`, `FIX_ROUND_1=IN_REVIEW`, `NEW_SHA_PG17=PENDING`, `INDEPENDENT_REVIEW=PENDING`, `QA_INSTALL=NOT_AUTHORIZED`, `PRODUCTION_START=PROHIBITED`. Historical Run #44751085295 verified only the immediately previous pre-fix HEAD `7e628dd52cc0d333b787fd0a92da4714d3c76aaa`; do not reuse it for this revision.
