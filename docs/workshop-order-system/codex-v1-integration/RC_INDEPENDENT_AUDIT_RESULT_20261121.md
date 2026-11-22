# One-time Independent Audit Result

HISTORICAL_ARCHIVE: YES
PR269_STATUS: CLOSED_UNMERGED
NOT_CURRENT_INSTALL_AUTHORITY: See `RC_QA_INSTALL_PLAN.md` and PR #270.

AUDIT_TARGET_PR: #269
AUDIT_TARGET_HEAD: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
ATTEMPTED_RUN: #44753662457 / attempt 2
RESULT: FAIL
FINAL_REVIEW_STATE: BLOCKED

## Executed Identity Evidence

The existing private OIDC attestation workflow was dispatched at protected
`main`:

- OIDC proof Run: #44843697242
- Workflow SHA: `48672e5e6ff728be1cde15b8c2b63f137ec82984`
- Conclusion: SUCCESS
- Issuer repository ID: `1464840651`
- Target business repository ID: `1286793274`
- OIDC token fingerprint SHA-256:
  `7ef19fa31d20e1f73751008a12e2cd32f10794191ad05576dda5adfddd5b5003`
- Logged reviewer state: `INDEPENDENT_REVIEWER=NOT_YET_VERIFIED`
- CAS Gate: CLOSED

This authenticates the GitHub-hosted execution identity. It does not itself
prove an independent human security review.

## New Security Audit Execution

The existing exact-source PR #7 audit workflow was rerun:

- Run: #44753662457 / attempt 2
- Attestation head: `94d6cd6b0250162ebbdf521d12a5bf08b32f7c27`
- Business source checkout: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
- Overall conclusion: FAILURE

Passing jobs:

- `verify-only`: SUCCESS
- `wos-p2-public-snapshot-ci`: SUCCESS

The exact-source job verified:

- Exact business SHA checkout.
- Isolated PostgreSQL 17 install and transaction E2E.
- Concurrent CAS one-winner behavior.
- TypeScript, full WOS suite, build and bundle secret audit.

Failed job:

- `oidc-pr-diagnostic`
- Failure marker:
  `PR_OIDC_DIAGNOSTIC_DENIED_RUNTIME_GITHUB_RUN_ATTEMPT`

The existing workflow intentionally accepts only a new run attempt 1 for signed
diagnostic evidence. Re-running the historical Run creates attempt 2, which the
signature chain rejects. The overall audit is therefore not PASS.

## Independence Finding

The private attestation repository has only one collaborator:
`lenchenalc-hongda`, the same GitHub account as the business PR author.

The GitHub Actions OIDC identity is cryptographically verifiable and distinct as
an execution identity, but the owner-controlled account/repository does not
supply human organizational independence by itself. The workflow also explicitly
reports `INDEPENDENT_REVIEWER=NOT_YET_VERIFIED`.

## Decision

```text
OWNER_SIGNED_AUDIT_APPROVAL = PRESENT
AUDIT_EXECUTION_AUTHORIZED = YES
GITHUB_HOSTED_OIDC_IDENTITY = VERIFIED
EXACT_SOURCE_SECURITY_JOB = PASS
OVERALL_SIGNED_AUDIT = FAIL
HUMAN_INDEPENDENCE = NOT_VERIFIED
PR_269_REVIEW_SUBSTITUTE = NOT_ACCEPTED
PR_269_FINAL_REVIEW_STATE = WAITING_REVIEW
ISSUE_104_MACHINE_STATE_CHANGED = NO
```

No retry was made because the authorization was for one new non-production
audit and the result did not meet the required signed-audit gate.

## Required Next Decision

Owner must choose one:

1. Appoint a genuinely distinct human Reviewer; or
2. Approve a fresh attempt-1 audit execution in the existing attestation chain,
   with an independent review identity and no self-attestation.

Until then:

- No PR merge.
- No QA SQL install.
- No QA write or Gate activation.
- No deployment.
