# WOS V1 First-Release Blockers and Risks

This list measures production delivery readiness, not PR count.

## P0 release blockers

1. **Exact Production SQL authorization**
   - No Production migration, activation or deactivation may run until a
     separate Owner authorization binds the exact project, SQL hashes,
     operator, window and rollback files.
2. **Production schema drift baseline**
   - Capture a fresh read-only 212-row application signature immediately
     before the migration window and abort on unreviewed delta.
3. **Project-neutral private-image proof service**
   - Replace the QA URL/RPC Edge function with a reviewed Production service.
   - Prove real downloaded PNG bytes SHA-256, Storage object identity/version,
     expiry and double-snapshot stability.
4. **Production-neutral application routes**
   - Wire create/submit, Inbox, accept/return, Office correction/resubmit and
     Operator review to Production RPCs.
   - Keep all flags OFF until the release window.
5. **Production browser workflow acceptance**
   - Use real but synthetic Production test orders with Office, Operator,
     Viewer, cross-organization and anonymous identities.
   - Include idempotency, lost-response retry, stale version, concurrent
     conflict, old image rejection and rollback.
6. **Staff identity and role provisioning**
   - Assign active Production profiles and organization membership.
   - First release remains `admin/manager/sales/operator`; do not invent
     `workshop` or `technician` roles without a role migration.
7. **Backup, observation and rollback authority**
   - Confirm PITR/backup recovery point, named rollback owner, monitoring,
     alert thresholds and a maintenance/write-freeze window.

## P1 controls required before go-live

- Feature flag defaults OFF in Production and explicit release enablement.
- No QA `wos_qa_*` RPC or Gate used by Production routes.
- No direct authenticated table writes.
- No browser-visible private Storage paths or proof records.
- No service-role business caller; service credential limited to the dedicated
  proof writer.
- Rate/size/time limits for image verification and clear failure telemetry.
- Retention/cleanup procedure for orphaned or expired proof artifacts.
- Named owner for historical migration registry drift. Do not rewrite the 29
  existing records.

## Verification completed offline

- exact schema-only bootstrap
- 67/67 historical public-table replay
- 212/212 application signature parity
- WOS Foundation and production-neutral lifecycle
- idempotency replay
- actual two-session version CAS conflict
- Viewer and cross-organization read denial
- RPC ACL activation/deactivation
- internal helper hidden from application roles
- duplicate install rejection
- full rollback to Production signature
- no CPC/GLH/commercial drift
- TypeScript, WOS suite, Build and Secret Audit

## Not verified

- real Production database installation
- hosted Production API/RLS behavior
- real Production Storage object download and SHA-256
- Production Edge deployment and secret binding
- Production browser E2E
- Production feature flag/release activation
- Production rollback under live data

## Minimum path to actual Office/Workshop use

1. Approve and merge the reviewed readiness source through normal protected
   review.
2. Complete Production-neutral route wiring and project-neutral proof service.
3. Obtain one exact-SQL Production migration authorization.
4. Rehearse the exact release candidate against a disposable Production-like
   database and real Storage test bucket.
5. Install WOS with all RPCs deactivated.
6. Verify schema, ACL, Storage and zero-account access while closed.
7. Deploy application code with feature flag OFF.
8. Run closed-production browser, RLS and byte-integrity acceptance with
   synthetic orders.
9. Open the narrow first-release flag/RPC activation for named staff only.
10. Monitor first orders and retain a tested fail-closed rollback path.

`PRODUCTION_READY=NO`
`CAN_START_FALSE=YES`
`NEXT_OWNER_GATE=PRODUCTION_NEUTRAL_ROUTE_AND_EDGE_IMPLEMENTATION_APPROVAL`
