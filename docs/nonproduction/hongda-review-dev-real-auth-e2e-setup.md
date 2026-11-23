# Hongda isolated real Auth E2E — protected runner setup

**ONLY** for nonproduction Supabase `hongda-review-dev`, project ref `xulmpqaknlwqqculbsek`. Do not copy credentials from Production; do not paste passwords, tokens or keys into GitHub Issues, code, ChatGPT or workflow logs.

## Actual blocker found

GitHub Actions Run [#42384132738](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42384132738) launched and the fail-closed `protected-secret-preflight` job reported that all twelve required GitHub Environment secret **names** were unconfigured. The three downstream password/JWT jobs were skipped; **no real login, CSO concurrency or binary Storage acceptance can be claimed**.

Nonproduction database read-only aggregate verifies that the required active `admin`, `viewer`, `sales` and `operator` profiles link to real password-enabled and confirmed Supabase Auth users. This does not reveal or recover their passwords. Prefer accounts expressly created for QA rather than staff credentials.

## Secure setup (one time)

1. In GitHub repository `lenchenalc-hongda/hongda-new-media-platform`, open **Settings → Environments → hongda-review-dev**. Require reviewers and restrict deployment branches to `qa/real-auth-cso-glh-20261107` before adding secrets. Do not grant this environment to untrusted PRs.
2. Under **Environment secrets**, add the names below, using only real QA project credentials from `hongda-review-dev`; never use Production credentials or `service_role`/secret keys.
3. From the last failed run, use **Re-run all jobs** once the protected secrets and approval policy are configured, or trigger a new isolated branch push. Do not merge PR #214 for this purpose.
4. Treat only sanitized `LIVE_E2E: PASS`, `GLH_REAL_AUTH_E2E=PASS` and `WOS_REAL_AUTH_PRIVATE_STORAGE_E2E=PASS` plus verified rows and artifacts as actual acceptance. `NOT_VERIFIED` or `SAFE_DRY_RUN` are failures to prove the live contract.

### Protected GitHub Environment secret names

| Secret name | Purpose |
| --- | --- |
| `REVIEW_DEV_SUPABASE_ANON_KEY` | Publishable/anon API credential for **isolated QA** project, never service-role |
| `REVIEW_DEV_EXPECTED_ORG_ID` | UUID of the QA organization containing the admin and viewer profiles |
| `REVIEW_DEV_ADMIN_EMAIL`, `REVIEW_DEV_ADMIN_PASSWORD` | Existing disposable, confirmed admin Auth user |
| `REVIEW_DEV_VIEWER_EMAIL`, `REVIEW_DEV_VIEWER_PASSWORD` | Distinct same-org viewer Auth user |
| `REVIEW_DEV_SALES_EMAIL`, `REVIEW_DEV_SALES_PASSWORD` | Distinct same-org sales Auth user |
| `REVIEW_DEV_OPERATOR_EMAIL`, `REVIEW_DEV_OPERATOR_PASSWORD` | Distinct same-org operator (workshop) Auth user |
| `REVIEW_DEV_FOREIGN_EMAIL`, `REVIEW_DEV_FOREIGN_PASSWORD` | Distinct sales Auth user from a **different** QA organization |

If QA passwords are unavailable, reset them **only for the QA users** inside Supabase dashboard; do not try to read `auth.users.encrypted_password`, mint synthetic JWT claims or reuse staff Production logins.

## Scope and caveats

- **CSO**: two independent real owner sign-ins + viewer, concurrent version CAS, immutable archived V1/V2/V3 printable **model** snapshot parity. The workbench currently supports browser Print / Save as PDF, but explicitly says **original PDF binary archival is not yet implemented**; do not claim it.
- **GLH**: real three JWT sessions, manual lead + replay, same-org assignment, cross-org deny. Leaves one marked synthetic `.invalid` lead in isolated QA on success. No Meta/WhatsApp customer sends.
- **WOS**: real JWT admin/operator/foreign, a synthetic office order, a real 1×1 PNG Storage API upload, private workshop download, foreign deny, trusted readiness/atomic submit/Inbox; leaves synthetic QA order and private file in isolated project on success. The backend primitives are already installed **only** in QA, but Preview HTTP route code remains Draft PR #213; Production POST remains closed.
- Real Auth and nonproduction binary upload should run from a protected environment with approved identity bindings, never from a secret-less public Pull Request. Full browser UI acceptance comes after protected tests and separate QA Preview configuration.

This document does **not** authorize any production release, extra paid service, sharing of secrets, PR merge or opening V3 remote dispatch.
