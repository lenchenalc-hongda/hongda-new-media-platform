# Independent Signed Technical Audit Substitute Request

HISTORICAL_ARCHIVE: YES
PR269_STATUS: CLOSED_UNMERGED
NOT_CURRENT_INSTALL_AUTHORITY: See `RC_QA_INSTALL_PLAN.md` and PR #270.

REQUEST_STATUS: OWNER_APPROVED_ATTEMPTED_AND_FAILED
TARGET_PR: #269
TARGET_EXACT_HEAD: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
RC_CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
RC_DELIVERY_COMMIT: `087eb71404f8d225674b1ca7cd937c2bbdba723e`

## Why This Request Exists

PR #269 has no distinct human reviewer. Its two reviews were submitted by the
same GitHub account as the PR author and are `COMMENTED`, not independent
`APPROVED` reviews. No reviewer or CODEOWNER is currently requested.

The exact-head CI/PostgreSQL evidence and the Owner Writer Contract exception
are source execution evidence. They are not independent security approval.

## Requested One-Time Substitute

Owner may authorize one distinct, externally signed technical audit for the
single exact PR head above.

The auditor must be technically and organizationally independent of the code
author and must sign an attestation covering:

- Exact head and both RC SHAs.
- M2 SQL Git blob and SHA-256.
- `SECURITY DEFINER`/`INVOKER` and `search_path`.
- Function/table/storage ACLs and RLS.
- Viewer and cross-organization denial.
- Storage object identity/version/SHA/expiry proof.
- Mutate-and-restore or replay threat analysis.
- Supersession race analysis.
- Numeric CAS, idempotency and rollback.
- Gate default OFF, expiry and fail-close.
- No automatic production start.
- No browser service-role secret or fake-success path.

## Signature Requirements

The signed attestation must bind at minimum:

```text
repository=lenchenalc-hongda/hongda-new-media-platform
pr=269
head=cb46d2380062a2d286fb2d0e56a0a2a51debdcce
rc_code_sha=b6b9b098ac818d79f182e43507edf1370b92fa34
rc_delivery_sha=087eb71404f8d225674b1ca7cd937c2bbdba723e
m2_sql_sha256=3f356f7b12d385b1fff370cad7f064649eb4e90ddb193c79d13fa0f35524e298
evidence_bundle_sha256=<read from final output/wos-v1-rc/SHA256SUMS.txt>
evidence_archive_sha256=<read from final output/wos-v1-rc/SHA256SUMS.txt>
decision=APPROVED_FOR_QA_INSTALLATION_REVIEW_ONLY
merge_authorized=false
production_authorized=false
```

The signature mechanism must be independently verifiable and disclosed in the
approval. A plain unsigned chat statement or self-authored PR comment is not
sufficient.

## Suggested Allowed Auditor

- A distinct authorized human security reviewer, preferred; or
- A distinct external audit identity using an approved signing key and isolated
  review environment, explicitly appointed by Owner for this one SHA.

Codex may prepare the package but may not act as the independent auditor or
approve its own work.

The one authorized attempt is recorded in
`RC_INDEPENDENT_AUDIT_RESULT_20261121.md`. It failed the signed diagnostic gate
and does not satisfy this requirement.

## If Approved

1. Publish this exact unsigned request and evidence digests to the chosen
   private channel.
2. Auditor verifies the Git bundle, evidence archive and SQL digest.
3. Auditor performs the security checklist independently.
4. Auditor returns a signed attestation bound to the listed values.
5. Owner records acceptance of the signed attestation.
6. Only then may PR #269 proceed to its governance decision.

## If Not Approved

The standard distinct human Reviewer requirement remains in force and all QA
installation, real QA write, Gate activation, merge and deployment remain
blocked.
