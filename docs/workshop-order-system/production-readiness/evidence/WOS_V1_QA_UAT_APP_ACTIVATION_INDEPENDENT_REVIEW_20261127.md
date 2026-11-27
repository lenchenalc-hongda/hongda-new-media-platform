# WOS V1 QA UAT Application Activation Independent Review

Status: `NO_FINDINGS`

## Scope

The review covered the QA-only application RPC activation and deactivation
package used by `WOS-V1-PRODUCTION-M2-QA-UAT-004`:

- `WOS_V1_QA_UAT_APP_ACTIVATE_NOT_AUTHORIZED.sql`
- `WOS_V1_QA_UAT_APP_DEACTIVATE_NOT_AUTHORIZED.sql`
- the corresponding DB closer runner commands and Recovery path
- the PG17 activation, drift, closure and data-retention assertions

## Findings Resolved

1. Recovery now attempts application-RPC deactivation even if the close call
   reports a deadline or Cron cleanup failure, then continues the retaining
   rollback before rethrowing the first failure.
2. The activation runner is pinned to execution
   `812aebd9-75d5-427a-9047-5c84a5d6fe42`; the alternative execution ID is
   available only under an owned `_ci` Docker test scope.
3. Activation requires the exact UAT-004 authorization, the fixed QA project,
   fresh DB and Edge heartbeats, and a write deadline at least four minutes
   ahead.
4. Activation removes stale `PUBLIC` and `anon` EXECUTE grants, broad order
   table DML, and any authenticated access to office revisions before granting
   only the eight intended business RPCs.
5. Activate and deactivate postchecks verify all eight business RPCs. PG17
   injects `anon`, order-table DML, and office-revision ACL drift and proves it
   is removed before business activation and remains removed after Recovery.

## Verification

The final read-only re-review returned `NO_FINDINGS`.

Local verification:

```ini
PG17_CLEAN_CONTAINER_FULL_SUITE=PASS
QA_APP_ACTIVATION=PASS
QA_APP_DEACTIVATION=PASS
ANON_EXECUTE_DRIFT_REMOVED=PASS
ORDER_TABLE_DML_DRIFT_REMOVED=PASS
OFFICE_REVISIONS_DRIFT_REMOVED=PASS
INDEPENDENT_CLOSERS=PASS
DATA_RETAINING_RECOVERY=PASS
TYPECHECK=PASS
WOS_FULL_SUITE=PASS
BUILD=PASS
```

This evidence does not authorize a remote SQL install, a business Gate, an
order, a Production change, or a PR merge.
