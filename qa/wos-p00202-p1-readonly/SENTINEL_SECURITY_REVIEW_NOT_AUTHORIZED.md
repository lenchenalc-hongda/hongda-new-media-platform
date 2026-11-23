# WOS P1 QA-only database credential sentinel (DESIGN ONLY — NOT AUTHORIZED)

## Identity and authorization
- Sole project: **Supabase QA** `xulmpqaknlwqqculbsek`; database `postgres`. This is NOT an alteration to production projects.
- Protected master before this design: `adcd645aed13690e0f0c9cce095e6aa88395dabd`.
- Existing role: `wos_qa_readonly_preflight` is NOLOGIN, password NULL, no inherited privileges, no sessions. QA private proof function already exists; do NOT rerun its installer.
- The two SQL files here are **not migrations and are not authorized to run**. They need separate immutable Blob + hosted independent audit + precise Owner DDL authorization, QA project identity/Cron privileges revalidation, and **real Cron health/safe-failure verification**.

## Why a server-side sentinel is required
A PostgreSQL `VALID UNTIL` password expiry prevents new authentication but does **NOT terminate existing sessions** or erase a password held by GitHub Environment Secrets. Disconnecting the operator's Mac or canceling a GitHub Run can skip local cleanup. The sentinel is one independently scheduled QA `pg_cron` job, running under an existing QA postgres identity once per minute; it disables the **only** P1 role and terminates **only** its dedicated sessions if its lease is absent, expired or exceeds 45 minutes. It never acts on any other role/session or business table.

## Exact design boundaries
- Existing `pg_cron` extension is present in the real QA project; there was one existing unrelated job. Installation MUST NOT modify that job or create duplicate job names.
- Installation is transaction-wrapped, aborts unless QA role is NOLOGIN with NULL password and zero sessions, and creates only:
  1. `wos_p1_preflight_private.enforce_credential_expiry()`, a private **SECURITY INVOKER** function callable by `postgres` only. No parameters. Revokes PUBLIC and read-only role EXECUTE.
  2. `cron.schedule('wos-p1-qa-readonly-credential-sentinel','* * * * *','SELECT wos_p1_preflight_private.enforce_credential_expiry();')`.
- A fixed `EXECUTE 'ALTER ROLE wos_qa_readonly_preflight NOLOGIN PASSWORD NULL'` contains **no interpolated input**. Only the exact named QA role can be changed.
- `pg_terminate_backend(pid)` iterates sessions with `pg_stat_activity.usename='wos_qa_readonly_preflight'` only. Session termination failure emits a fixed WARNING **without rolling back the prior NOLOGIN / password revocation**; the next Cron invocation retries and independent post-run inspection must reject any remaining sessions. Warnings alone do not prove cleanup PASS. This is NOT permission to terminate arbitrary business sessions.
- The two SQL scripts contain no business SELECT, no RLS/Storage edits, no Edge/Preview modifications, no model calls, no Production changes.
- Rollback requires NOLOGIN, NULL password and ZERO sessions. It removes only the exact named Cron job and this function with `RESTRICT`. Existing schema, role, `readonly_snapshot()` and unrelated cron jobs must remain.

## Before any SQL installation
1. Obtain fresh Owner approval binding exact SQL Blobs, independent GitHub-hosted SQL/PG17 audit Run and QA project ID, plus a QA-only authorized role that can alter this dedicated role and run `pg_cron`.
2. Run a disposable **PostgreSQL 17 + pg_cron** synthetic install/rollback and negative safety suite. The local synthetic postgres superuser is NOT proof that actual Supabase-managed postgres has `pg_terminate_backend` permissions. A real QA-only NOLOGIN fixture health check is required before LOGIN authorization.
3. Verify GitHub Environment `wos-p1-qa-preflight` has required reviewers, prevent self-review, protected master only; ensure **no direct bypass**. GitHub connector cannot read/write Environment Secret APIs or dispatch Actions; an independently authenticated `gh` CLI must prove explicit create/delete/dispatch permissions before any new password.
4. Obtain and independently check the actual QA Session Pooler hostname from Connect > Session pooler. `WOS_QA_SESSION_POOLER_HOST` must be QA-only, tied to the fixed project; do NOT infer the `aws-N` index. `verify-full` must validate real server TLS and hostname; no `sslmode=require` fallback.
5. `VALID UNTIL` ≤45 minutes, DB connection limit 1, statement and idle session timeout bounded, plus *server-side sentinel itself proven healthy and scheduled* are ALL required for any temporary credential. Ensure a separate GitHub Secret deletion path. No role LOGIN if any prerequisite fails.

## Future independent live acceptance
- With the role still NOLOGIN and password NULL, demonstrate `cron.job` matches exactly one owner-controlled sentinel, `cron.job_run_details` shows at least one recent SUCCESS, and `has_function_privilege('wos_qa_readonly_preflight',..., 'EXECUTE')` is FALSE.
- Separately prove sentinel can disable an intentionally short-lived QA-only fixture lease on the dedicated role and handle its sessions **without reading real orders**, after an explicit short-duration QA permission (not authorized by this file).
- Prove no old session can continue after lease expiry, no other role was affected, and no GitHub Environment Secret remains.
- Real P1 zero-write run must bind protected master and exact QA Preview, obtain real OIDC HTTP 503 for 4 endpoints, and collect immutable 84/83/83 proof digest. This file itself is NOT that E2E or its authorization.

## Recovery and limitations
If `pg_cron` pauses or cannot signal a dedicated role session, the job can fail or emit warnings; `VALID UNTIL` blocks new logins but existing sessions may survive. Role-revocation and session-termination must not share a fatal exception rollback. Therefore *monitor job health and warnings*, use server-enforced statement/idle timeouts, and DO NOT mark cleanup complete without post-run active-session verification. A manual `trap EXIT` alone cannot satisfy crash recovery. The Cron sentinel does not delete `WOS_QA_READONLY_DSN` from GitHub; that revocation remains a separate mandatory confirmation.

**Status:** No SQL installed, role unchanged (NOLOGIN), no password/secret issued, no workflow dispatched. Await separate technical audit and Owner approval before running any of the SQL scripts.
