# WOS M4-02 Hosted Staged Install Runbook

Status:
`BLOCKED_STORAGE_OWNER_EXECUTOR_NOT_DEMONSTRATED / REVIEW_ONLY_NOT_AUTHORIZED`

Target QA project: `xulmpqaknlwqqculbsek`

## Hard Owner Boundary

The M4-02 installation cannot be one transaction executed by the normal QA
`postgres` login.

- `postgres` is not a superuser and is not a member of
  `supabase_storage_admin`.
- `storage.objects` is owned by `supabase_storage_admin`.
- PostgreSQL 17 permits `CREATE POLICY` only for the table owner.
- A SELECT grant option does not grant policy DDL authority.

The candidate split is therefore:

1. Database objects installed by QA `postgres`.
2. Storage policies installed through the Supabase Dashboard Storage Policy
   owner path or another platform-supported `storage.objects` owner executor.
3. Authenticated EXECUTE opened by QA `postgres` only after Phase 1 and Phase 2
   catalog checks pass.

No role membership on `supabase_storage_admin` and no change to
`storage.objects.relowner` are permitted.

**Hard blocker:** this task has not demonstrated a project-specific, auditable
executor that can run the exact Phase 2 transaction as
`supabase_storage_admin`. The local PG17 suite uses a synthetic login role
solely to exercise policy SQL and rollback mechanics. That is not evidence that
the hosted Dashboard or Management API exposes the same executor. Phase 2 must
remain blocked until Supabase-supported executor evidence is supplied and
independently reviewed.

## Phase 0: Read-Only Prerequisites

Before any DDL:

- Pin the exact PR head and SQL SHA-256/Git blob values.
- Confirm QA project identity.
- Confirm all P2, Office, M2 and Legacy Gates are OFF with no whitelist/TTL.
- Confirm authenticated lacks direct Proof/Receipt SELECT and M2 EXECUTE.
- Confirm `postgres` is `NOSUPERUSER`, `CREATEROLE`, `BYPASSRLS`.
- Confirm `postgres` owns all named public tables.
- Confirm `supabase_storage_admin` owns `storage.objects`.
- Confirm `auth.uid()` is owned by `supabase_auth_admin` and PUBLIC EXECUTE
  already exists.
- Confirm Production auto-build suppression and domain state separately.

Any change requires a new review. The SQL itself cannot prove project identity
or Production hosting state.

## Phase 1: Database Objects

File:

`WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_NOT_INSTALLED.sql`

Executor: QA `postgres`.

The phase is one transaction. It:

- creates `wos_m4_proof_verifier_owner`;
- creates two RPCs and one private caller-UID bridge;
- uses temporary `SET TRUE` membership only for function ownership transfer;
- removes the temporary SET membership and temporary schema CREATE before
  commit;
- grants only the minimum table/schema/function dependencies;
- creates no Storage policy;
- grants no authenticated EXECUTE;
- grants no `auth.uid()` ACL change.

Final installer membership is expected to remain
`ADMIN TRUE, INHERIT FALSE, SET FALSE`.

After success, authenticated users cannot call either RPC and no Storage policy
is present.

## Phase 2: Storage Owner Policy Phase

File:

`WOS_M4_02_READONLY_PROOF_VERIFIER_STORAGE_OWNER_PHASE_NOT_INSTALLED.sql`

Executor: `BLOCKED_NOT_DEMONSTRATED`. The normal `postgres` executor must not be
used. A future authorization must first prove the exact Supabase-supported
owner executor for project `xulmpqaknlwqqculbsek`.

The phase is one storage-owner transaction. It creates exactly:

- `wos_m4_proof_owner_storage_read`
- `wos_m4_proof_verifier_storage_read`

After success, the policies exist but authenticated EXECUTE is still revoked.
All downloads continue to fail closed.

## Phase 3: Activation

File:

`WOS_M4_02_READONLY_PROOF_VERIFIER_ACTIVATION_NOT_INSTALLED.sql`

Executor: QA `postgres`.

This phase is one database transaction. It verifies both earlier phases, then
grants authenticated EXECUTE on the snapshot and Storage guard only.

This is the exact point where direct authenticated PostgREST RPC access becomes
available. The Vercel route flag is not a database authorization boundary.
Owner approval must explicitly accept this direct read capability.

The Next.js route additionally requires the default-OFF server-side flag:

`WOS_QA_M4_PROOF_READONLY_ENABLED=true`

It no longer reuses `WOS_QA_INBOX_READONLY_ENABLED`.

## Failure Isolation

- Phase 1 failure: transaction rolls back all roles, functions, grants and
  policies from that phase.
- Phase 2 failure: transaction rolls back both Storage policies; authenticated
  EXECUTE remains closed.
- Phase 3 failure: transaction rolls back both EXECUTE grants; installed
  policies remain inert.
- There is no cross-owner atomic transaction. Safe staging is provided by
  keeping authenticated EXECUTE revoked until the final database transaction.

## Rollback

1. `WOS_M4_02_READONLY_PROOF_VERIFIER_DEACTIVATE_NOT_INSTALLED.sql`
   as QA `postgres`: revoke both authenticated EXECUTE grants.
2. `WOS_M4_02_READONLY_PROOF_VERIFIER_STORAGE_OWNER_ROLLBACK_NOT_INSTALLED.sql`
   as the `storage.objects` owner: drop exactly both M4 Storage policies.
3. `WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql`
   as QA `postgres`: drop RPCs/helper, owner policies, grants, bridge and the
   dedicated role.

If storage-owner rollback fails, authenticated access is already closed and
the RPCs cannot be reached. Do not drop database functions while Storage
policies still depend on them.

## Sales Scope

Same-organization Sales can invoke the snapshot RPC only when the Sales Profile
is the order creator or sales owner. The Storage guard uses the same search
condition before calling the full snapshot validator. Non-owner Sales fail
closed for both direct RPC and Storage download.

## Expired Historical Proofs

Order `953d2204-3e65-4b75-b10e-c6e97f1bbb56` has five historical Proof records
that are expired. They must remain rejected. This task does not change
`expires_at`, create a new Proof, or carry old Office/Workshop signatures onto
a future refreshed Proof. A new Proof refresh/sign-off requires a separately
authorized M2 business flow.

## Next Owner Gate

`DEMONSTRATE_SUPABASE_STORAGE_OWNER_EXECUTOR_BEFORE_SQL_INSTALL_AUTHORIZATION`

The authorization must name all phase files, raw hashes, Git blobs, executor
roles, expected catalog state after each phase, rollback files and the direct
authenticated read capability created by activation.

## References

- PostgreSQL 17 `CREATE POLICY`: table ownership is required.
  https://www.postgresql.org/docs/17/sql-createpolicy.html
- Supabase RLS guide: policies may be applied through the Dashboard SQL Editor
  or migration path.
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: Storage policies are policies on
  `storage.objects`.
  https://supabase.com/docs/guides/storage/security/access-control
