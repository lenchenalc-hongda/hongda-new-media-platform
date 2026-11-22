# WOS V1 RC Independent Review Index

RC_CODE_SHA: `b6b9b098ac818d79f182e43507edf1370b92fa34`
RC_DELIVERY_BASELINE_COMMIT: `840b1c78f5c92bf58dc6445a1cb15f26daf442d9`
FINAL_DELIVERY_COMMIT: use the bundle HEAD and the SHA reported at handoff.
BASE_SHA: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`

## Review Order

1. `RC_MANIFEST.md`
2. `RC_SECURITY_AUDIT.md`
3. `RC_TEST_EVIDENCE.md`
4. `RC_QA_SCHEMA_COMPATIBILITY_FINAL.md`
5. `RC_QA_INSTALL_PLAN.md`
6. `RC_QA_E2E_PLAN.md`
7. `RC_GITHUB_HANDOFF_FINAL.md`
8. `RC_RELEASE_BLOCKERS.md`
9. `RC_OWNER_WRITER_CONTRACT_EXCEPTION.md`
10. `RC_INDEPENDENT_AUDIT_SUBSTITUTE_REQUEST.md`
11. `RC_INDEPENDENT_AUDIT_RESULT_20261121.md`
12. `RC_OWNER_APPROVAL_REQUEST.md`

Machine-readable files:

- `RC_FILE_DIFF.tsv`
- `RC_ALLOWED_PATHS.json`
- `rc-evidence/qa-metadata/*.json`

## Bundle Verification

The local artifact directory contains:

- `wos-v1-rc-840b1c7.bundle`
- `wos-v1-rc-evidence-840b1c7.tar.gz`
- four numbered Git patches
- `SHA256SUMS.txt`

The bundle requires base `5ac678a50af6391efbdfb0258f037cbdeb2e18d6` and contains:

```text
7cb3256
806b2c2
b6b9b09
840b1c7
```

Bundle fetch verified final SHA
`840b1c78f5c92bf58dc6445a1cb15f26daf442d9`.

Patch replay from base produced the same tree:

```text
6ecad0a13831a92fc377c360735ca772986f2200
```

## Independent Review Questions

The reviewer must explicitly answer:

- Are `SECURITY DEFINER`, `search_path`, ACL and Gate checks sound?
- Can a Storage object or proof be modified and restored to replay a signature?
- Can a superseding image race between Office and Workshop signatures?
- Does the final material transaction recheck the canonical proof set?
- Are Viewer and cross-organization paths denied in RLS and API code?
- Are order-version CAS and idempotency complete?
- Are both M2 Gates default OFF and fail-closed on expiry?
- Can any UI path falsely report success or start production?

## Handoff Boundary

The archive does not include passwords, JWTs, cookies, service-role keys or real
customer data. It contains synthetic local IDs and schema metadata only.

No remote push, PR creation, QA SQL installation or Production change was
performed while preparing this index.
