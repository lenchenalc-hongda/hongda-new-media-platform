# WOS P8 | Disposable staging migration and rollback rehearsal (2026-11-08)

**Current decision: NO Production migration authorization.** This is a preflight and
rehearsal plan only; it does not execute migrations, change RLS, create buckets,
deploy WOS code, or run cleanup workers. WOS PR #213 stays Draft.

## Verified live inventory (read-only, 2026-11-08 09:38 UTC)

| Contract | Isolated QA: hongda-review-dev | Actual Production: hongda-new-media |
|---|---:|---:|
| Core public.organizations / public.profiles | present / present | present / present |
| Required profile fields id, org_id, user_id, role, is_active | types align | types align |
| WOS public tables | 15 | **0** |
| WOS functions (public, named wos_*) | 11 | **0** |
| WOS table RLS policies | 22 | **0** |
| Storage bucket wos-private | yes | **no** |
| Private synthetic Storage objects | 78 (77 registered, 1 disposable unregistered) | not queried |

The private QA project reference is xulmpqaknlwqqculbsek. The Production
reference is amqpvxrurenevniilhtl; these must NEVER be swapped in scripts.

### Authoritative source map

1. Baseline migration on master:
   supabase/migrations/20261014102000_workshop_order_system_foundation.sql
   - Ten WOS tables: production_orders, sampling_requests, resource_readiness,
     reference_images, visual_baselines, visual_baseline_items, blockers,
     confirmations, sampling_technical_records, status_history.
   - Requires public.profiles(id, org_id, user_id, role, is_active) and the
     matching public.organizations contract already present in both projects.
   - Creates indexes, table grants, RLS enablements and policies.
   - Is in the repository, but has NOT been applied to Production.
2. Only on the **unmerged, immutable WOS P7 Draft #213**
   (reviewed SHA 29f908a0b32b530d551886e3ce4b6a0762f86cdc):
   - docs/workshop-order-system/nonproduction-only/wos_p7_atomic_submission.sql:
     office_readiness_receipts, submission_receipts, workshop_inbox, submission RPCs.
   - docs/workshop-order-system/nonproduction-only/wos_p7_private_storage.sql:
     private bucket/RLS, trusted synthetic PNG proof/registration.
   - docs/workshop-order-system/nonproduction-only/wos_p7_qa_orphan_claims_20261108.sql:
     privileged cleanup lease/claim table and functions.
   - Further QA-only hardening and Storage identity checks depend on these.
   - These files are pinned to QA URL, synthetic data and fail-closed
     Production environment checks. **They are not Production migrations.**

## Full staging rehearsal (not performed yet)

Use a fresh **disposable nonproduction database**, or a clean *approved*
nonproduction restore of the real Production schema that contains no live
secrets, real customer data or employee data. An existing 78-record QA DB is
not a clean migration target. Resource creation or added cost needs explicit
owner approval; do not auto-create a paid Supabase project.

1. **Before applying anything:** capture schema-only backup, migration version
   list, RLS/policy/grant baseline, current Storage bucket configuration,
   Auth/organization/role contract, Function and Edge dependencies, and a
   checksum of the exact reviewed source. Never expose credentials in logs.
2. **Base:** apply only approved, ordered foundations (profiles/orgs already
   exist; then WOS ten-table foundation). Verify each table, enum/check,
   foreign key, indexes, grants and RLS policy against the approved source.
   Confirm ordinary authenticated users cannot bypass org or role boundaries.
3. **Production-specific P7 SQL (requires a separate design + approval):**
   create transaction/readiness/receipt/Inbox tables and service-only
   binary-proof interface; design Production Storage bucket and strict RLS.
   Never run P7 QA-only patches or hardcoded QA URLs in Production. The
   Production verifier and cleanup worker must not inherit synthetic-only
   assumptions or privileged broad-access roles.
4. **Positive and negative tests:** create only synthetic staging users/orders;
   Admin and Sales draft-to-ready-to-submit; Operator sees SUBMITTED and
   approved private image; Viewer and foreign organization cannot access;
   out-of-order/replayed idempotency rejected; wrong image bytes/MIME,
   wrong org, expired proof and insufficient privileges rejected.
5. **Rollback:** start with feature flags OFF. For a failed staging trial,
   restore the disposable DB snapshot, not manual DROP TABLE on an existing
   shared database. Confirm that no WOS table, Storage bucket, function,
   grants, policies or synthetic data remain beyond the recorded baseline.
   Re-run core CPC/GLH/quotation contract tests to verify no collateral
   changes. Store the before/after schema diff and command exit evidence.
6. **Sign-off:** independent code/SQL review, exact commit pin, approved
   restore/replay run ID, Auth/RLS/Storage tests, timing and regional latency,
   data-loss/rollback proof, narrow pilot & alert/stop thresholds. Owner must
   separately approve an exact reviewed Production migration SHA and later
   the WOS application rollout; these are two distinct decisions.

## Zero-secret CI static preflight

Run:
    node scripts/wos-p8/verify-staging-migration-preflight.mjs

This only parses the existing 10-table foundation and checks that each
WOS table retains RLS and grant revocation, that the profile prerequisite
exists in SQL, and that the QA-specific P7 SQL has not been copied to
master. It has three fail-closed negative tests. It does not access a database.

## Actual disposable PostgreSQL 17 foundation rehearsal (CI, no cloud secrets)

The independent GitHub Actions job `wos-p8-postgres-foundation-rehearsal` uses
an ephemeral `postgres:17` service container. It boots disposable `auth.uid()`
and `public.profiles` schema fixtures, then loads the EXACT ten-table
foundation SQL inside `BEGIN; ... ROLLBACK;`; it MUST prove zero WOS tables
remain. It then applies the exact foundation a second time to the temporary
DB, asserting ten tables, ten RLS enablements, thirteen policies, no
UPDATE/DELETE grants to client roles, same-org read allowed and cross-org
read denied. The service container is discarded when CI exits.

This is stronger than a static check but only tests foundation DDL and
its baseline RLS in a synthetic database. It is NOT a clone of the
Production database, has no real Supabase Storage/Auth services, and
does not rehearse the remaining five P7 incremental tables, trusted image
proofs, Storage bucket/policies, Edge Functions, or complete Production
rollback. Those gates remain **OPEN**. The real QA Viewer-role hardening
policy is a separate P7 layer; Foundation alone is insufficient for go-live.

## Live, read-only consistency check (illustrative)

Execute separately through a secured Supabase connection in each intended
project; do NOT rewrite this into a mutating release script:

    SELECT now() AS checked_at,
      to_regclass('public.profiles') IS NOT NULL AS has_profiles,
      to_regclass('public.organizations') IS NOT NULL AS has_organizations,
      to_regclass('public.wos_production_orders') IS NOT NULL AS has_wos_foundation,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'wos_%') AS wos_tables,
      (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename LIKE 'wos_%') AS wos_policies,
      EXISTS(SELECT 1 FROM storage.buckets WHERE id='wos-private') AS has_private_bucket;

**Exit criteria for this PR:** secretless static CI PASS and independently
reviewed runbook; a new Draft PR only. No claim of completed disposable DB
migration/rollback, no master merge without separate authorization, no
production database or Storage changes.
