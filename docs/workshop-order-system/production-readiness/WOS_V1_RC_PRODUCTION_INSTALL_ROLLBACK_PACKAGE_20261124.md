# WOS V1 Production Install / Activation / Rollback Package

Status: `NOT_AUTHORIZED / GO_NO_GO=NO_GO`

This package is a revision of the existing production migration runbook. It
does not authorize any Production write.

## Production Read-Only Audit

Observed 2026-11-24:

```ini
PRODUCTION_PROJECT=amqpvxrurenevniilhtl
POSTGRES_VERSION=17.6
PUBLIC_TABLES=67
PUBLIC_FUNCTIONS=100
APPLICATION_SIGNATURE_ROWS=383
APPLICATION_SIGNATURE_AGGREGATE=745e7556931fd99abae835d7ab21a9e899eb8b624380ef1a95fb4f1773ae4f5b
SIGNATURE_MATCH=PASS
WOS_TABLES=0
WOS_FUNCTIONS=0
WOS_PRIVATE_BUCKET=ABSENT
WOS_STORAGE_OBJECTS=0
AUTH_USERS=10
PROFILES=10
ORGANIZATIONS=1
RLS_TABLES=67
TABLES_WITHOUT_RLS=0
AUTHENTICATED_GRANT_OPTIONS=0
```

Seventeen public tables intentionally have RLS enabled without any policy and
therefore deny browser access. They must not be "repaired" as part of WOS.

The latest successful GitHub-linked Production deployment visible through the
GitHub Deployments API is commit
`4dac501cf61a1469f76c643b71ceaab91fc4d39f` from 2026-11-11. A later Production
deployment attempt for `5d794a5f5be0821c37df0bbf99005137a1f8197e` was canceled.
The current master `8694aa513b749a29042af34bbabb9a1b83643476` is not evidenced
as the active Production deployment.

## Release Surfaces

All application and database write surfaces start OFF:

```ini
WOS_V1_APP_ENABLED=false
WOS_V1_APP_WRITES_ENABLED=false
WOS_V1_QA_APP_ENABLED=false
WOS_V1_QA_APP_WRITES_ENABLED=false
WOS_V1_EDGE_WRITES_ENABLED=false
WOS_V1_EDGE_READONLY_VERIFY_ENABLED=false
```

The V1 QA route remains source-hard-disabled for writes. No QA `wos_qa_*`
function, QA Gate, Fixture Writer or read-only verifier may be selected by the
Production business path.

## Installation Order

1. Capture a fresh read-only 383-row Production signature and require an exact
   match to the bound manifest.
2. Verify PITR/backup recovery point, write-freeze start, named operator,
   independent observer and rollback decision owner.
3. Install the WOS Foundation migration together with its containment SQL in
   one transaction.
4. Install the reviewed production-compatible P7 private Storage/proof schema.
5. Install the production runtime forward with exactly eight business RPCs
   still revoked.
6. Install the service-only proof renewal helper and project-neutral proof
   service.
7. Verify all WOS RPCs remain deactivated, internal helpers are not executable
   by browser roles, and Storage write authorization is closed.
8. Deploy application code with feature flags OFF.
9. Activate named-staff RPCs and the application write flag only in a separate
   exact-SHA activation gate after Hosted QA business E2E passes.
10. Keep `CAN_START=false`; no material/visual signoff may start production
    automatically.

## Required Pre-Window Evidence

- Exact PR head and independent security review.
- Exact SHA-256 for every SQL file and Edge source.
- Fresh 383-row application signature.
- PITR timestamp and restore rehearsal evidence.
- Production Auth/Profile/Organization grant list for named staff.
- Storage bucket inventory and expected empty `wos-private` state.
- Confirmed all five WOS flags OFF.
- Confirmed no concurrent migration or QA writer.

## Rollback

Preferred order:

1. Set application and Edge write flags OFF.
2. Revoke all eight business RPCs.
3. Stop proof-service invocation.
4. Roll back proof renewal and the V1 runtime using the reviewed inverse files.
5. Roll back P7/Foundation only if no business history must be retained.
6. Remove an empty private bucket only through Storage API after proving no
   object references remain.
7. Re-capture the 383-row signature and compare with the pre-window baseline.

If any WOS order, receipt, Proof or history row exists, destructive schema
rollback is forbidden. Use RPC deactivation, feature flags OFF, and a
forward-fix plan under a data-retention decision.

## Go/No-Go

```ini
PRODUCTION_SCHEMA_COMPATIBILITY=PASS
BACKUP_AND_PITR_EVIDENCE=NOT_CAPTURED
REMOTE_FEATURE_FLAG_AUDIT=NOT_TESTED
HOSTED_QA_INTEGRATED_E2E=NOT_TESTED
CURRENT_MATERIAL_BASELINE_SIGNOFF=BLOCKED
CORRECTION_IMAGE_VERSION_CONTRACT=BLOCKED
PRODUCTION_INSTALL_AUTHORIZED=NO
PRODUCTION_DEPLOYED=NO
GO_NO_GO=NO_GO
```
