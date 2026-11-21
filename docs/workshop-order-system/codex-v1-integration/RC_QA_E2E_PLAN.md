# WOS V1 QA / Vercel Preview E2E Plan

QA_PROJECT: `xulmpqaknlwqqculbsek`
PREVIEW_DEPLOYMENT_AUTHORIZED: NO
REAL_QA_E2E: NOT_RUN

Executable script:

```text
tests/e2e/wos-v1-rc-preview.cjs
```

The script is guarded by multiple exact Preview, QA project and runtime flags.
It never logs passwords, JWTs or cookies.

## Required Environment Variable Names

Values must be supplied only through the approved protected environment:

- `VERCEL_ENV`
- `AUTH_MODE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `WOS_P5C_NONPROD_API_ENABLED`
- `WOS_P7_NONPROD_SUBMIT_ENABLED`
- `WOS_P2_QA_MUTATIONS_ENABLED`
- `NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED`
- `WOS_P2_QA_OFFICE_REVISION_ENABLED`
- `NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED`
- `WOS_P2_QA_M2_ENABLED`
- `NEXT_PUBLIC_WOS_P2_QA_M2_ENABLED`
- `WOS_RC_PREVIEW_E2E_ENABLED`
- `WOS_RC_PREVIEW_ORIGIN`
- `WOS_RC_OFFICE_EMAIL`
- `WOS_RC_OFFICE_PASSWORD`
- `WOS_RC_OPERATOR_EMAIL`
- `WOS_RC_OPERATOR_PASSWORD`
- `WOS_RC_VIEWER_EMAIL`
- `WOS_RC_VIEWER_PASSWORD`
- `WOS_RC_FOREIGN_EMAIL`
- `WOS_RC_FOREIGN_PASSWORD`

Do not place secret values in documentation, logs, PR comments or build-time
shared configuration.

## Preview Preconditions

1. Deployment belongs to the intended Vercel project.
2. Deployment SHA equals the separately approved RC or integration SHA.
3. Deployment is a Preview, not Production.
4. `NEXT_PUBLIC_SUPABASE_URL` is the exact QA host.
5. Preview remains SSO/protected as required.
6. M2 install postcheck has passed.
7. Authenticated EXECUTE grant has been separately approved.
8. A new synthetic order ID and QA Gate window exist.
9. Legacy Office/Operator Gates remain OFF.

## Browser Flow

### Office

- Log in through real Supabase Auth.
- Confirm session/cookie recovery.
- Fill the QA production form.
- Upload four PNG categories.
- Submit through the same-origin API.
- Require `productionStarted=false`.

### Operator

- Log in with a different Auth user.
- Read the submitted order through the RLS-backed Inbox.
- Accept it.
- Return it with a durable reason.
- After Office correction, review the exact latest revision.

### Office Proof-Set

- Select the four current images.
- Lock a DRAFT baseline.
- Sign the server-generated proof-set digest.

### Workshop

- Sign the same proof-set as a different profile.
- Record FILM, FIXTURE, INCOMING_MATERIAL and SIGNED_SAMPLE.
- Require `READINESS_CHECK`.
- Require four verified materials and zero unresolved blockers.
- Require no start button and `canStart=false`.

### Security Denials

- Viewer Inbox API: JSON error/403 and no production data.
- Viewer Office submit control: absent.
- Cross-organization Sales Inbox: 200/OK with zero rows from the target org.
- Direct unauthorized mutation remains denied.

## Failure Handling

Record:

- Exact failed step.
- Browser URL path, without query secrets.
- HTTP status and allowlisted response code only.
- Request ID.
- Database order/version/status.
- Relevant console error type, not raw values.

Then:

1. Run M2 fail-close SQL.
2. Verify both M2 Gate rows are OFF.
3. Leave immutable receipts and order history intact.
4. Stop the test.
5. Do not relax RLS, disable proof checks or delete negative tests.

## Rollback And Deactivation

If Preview code fails:

- Disable the Preview feature flags.
- Revoke authenticated M2 EXECUTE.
- Keep additive tables, columns and audit receipts.
- Delete or unpublish only the Preview deployment, not Production.
- Do not remove QA business rows.

If only E2E fails:

- Run fail-close.
- Preserve all evidence.
- Open a new bounded fix task rather than modifying PR #269 outside its
  allowlist.

## Execution Command

After all approvals and environment injection:

```bash
node tests/e2e/wos-v1-rc-preview.cjs
```

Expected terminal markers:

```text
WOS_RC_PREVIEW_FOUR_ACCOUNT_E2E=PASS
WOS_RC_PREVIEW_ORDER_STATUS=READINESS_CHECK
WOS_RC_PREVIEW_CAN_START=false
```

Syntax validation completed locally with `node --check`. It has not been run
against Vercel or real QA.
