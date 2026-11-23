# WOS V1 Production Migration Runbook

Status: **INSTALL_NOT_AUTHORIZED**

This runbook prepares a future, separately approved Production migration. It
does not authorize a connection that writes Production, a release, a feature
flag, a deploy or a merge.

## 1. Required release inputs

- Exact source manifest and hashes approved by Owner
- Exact target project: `amqpvxrurenevniilhtl`
- Production read-only schema signature captured immediately before the window
- Confirmed current master and exact application release SHA
- Confirmed database backup/PITR recovery point
- Named migration operator and independent observer
- Approved maintenance window and application write freeze
- Reviewed rollback SQL and rollback decision authority
- No concurrent migrations or WOS QA writer
- All WOS feature/write flags OFF at the start

## 2. Ordered SQL sequence

The following are drafts until every hash is bound in a separate Owner
authorization:

1. `supabase/production-bootstrap/20261123_app_schema.sql`
   - Used only to prove a clean schema baseline or recover a new disposable
     environment. It must not be replayed over the existing populated
     Production database.
2. `supabase/migrations/20261014102000_workshop_order_system_foundation.sql`
   together with
   `WOS_V1_PRODUCTION_FOUNDATION_CONTAINMENT_NOT_AUTHORIZED.sql`
   - Must run in one `psql --single-transaction` invocation. The containment
     file removes the Foundation draft's direct browser table grants and insert
     policies before the transaction can commit.
3. Reviewed production-compatible P7 schema/function candidate
   - Current candidate:
     `tests/sql/wos_p8_p7_production_compatible_candidate.sql`
   - It remains under test documentation until promoted to a production
     migration artifact with its own authorization.
   - It creates the private `wos-private` PNG bucket, grants only the reviewed
     read surfaces, installs four-category Storage RLS, and leaves browser write
     RPCs revoked.
4. `docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql`
   - Adds production-neutral order lifecycle receipts and RPCs with browser
     EXECUTE still revoked.
5. Deploy project-neutral image proof service with its own exact release gate.
6. Apply
   `WOS_V1_PRODUCTION_RPC_ACTIVATION_TEMPLATE_NOT_AUTHORIZED.sql`
   - Only after migration and service verification; this exposes eight
     business RPCs to `authenticated`.
7. Enable the application feature flag separately.

Do not combine SQL installation, browser release and Production traffic in one
unreviewed step.

## 3. Installation transaction rules

- Run each reviewed SQL file in one transaction with `ON_ERROR_STOP`.
- Set the file-specific authorization GUC only inside the authorized migration
  session.
- Stop on any SQLSTATE mismatch.
- Never use administrator bypass to continue a partly failed migration.
- Never edit `supabase_migrations.schema_migrations` to manufacture historical
  parity.
- Preserve original P1 submission receipts and all status history.
- Keep all RPC EXECUTE grants revoked until activation approval.
- Do not grant broad table SELECT/INSERT/UPDATE/DELETE to browser roles.

## 4. Pre-install read-only checks

Record:

- current `master` SHA and application deployment SHA
- `public` table/function/trigger/policy counts
- 29 Production migration versions
- exact 383-row application signature
- expanded table/function ACLs, including direct `PUBLIC` entries
- WOS object count, expected zero
- `wos-private` bucket state, expected absent before P7
- Storage object count and bucket inventory
- WOS/QOS feature flags in Vercel, all OFF
- all relevant database Gates absent/off

Abort if any signature differs from the approved manifest without a reviewed
delta report.

## 5. Post-install verification

### Schema

- Foundation tables, constraints, policies and triggers match the approved
  manifest.
- V1 runtime adds exactly four receipt/revision tables.
- No QA-only Gate table or `wos_qa_*` object exists in Production.
- Internal helper RPC is executable by no application role.
- Service proof RPC is executable only by `service_role`.
- Business RPCs remain revoked before activation.
- Direct authenticated DML on WOS tables remains denied.

### Transaction semantics

- same request ID and same payload returns `REPLAYED`
- same request ID and different payload is rejected
- stale expected version returns `VERSION_CONFLICT`
- two concurrent transitions produce one success and one conflict
- forged cross-organization order ID is not found/authorized
- old expected version and old version-label evidence cannot resolve a new
  correction
- successful review ends at `WAITING_MATERIAL`
- every response and database row keeps `canStart=false`

### Regression

- exact Production schema signature is restored after a disposable full
  rollback
- no row-count or signature drift in CPC, GLH or commercial schemas
- existing Production customer and commercial records are not exported to logs

## 6. Activation

The activation template is a separate privileged decision:

- no `anon` or `PUBLIC` EXECUTE
- exactly eight reviewed business RPCs receive `authenticated` EXECUTE
- no direct WOS table DML
- no internal helper or service proof RPC exposed to browser roles
- deactivation SQL is tested before activation is approved

Deploying application code with the feature flag OFF is not the same as
opening the database write surface.

## 7. Rollback

Preferred order:

1. Disable Production application feature/write flags.
2. Apply RPC deactivation template.
3. Stop any project-neutral proof service invocation.
4. Apply V1 runtime rollback.
5. Apply the reviewed P7 rollback.
6. Apply the WOS Foundation rollback only when preserving no WOS Production
   data is explicitly approved.
7. Remove the empty `wos-private` bucket only through an approved Storage API
   step after independently proving that no object references remain. The
   PostgreSQL disposable rollback intentionally does not model a production
   Storage bucket deletion.
8. Re-run the 383-row application signature and compare with the pre-window
   manifest.

Do not drop WOS business history, Proof or receipts as a generic rollback step
without a data-retention decision. If data was written and must be retained,
rollback means fail-closed code/RPC deactivation plus a forward-fix plan, not
blind table deletion.

## 8. Current gate

`SQL_INSTALLED=NO`
`PRODUCTION_CHANGED=NO`
`RPC_ACTIVATED=NO`
`RELEASE_AUTHORIZED=NO`

Next required action:
`OWNER_EXACT_SQL_PRODUCTION_MIGRATION_AUTHORIZATION`
