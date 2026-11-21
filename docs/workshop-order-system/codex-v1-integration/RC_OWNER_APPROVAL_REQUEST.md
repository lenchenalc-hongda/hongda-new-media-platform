# WOS V1 RC Owner Approval Request

RC_CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
RC_DELIVERY_BASELINE_COMMIT: `840b1c78f5c92bf58dc6445a1cb15f26daf442d9`
FINAL_DELIVERY_COMMIT: use the attached bundle HEAD reported with the handoff.

Please decide only the following governance items:

## 1. Reviewer Delivery Channel

Approve which existing private channel may receive the sanitized RC bundle,
evidence archive and checksums for independent review. No public upload is
requested.

## 2. Independent Reviewer

Name a distinct authorized reviewer, or explicitly approve a governance-valid
substitute for a one-time review. The current PR #269 reviews are from the PR
author's account and do not satisfy independence.

The first authorized signed-audit attempt failed its OIDC diagnostic gate and
did not become valid substitute evidence. A fresh decision is required.

## 3. PR #269 Closure Path

The Owner has approved the one-time Writer Contract evidence substitute. The
remaining governance action is to authorize the normal trusted control path
needed to:

- record the independent review;
- transition or close the existing task under Issue #104.

This request does not authorize merge.

## 4. WOS V1 Integration Task

After PR #269 is legally closed, authorize registration of one new bounded WOS
V1 RC integration task using the reviewed path allowlist and shared-path
handling in `RC_GITHUB_HANDOFF_FINAL.md`.

This request does not authorize creating a concurrent second active PR.

## 5. Future QA Installation Window

If the reviewer and PM approve the source and SQL, pre-authorize the later
separate scope decision for:

- exact M2 SQL SHA-256;
- QA project `xulmpqaknlwqqculbsek`;
- one new synthetic order and organization;
- both M2 gates only, 15-minute maximum;
- immediate fail-close;
- real four-account QA browser E2E;
- protected Vercel Preview only.

No QA SQL or Gate is opened by this request. A separate final go/no-go after
review is still required.

## Explicitly Not Requested

- Production SQL, RLS, Storage, data or environment changes.
- Production deployment.
- Long-lived write access.
- Skipping the independent Reviewer.
- Merge, force-push or bypassing single-active-PR governance.
