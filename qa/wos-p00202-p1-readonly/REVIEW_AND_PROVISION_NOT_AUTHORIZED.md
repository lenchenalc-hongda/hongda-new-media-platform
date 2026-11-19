# WOS P0-02-02 — QA-only OIDC and private aggregate read-only proof
**STATUS: QA aggregate proof role and private function installed under the earlier exact one-time Owner authorization; NOLOGIN / no password. OIDC trust, Environment secrets, workflow merge/dispatch and P1 E2E remain NOT AUTHORIZED without new exact evidence. Do NOT rerun INSTALL_NOT_AUTHORIZED.sql.**

## Fixed identity

- Repository: lenchenalc-hongda/hongda-new-media-platform
- Protected master baseline at design start: dd9a9a758795e2699e59182bb69fcfb2d761ec53
- Business PR #251 HEAD: 3ad29f4a5a6f941d2e49b634f54d65cbbcd4a2e4 (NOT MERGED)
- Prior reviewer substitute Run 44443633541; master CI 44444847637 SUCCESS
- QA-only Supabase project: xulmpqaknlwqqculbsek; direct database host db.xulmpqaknlwqqculbsek.supabase.co
- QA Edge: wos-mvp-verify-image-candidate v1 SHA-256 940c9c6551500e7a23158e3e56b08c0dddac57393af3903714af3ea325456956, verify_jwt=true
- QA Vercel project: prj_MhozO5QPUuUl8muAAKtkj5napeSp; team team_OZQkJ9a5x0fAirpMzt3vn3Xp
- QA Preview: dpl_53tMyB4UvQ47CwxcZfiZeZQZYz2e; target null = Preview, READY, commit equals #251 HEAD; exact hostname hongda-wos-p00202-qa-preview-o22fvh0ib-lens-projects-3fc386bd.vercel.app
- Existing Production Vercel project: prj_y1JAqsnwxlIAJANknRQ0JHWsn8tG; never modify
- QA baseline: P1/P2 gates OFF; 84 WOS orders; 83 CPC NULL; 83 private Storage objects; zero candidate proofs, bindings and receipts.

All values must be independently revalidated immediately before future Owner-authorized changes. Static constants do not substitute for live Vercel and Supabase identity evidence.

## 1. Why a restricted aggregate is necessary

QA WOS orders and Storage use organizational RLS policies, while P1/P2 Gate tables have no user SELECT policies. Ordinary NO-BYPASSRLS credentials cannot obtain all 84/83/83 counts. Do NOT disable RLS or grant SELECT on raw orders or Storage to make the test pass.

Proposed minimal exception: ONE no-argument SECURITY DEFINER aggregate owned by postgres, in private non-exposed wos_p1_preflight_private schema. The function checks session_user and transaction_read_only, fixes search_path and every table identifier, uses no dynamic SQL, and returns only Gate booleans, counts, project reference, proof version and timestamp. Only wos_qa_readonly_preflight can use the private schema and call this one function. PUBLIC EXECUTE is revoked in the same installation transaction. An intentional and narrowly scoped RLS bypass is inherent in the function owner: this requires independent SQL audit and explicit Owner approval.

The reviewed INSTALL_NOT_AUTHORIZED.sql was **already executed exactly once** on the QA project (role NOLOGIN / no password and private aggregate proof installed), and the installed objects were read-only verified with unchanged Gate OFF and 84/83/83 baseline. The same SQL must NOT be executed again; its idempotency guard rejects reinstallation. ROLLBACK_NOT_AUTHORIZED.sql is retained as a separately authorized RESTRICT rollback only. No temporary LOGIN, password, Vercel Trusted Source or protected workflow dispatch has been configured.

Before future installation:
1. Validate the actual Supabase project REF through the authenticated management API. Database name postgres by itself is not proof of project identity.
2. Bind exact reviewed SQL Blob, independent audit SUCCESS, unchanged function/schema ACL, Gate OFF and 84/83/83 baseline.
3. Verify PostgreSQL 17 DDL syntax and all negative tests using an isolated disposable database, never the user QA or Production project as a syntax sandbox.
4. Obtain one new Owner authorization before installation. Installation leaves role NOLOGIN, with no password.
5. Only after a separate credential grant may the Owner provision temporary LOGIN and a strong, revocable direct Postgres credential. Store DSN exclusively as protected GitHub Environment secret WOS_QA_READONLY_DSN. Never print or commit.
6. A legitimate DSN must select role wos_qa_readonly_preflight, database postgres, host db.xulmpqaknlwqqculbsek.supabase.co, port 5432 and sslmode=verify-full. Pooled, admin, non-TLS and Production DSNs are explicitly rejected.
7. After the single authorized run (PASS or FAIL), expire/disable the role, revoke the environment secret, verify sessions stopped and obtain separate approval for database rollback. NOLOGIN alone does not terminate sessions.

## 2. GitHub OIDC -> Vercel Trusted Sources

Official Vercel guide: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources

Vercel supports GitHub Actions as an External Service: it validates short-lived GitHub JWT signature, configured claims, and the target environment. The workflow sends the OIDC token only via x-vercel-trusted-oidc-idp-token in a POST to one fixed QA Preview hostname; it does not use Vercel API Token, CLI, automation bypass or public share links. Protected Preview authentication stays ON.

