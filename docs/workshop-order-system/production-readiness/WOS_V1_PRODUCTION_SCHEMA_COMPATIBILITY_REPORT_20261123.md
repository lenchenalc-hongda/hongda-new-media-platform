# WOS V1 Production Schema Compatibility Report

Date: 2026-11-23
Task scope: Issues #104, #223, #225
Decision: **OFFLINE MIGRATION FEASIBILITY PASS / PRODUCTION RELEASE BLOCKED**

## 1. Fixed inputs

- Repository: `lenchenalc-hongda/hongda-new-media-platform`
- Base master: `c3b63eaddafec8aaae8460b26e804cbb4bdd70ba`
- Production Supabase: `amqpvxrurenevniilhtl`
- Isolated QA Supabase: `xulmpqaknlwqqculbsek`
- Disposable engine: PostgreSQL 17 Alpine, container network disabled
- Production connection use: read-only metadata and schema inspection only

No Production SQL, RLS, Storage, Auth, Secrets, data, Gate or deployment was changed.

## 2. Verified live Production baseline

Read-only inspection found:

- 67 `public` base tables
- 100 `public` functions
- 32 user triggers
- 62 RLS policies
- 29 rows in `supabase_migrations.schema_migrations`
- 0 WOS tables
- 0 `wos-private` Storage bucket
- 10 existing Storage object records
- Extensions: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`

The live catalog, function, trigger and table-grant manifests still match the
pinned 2026-11-09 Production baseline. No unexpected Production schema drift
was observed.

## 3. Why the earlier Supabase Branch did not rebuild Production

A Supabase Branch does not copy the current Production schema. It starts a
fresh project and replays repository migrations. That cannot reconstruct a
Production database whose live schema includes manually applied and
out-of-band history.

The concrete gaps are:

1. Only 9 of the 29 Production migration versions exactly match repository
   filename prefixes. Twenty versions were registered under later timestamps.
2. The earliest registered Production migration depends on
   `organizations`, `profiles`, `auth_profile_id()`, `auth_org_id()`,
   `auth_has_role(text)` and `set_updated_at()`. Those prerequisites came from
   older history that is not represented by the 29 Production registry rows.
3. The branch runner cannot infer missing historical files, explicit/default
   ACL metadata, role membership effects, or Storage/Edge-adjacent state from
   the application migration directory.
4. The prior data-empty branch returned `MIGRATIONS_FAILED` with zero public
   tables and zero migration records. A later branch health/reset result
   reported functions deployed while SQL still showed zero public tables. That
   proves branch health is not schema parity.

The historical replay now repairs prerequisites and compensates only in a
throwaway PostgreSQL 17 database. It never rewrites Production migration
history or inserts replacement rows into Production.

The exact first failing statement from the old hosted branch was never
captured. The dependency gap is proven; the original error text remains an
evidence limitation, not a reason to repeat destructive remote experiments.

## 4. Schema-only Production bootstrap

Source:

`supabase/production-bootstrap/20261123_app_schema.sql`

Scope:

- `public`
- `commercial_private`
- `commercial_audit`

The dump contains schema, functions, triggers, policies, comments and grants.
It contains no `COPY`, business `INSERT`, sequence values, customer rows,
Storage paths or Secrets. A synthetic Supabase fixture supplies only the
minimum local `auth`, `storage`, role and extension surfaces needed by PG17.

Canonical application signature:

- 3 schemas
- 67 tables
- 104 functions across all three application schemas
- 32 triggers
- 6 default-ACL rows
- 212 total signature rows
- aggregate SHA-256:
  `4c7c9d91506aa86933ac2bd31a94807af2253f65b4e61e955097043eb36c4170`

The schema-only bootstrap reproduced this exact 212-row signature in PG17 and
had zero organization/profile/WOS business rows.

## 5. Historical migration replay

The replay uses the repository history plus pinned Production source identity.
It reconstructed all 67 Production `public` tables and matched:

- public catalog/column/index/constraint/policy signatures
- all 100 public function signatures and definitions
- all 32 trigger definitions and enabled states
- all 67 explicit table grant signatures
- the full 212-row application signature

Guarded CI-only compensations are required:

- recreate four historical policies absent from replay
- restore explicit public ACL/default ACL metadata
- replace four named historical function bodies with exact Production
  definitions
- reproduce one existing `service_role` grant only inside the throwaway
  database

These compensations do not modify Production or Supabase migration tracking.

Limits:

- Wider Supabase Auth/API/Storage/Edge configuration is not recreated by the
  application schema dump and is marked `NOT_VERIFIED`.
- Effective Production JWT role inheritance and hosted API behavior are not
  represented by local PostgreSQL alone.
- The replay is a diagnostic bootstrap, not a new production migration history.

## 6. WOS Foundation and Production-neutral runtime rehearsal

The PG17 runner applies the reviewed WOS Foundation, the production-compatible
P7 candidate, service proof helpers, and the production-neutral V1 runtime in
a disposable database.

Passed:

- Office order creation
- four synthetic trusted PNG proof registrations
- Office completeness and order submission
- Operator accept
- idempotent replay
- Operator return with `P2_DOCUMENTS_INCOMPLETE / DOCUMENT`
- Office six-field correction save
- Office resubmission
- Operator review correction
- final `WAITING_MATERIAL`, version 7, label V3
- seven history events
- one original submission receipt and Inbox task
- Viewer and cross-organization read denial
- `canStart=false`
- two concurrent Operator accepts: exactly one succeeds and one receives
  `VERSION_CONFLICT`
- duplicate runtime installation rejected
- RPC ACL activation and deactivation
- internal image-set helper hidden from browser roles
- full runtime rollback to 67 tables and the exact Production signature
- no CPC/GLH/commercial drift

The four proof fixtures use synthetic metadata and synthetic SHA-256 values.
This is not a real Storage byte download or hosted Edge verification pass.

## 7. Result

`SCHEMA_ONLY_BOOTSTRAP=PASS`
`HISTORICAL_LINEAGE_REPLAY=PASS`
`APPLICATION_SCHEMA_PARITY=PASS`
`WOS_RUNTIME_TRANSACTION_REHEARSAL=PASS`
`FULL_ROLLBACK_PARITY=PASS`
`CPC_GLH_COMMERCIAL_NO_DRIFT=PASS`
`WIDER_SUPABASE_AUTH_STORAGE_EDGE_PARITY=NOT_VERIFIED`
`PRODUCTION_DATABASE_CHANGED=NO`

Production readiness is not established by this report alone. Exact-SQL Owner
authorization, a Production migration window, project-neutral Edge deployment,
real private-binary verification and a production browser acceptance remain
separate mandatory gates.
