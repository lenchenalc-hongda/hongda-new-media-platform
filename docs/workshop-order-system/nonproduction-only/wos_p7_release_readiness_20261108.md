# WOS P7 | Release-readiness evidence and hard gates (2026-11-08)

**Decision: NOT YET READY FOR PRODUCTION.** The work in this file is restricted to the independent `hongda-review-dev` project, the WOS QA branch and Preview. No Production DB/Storage/Feature Flag operation is authorized here. A successful unit test, safe Edge deployment, GitHub draft PR or synthetic SQL rollback test **does not** count as Production authorization.

## 1. Verified QA protections

- Draft [WOS PR #213](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/213) implements browser → same-origin Next image byte check → isolated Edge JWT byte verifier → service-only DB image proof → image-registration RPC → office readiness → order submission → workshop Inbox.
- `wos_register_uploaded_reference_image` requires a live DB proof bound to account, organization, order, path, object id, version, updated_at. Direct authenticated RPC without proof, expired proof and tampered version were denied in isolated QA transactions; matching proof was tested through a **rolled-back SQL simulation** (not an actual signed Edge proof from a browser).
- `wos_confirm_office_completeness` cannot rely on an unverified READY row alone. Admin/Sales may upload only while DRAFT; Operator can read SUBMITTED images but cannot alter the approved production baseline.
- New QA cleanup worker `wos-p7-orphan-cleanup` deployed with JWT verification and QA project pin, `mode=dry_run` by default. Real delete requires an isolated Edge configuration opt-in, active admin, explicit synthetic-delete acknowledgement, QA-org-scoped 5-minute lease, Storage object id/version recheck, SQL order lock, and Storage API `remove`. **No raw SQL deletion of Storage objects**.
- Service-only `wos_qa_claim_stale_orphan_for_org`, `wos_qa_list_stale_orphans_for_org`, `wos_qa_predelete_orphan`, `wos_qa_finish_orphan_claim` and `wos_qa_reconcile_expired_cleanup_claims` are uncallable by anon/authenticated.
- The lease-and-cleanup transaction was exercised with synthetic state in a **ROLLED BACK transaction**: acquiring one claim, blocking a competing claim, predelete matching, refusing false success with still-present Storage metadata, releasing a failed attempt, and expired-lease reconciliation. Existing 55 private Storage objects and 55 image registration records were preserved. Orphan candidates=0 and persisted claims=0 at the last check.
- `wos-p7-secretless-security-preflight.yml` automatically checks the known safety contracts and makes unauthenticated real HTTP probes to both QA Edge endpoints; no QA credentials, Production keys or admin token are used.
- Manual real-browser QA workflow is deliberately **not automatically triggered on push**. It uses a GitHub `hongda-review-dev` Environment and will execute **10 consecutive WOS business cycles** when explicitly dispatched, followed by browser restart / upload-response-loss resilience tests. Historical runs on older SHAs must not be confused with latest-HEAD acceptance.

## 2. Mandatory remaining release gates

| Gate | Required verifiable evidence | State |
|---|---|---|
| P0. QA authenticated Edge proof | Reviewed code SHA, real Admin browser image upload, Edge proof issued in isolated DB, direct unverified RPC denied, readiness and Operator image open | **PENDING** |
| P0. Protected browser soak | At least 10/10 real current-HEAD runs, stable login, operator inbox, cross-org denials, browser relaunch, interrupted upload and no duplicate order | **PENDING / GitHub Environment admin setting required** |
| P0. Orphan Storage API delete | Upload a **new disposable synthetic-only orphan**, let it age past policy, run protected worker, confirm Storage API physical deletion, lease audit and no live/registered image removed. Never delete historical registered objects | **PENDING** |
| P0. Natural JWT expiry | Actual JWT lifetime/refresh, session expiry, re-auth and failed/continued in-flight order after expiration; do not equate forced `refreshSession()` with natural expiry | **PENDING** |
| P0. Shared CI credentials | Review and separately approve [Draft #218](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/218): remove privileged provider Secrets from normal PR Build; validate other workflows | **UNMERGED** |
| P0. GitHub controls | Protect `master` and QA reviewed branch; restrict QA Environment branches and required reviewers/no bypass, then perform temporary human review or explicit release-owner policy decision about independent AI review | **UNVERIFIED / master currently unprotected** |
| P0. Production migration rehearsal | On disposable non-production restore/staging clone, apply Foundation and ordered production-specific WOS schema/RLS/Storage/RPC, test rollback, non-production role matrix and secrets/regions; exact schema diff before Production | **NOT STARTED** |
| P0. Production-compatible product | Current P7 QA path explicitly **PNG-only** and `VERCEL_ENV=production` fail-closed; must approve initial image-format scope or implement tested JPEG/WebP/phone-photo conversion, Production target identity, actual staff UX and authorization | **NOT READY** |
| P0. Owner go/no-go | Explicit reviewed exact HEAD, credential/migration boundaries, rollback/runbook, rollout and monitoring authority. Never infer permission from an AI green result | **NOT AUTHORIZED** |

## 3. GitHub administrator one-time configuration (no credentials in chat)

1. Check [master branch rules](https://github.com/lenchenalc-hongda/hongda-new-media-platform/settings/branches): require PR and review before merge, dismiss stale reviews, block force push/delete and inappropriate bypass, require the appropriate CI checks. Protect the separately reviewed WOS QA branch before granting any extra Write role.
2. Check [QA Environment](https://github.com/lenchenalc-hongda/hongda-new-media-platform/settings/environments): `hongda-review-dev` secrets accessible **only** to reviewed refs, with required reviewer if supported. A branch with uncontrolled Write access must never be allowed to execute secret-bearing QA code automatically.
3. Once protections and reviewer controls are confirmed, open [Manual QA browser workflow](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/workflows/wos-qa-real-browser-click-e2e.yml) → Run workflow → select reviewed QA branch. At execution, record the **actual** run SHA, all steps/logs, real 10-round outcome, and no exposed secrets; do not share passwords or authentication state.
4. Repeat the run when any code, migration or test fixture changes. Green runs from older commits are history only.

## 4. Production migration and rollback principles

- Production Supabase project currently has no WOS order/receipt tables and no `wos-private` bucket. Migrating **only** QA P7 delta SQL would fail and is prohibited. Required chain: Foundation schema → organization/role/RLS contracts → private Storage bucket & RLS → trusted-image attestation & isolated privileged verifier → atomic readiness/submission & inbox → staged Preview smoke/role tests → separately authorized Production rollout.
- P7 QA migration files contain explicit `QA-NONPROD-` checks, hard-pinned QA Supabase URL and fail-closed `VERCEL_ENV=production`. **Never copy those files directly to Production**. Prepare distinct Production migrations and service identity after independent review, including safe file formats, abuse quotas, expired proofs, monitoring and lease reclamation.
- Before SQL: snapshot permissions, migration ledger and existing schema/Storage; rehearse on a disposable restore; use expand/contract migrations and rollback for app flag + schema when feasible. Do not claim easy rollback for destructive data/storage migrations.
- At rollout: start disabled, apply approved migrations, run RLS/role/organization negative tests, enable limited staff pilot by separate owner decision, monitor errors/latency/storage costs and stop conditions. No current permission to perform any step on Production.

## 5. Current evidence locations

- [WOS PR #213](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/213) and [master Issue #104](https://github.com/lenchenalc-hongda/hongda-new-media-platform/issues/104)
- [QA cleanup/race Issue #219](https://github.com/lenchenalc-hongda/hongda-new-media-platform/issues/219)
- [security/independent review Issue #217](https://github.com/lenchenalc-hongda/hongda-new-media-platform/issues/217)
- [shared CI privilege fix PR #218](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/218)

**Do not mark READY FOR PRODUCTION until all P0 gates have verifiable evidence.**