PROPOSED ONLY for QA project prj_MhozO5QPUuUl8muAAKtkj5napeSp:
- Issuer: https://token.actions.githubusercontent.com
- Audience: https://github.com/lenchenalc-hongda
- repository: lenchenalc-hongda/hongda-new-media-platform
- repository_id: 1286793274
- repository_owner_id: 297604134
- ref: refs/heads/master
- workflow_ref: lenchenalc-hongda/hongda-new-media-platform/.github/workflows/wos-p00202-p1-protected-readonly-preflight.yml@refs/heads/master
- environment: wos-p1-qa-preflight
- event_name: workflow_dispatch
- runner_environment: github-hosted
- sub: repo:lenchenalc-hongda/hongda-new-media-platform:environment:wos-p1-qa-preflight
- Allowed destination: preview ONLY (to.slugs preview).
- ALL identity claims must be within ONE Vercel Trusted Sources rule. No wildcards, Production or other projects.
- Read the existing project trustedSources config first. Vercel Update Project API replaces projects and oidcProviders maps; keep every existing approved rule unchanged when updating.

LIMITATION: OIDC Trusted Sources grant is scoped to the target Vercel PROJECT/ENVIRONMENT, not a specific Deployment ID. Workload code pins one immutable hostname; Owner must independently verify Deployment ID, SHA, project and READY target via authenticated Vercel management immediately before dispatch. Do not claim that the OIDC signature proves a Deployment ID.

GitHub token job permissions must include id-token: write and contents: read, scoped to the protected-preview-http job only. A 302/401/403 login response is NOT an application 503.

## 3. GitHub environment: isolated, screenshot-verified, no human reviewer

The owner created a **new** GitHub Environment `wos-p1-qa-preflight` on 2026-11-19. Owner-provided screenshots show:
- Required reviewers: OFF — deliberate, because the owner has no second independent GitHub identity.
- Wait timer: OFF.
- Allow administrators to bypass protection rules: unchecked.
- Deployment branches: **Selected branches and tags** with only `master`, 0 tags.
- Environment secrets: EMPTY; environment variables: EMPTY at creation.

These are UI **screenshots**, not a successful authenticated GitHub Environment API read. The active GitHub connection cannot verify persisted environment settings; a fresh page reload/admin proof must re-confirm them before any new credential provisioning or dispatch. Do not mark a GitHub human Approved Review based on AI technical audit.

**Crucial limitation:** with Required reviewers OFF there is no GitHub-native human approval gate. A user with sufficient repository permissions could dispatch a reviewed workflow on `master` without a separate GitHub approver. Therefore a fresh, explicit Owner authorization, a completed immutable-head GitHub-hosted independent technical audit, protected master CI, the exact restricted QA Preview identity, the minimal-privilege PostgreSQL role and a single QA-only execution are hard prerequisites. The isolation does NOT authorize new writes, bypass signed Owner CAS or permit automatic dispatch.

Keep the existing `hongda-review-dev` Environment, including its unrelated `REVIEW_DEV_*` secrets and reviewers, completely unchanged. None of those secrets or login identities may be copied into `wos-p1-qa-preflight`.

The Vercel Trusted Source must include the new `environment=wos-p1-qa-preflight` and matching `sub` claim; the previous `hongda-review-dev` binding is not authorized. For Vercel Trusted Sources creation, revalidate the existing rules before any modification and use only Preview target.

Prior technical audit Run 44447026099 and PR #254 CI Run 44446563483 belong to the **previous** HEAD and previous environment. They must not be reused as approvals of this revised HEAD.

## 4. Workflow and immutable evidence

The proposed workflow has three jobs:
1. fixed-source: confirm exact business PR #251 HEAD, edge source blobs and prior audited GitHub runs.
2. protected-preview-http: after protected environment approval request short-lived GitHub OIDC; reject mismatched repo/IDs/issuer/audience/branch/workflow/environment/expiry/attempt. POST empty JSON to four fixed QA candidate routes and require exact HTTP 503 + application DISABLED code. No credential logging, artifact or share link.
3. qa-readonly-database: protected environment secret WOS_QA_READONLY_DSN only after separate Owner approval; strict QA direct DSN + verify-full TLS, enforced read-only transaction; verify role has no table permissions or other reachable SECURITY DEFINER EXECUTE. Call only private no-input readonly_snapshot() and assert all three Gates OFF, 84/83/83, zero proofs/bindings/receipts, and fresh timestamp. Hash safe aggregate result to GitHub Step Summary, no raw customer rows or credentials.

All three must be SUCCESS on one newly created protected master Run. Independently capture GitHub Run ID, attempt, master SHA, Preview ID/URL/SHA, Edge v1/SHA-256, status codes, aggregate digest and audit evidence. Preflight SUCCESS is NOT P1 write authorization.

## 5. Independent zero-secret negative audit required

- JWT: wrong repository or ID, ref, workflow, environment, issuer, audience, expired token, wrong run attempt, missing OIDC token -> DENY.
- Vercel: wrong domain or project binding, login redirect/401/403, HTTP 200, wrong 503 code, non-JSON or wrong payload -> DENY.
- DB: Production host, pooler, non-TLS, wrong role, secret missing, direct table privileges, unsafe SECURITY DEFINER execute -> DENY.
- Proof: open P1/P2, history drift, public bucket, nonzero candidate receipts, expired proof -> DENY.
- Synthetic fixtures only, no real auth tokens, project writes or databases in the independent audit.

## 6. Failure and rollback

On any mismatch stop, leave P1/P2 OFF, Edge candidate disabled, Preview flags false, and retain history. If separately provisioned: revoke the QA external OIDC trust, disable and expire temporary DB login, revoke GitHub Environment secret, verify no live role sessions, then only with additional Owner approval run the reviewed QA-only ROLLBACK_NOT_AUTHORIZED.sql. Never touch Production, business PR #251 or V3.

NEXT OWNER GATES: a separate exact-Blob QA aggregate install approval, separately reviewed QA Trusted Sources project rule, protected GitHub Environment proof, temporary QA role credential approval, protected one-workflow integration approval, and one zero-write dispatch approval. Only after new protected Run SUCCESS may a max-15-minute QA synthetic P1 CAS grant be requested.
