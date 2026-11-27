# WOS V1 QA UAT Independent Closer Implementation

Status:
`SOURCE_AND_LOCAL_HARNESS_PASS / INDEPENDENT_SOURCE_REVIEW_PASS / REMOTE_ARM_NOT_AUTHORIZED`

This document defines the final two-closer design for:

`WOS-V1-PRODUCTION-M2-QA-UAT-003`

It does not authorize any remote SQL, Cron job, Edge deployment, environment
change, Gate opening, order creation or Production operation.

The prior `...-001` and failed-Closed `...-002` executions are consumed and
remain historical evidence only. The active source is bound to `003`; reuse of
an old positive control row is rejected by the immutable control identity,
audit-preserving authorization pattern and closed-state guards.

## Security Model

Both closers share one immutable control row:

```text
authorization_id
project_ref
execution_id
code_sha256
opened_at
write_deadline_at = opened_at + 480 seconds
db_cleanup_deadline_at = opened_at + 540 seconds
edge_cleanup_deadline_at = opened_at + 840 seconds
```

The database server derives `opened_at`; callers cannot submit or extend it.
Critical fields cannot be changed. A closed DB or Edge state cannot be
reopened. There is one positive control row per authorization ID, and the
existing closed row prevents a later retry from creating a new positive run
under the same authorization.

Before any business Gate may open, both of these receipts must exist:

```text
DB closer ARM receipt
EDGE closer ARM receipt
```

Each receipt is created only after its actual executor writes a heartbeat.
Heartbeats must be no older than 30 seconds. The authorized CREATE-response
order ID is bound exactly once before the first image proof, and only after
the immutable CREATE receipt matches the fixed Request, Office Profile,
organization, order number, order ID and CREATE payload fingerprint.

The database wrappers and Edge verifier check control state, order binding,
heartbeat recency and server clock on every write. Final QA Edge proof
insertion calls a QA-only transactional wrapper, so the guard and write occur
in one transaction. Missing receipts, stale heartbeats, closed state or
expiration raise a permission error. Cron or launchd delay therefore cannot
extend write authorization.

## DB Closer

Primary source:

```text
docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql
scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs
```

The install SQL creates:

```text
wos_v1_qa_uat.closeout_controls
wos_v1_qa_uat.closer_arm_receipts
wos_v1_qa_uat.closer_close_receipts
```

It also creates the DB/Edge ARM functions, close functions, status function,
server-side write-deadline checks and the two public service-role-only Edge
gate functions.

The runner supports:

```bash
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs install-closer-only
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs arm-closer-only
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs status-closer-only
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs close-closer-only
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs recover-closer-only
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs install-full-m2
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs activate-full-m2
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs arm
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs status
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs close
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs revoke
node scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs recover
```

`install-closer-only` uses only
`WOS_V1_QA_CLOSER_ONLY_INSTALL_NOT_AUTHORIZED.sql`. It installs schema
`wos_v1_qa_closer`, control and receipt tables, heartbeat/tick/close functions,
and the service-role-only Edge status/heartbeat/close/probe RPCs. It does not
read or create `write_gates`, Production M2 functions, QA business wrappers,
order bindings or authenticated grants. It never reads the Activate SQL.

The full M2 install and activation are separate explicit commands. A closer-only
rehearsal cannot silently activate either authenticated wrapper.

ARM registers a `pg_cron` job every 10 seconds. Every tick before the write
deadline records the DB executor heartbeat; a tick at or after the deadline
atomically closes all authorized QA gates, revokes both QA wrapper grants
from `authenticated`, writes a DB close receipt and unschedules the job. ARM
succeeds only after a real cron heartbeat is observed. Close and replay both
verify the exact cron job is absent.

If `pg_cron` is unavailable, ARM fails and rolls back the control row. A
manual scheduler cannot be represented as an automatic DB closer.

The runner uses `psql` when available, an explicitly named disposable
container for local CI, or the immutable
`postgres@sha256:f9cf3e1f0066f0eb0c48707d864f0ac5941e9ff454a072077d97a4d278d07d73`
client image for a remote QA DSN. Test-only manual ticks are accepted only in
an owned `codex-wos-prod-readiness-pg17-*` container and an `_ci` database.

## Edge Closer

Primary source:

```text
supabase/functions/wos-v1-verify-image/index.ts
src/lib/workshop-orders/production-app-client.ts
scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs
tests/live/wos-v1-qa-edge-closer-process-kill.mjs
```

QA Preview image verification now sends the fixed authorization header. The
QA Edge branch requires:

1. Exact QA project runtime.
2. Exact authorization ID.
3. Exact execution ID and Edge process nonce.
4. Active profile and same-organization QA order.
5. Exact CREATE-response order binding.
6. Both closer ARM receipts and fresh heartbeats.
7. `edge_state=ARMED`.
8. `clock_timestamp() < write_deadline_at`.

Any database failure, missing gate or expired deadline returns fail-closed.
The environment flag remains an additional global disable, but is no longer
the expiry mechanism.

The QA branch never calls a Proof renewal RPC. It records only a new Proof
through the transactionally guarded QA wrapper; an existing expired Proof is
rejected. Production behavior is unchanged.

The Edge handler separates two credentials:

1. Admin RPC calls prefer `SUPABASE_SECRET_KEYS.default` and use the legacy
   `SUPABASE_SERVICE_ROLE_KEY` only when no new Secret Key is configured.
2. The closer probe must present the exact configured legacy service-role JWT.
   `WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY` is the preferred dedicated secret;
   the reserved `SUPABASE_SERVICE_ROLE_KEY` remains a compatibility fallback.
   An `sb_secret_*` Admin key is never accepted in the Authorization header.
3. The exact JWT comparison remains the trust anchor. The handler additionally
   decodes the already matched JWT and requires `role=service_role` and the
   fixed QA project `ref`. This is defense in depth, not a replacement for
   Supabase platform `verify_jwt=true`.

The local HTTP harness imports the actual exported Edge handler and uses the
real `@supabase/supabase-js` client against a local mock PostgREST endpoint.
It asserts that the Admin RPC request uses `SUPABASE_SECRET_KEYS.default` when
both key formats exist, while a closer request with only the legacy JWT still
passes. It also covers wrong JWTs, an ordinary-user JWT, a new Secret Key used
as a JWT, missing credentials, project/authorization/execution/nonce
mismatches, unavailable or missing DB state, expiration and closed writes.

The LaunchAgent uses the Supabase service-role REST endpoint rather than
`psql`, so it does not depend on an inherited shell PATH or a local PostgreSQL
client. The service-role credential must be a JWT with role `service_role` and
project ref `xulmpqaknlwqqculbsek`; mismatches fail before any RPC. It sends a
heartbeat on each run and each loop iteration. The first heartbeat creates the
Edge ARM receipt; `arm --load` cannot succeed without observing it.

At the server write deadline the Edge closer:

1. Calls `close_edge_closer`.
2. Writes an immutable Edge close receipt.
3. Calls a service-role-authenticated no-write probe for the exact execution
   ID and process nonce.
4. Requires `503 / WOS_V1_QA_EDGE_CLOSED`, `gateStatus=CLOSED`, the exact
   execution ID and a non-empty close timestamp.
5. Unloads its own LaunchAgent, verifies `launchctl print` no longer finds the
   label and seals that result into the close receipt.

The runner supports `arm`, `watch`, `status`, `close`, `revoke` and `disarm`.
`arm --load` is mandatory for a real ARM receipt; a dry-run cannot create a
fake Edge receipt.

The SQL probe returns `OPEN` only when both states are `ARMED`, both matching
DB/Edge ARM receipts exist, both heartbeats are no older than 30 seconds and
the server deadline has not passed. It returns `NOT_ARMED`, `STALE`, `EXPIRED`
or `CLOSED` without allowing writes. Every non-denied status includes the
server-side `edgeProcessNonce`; an `OPEN` response with a missing or mismatched
nonce is denied by the Edge handler.

If the Mac is off or offline, the server clock still rejects every Edge write
at `write_deadline_at`. The LaunchAgent improves cleanup timing but is not the
security boundary.

The current Hosted QA `wos-v1-verify-image` is version 38 after v36 bytes were
restored, bundle
`21fd1a8d31508662c6c0790e9304b793e864ffb321de5b77bcc8145e91f18450`.
Version 36 contains the restored source bytes previously preserved from v34
under
`docs/workshop-order-system/production-readiness/evidence/WOS_V1_QA_EDGE_V34_SOURCE_20261127`.
The restored v36 closure does not contain the closer probe branch. The
closer-only rehearsal therefore requires a separately authorized deployment of
the reviewed source; the v36 closure and runtime configuration remain the
recovery target. No remote Edge deployment is performed by this
source-preparation round.

## ARM Protocol

The future Owner execution must perform these steps in order:

1. Install the exact reviewed QA UAT SQL on QA only.
2. Set the DB closer DSN and Edge service-role credential in dedicated
   Keychain services.
3. Build and deploy the exact-HEAD Preview with the precommitted execution ID
   and process nonce in its public runtime configuration.
4. Run `db-closer arm` once with that execution ID and exact code SHA. The
   database derives the UTC start and deadline values.
5. Verify the returned DB ARM receipt and active `pg_cron` job.
6. Run `edge-closer arm --load` with the same execution ID, arm token,
   precommitted nonce and code SHA.
7. Verify the LaunchAgent is loaded and its process heartbeat created the
   Edge ARM receipt.
8. Verify both receipts have the same authorization, project, execution ID,
   code SHA and write deadline.
9. Bind the exact CREATE-response order ID only after matching the immutable
   CREATE receipt, Office Profile, order number and payload fingerprint.
10. Verify a one-closer-only Gate open is denied.
11. Only then open the three QA UAT Gate rows.

Failure or drift at any step blocks Gate opening.

Credential storage and scope:

```text
DB DSN Keychain service: WOS_V1_QA_DB_CLOSER_DSN
DB DSN account: xulmpqaknlwqqculbsek
Edge service-role Keychain service: WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY
Edge service-role account: xulmpqaknlwqqculbsek
```

The DB transport accepts only the exact direct host/user
`db.xulmpqaknlwqqculbsek.supabase.co` / `postgres`, or an AWS Supabase pooler
host matching the fixed pooler pattern with exact user
`postgres.xulmpqaknlwqqculbsek`, plus database `postgres` and
`sslmode=require|verify-ca|verify-full`. The Edge transport rejects non-JWT
service credentials and JWTs whose `role` is not `service_role` or whose `ref`
is not the QA project. Neither runner prints the DSN, service key, JWT or
Keychain value.

Dedicated Edge closer secret:

```text
WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY
```

The first remote attempt on `c20728f` proved that the reserved Supabase
`SUPABASE_SERVICE_ROLE_KEY` project value can diverge from the current legacy
API key and cannot be overwritten because Supabase reserves the `SUPABASE_`
prefix. The probe failed before ARM with
`WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE`. No control, Cron or LaunchAgent was
created. Hosted v36 source bytes were restored as a new version with writes
disabled. The source fix prefers the dedicated secret above and retains the
reserved value only as a legacy fallback.

## Local Evidence

```ini
DB_CLOSER_SOURCE=READY
EDGE_CLOSER_SOURCE=READY
DB_CLOSER_FAIL_CLOSED=PG17_PASS
EDGE_CLOSER_FAIL_CLOSED=PG17_AND_REAL_SUPABASE_CLIENT_HTTP_PASS
DB_CLOSE_WITHIN_540S=LOCAL_HARNESS_PASS
EDGE_CLOSE_WITHIN_840S=LOCAL_HARNESS_PASS
MAIN_PROCESS_KILL_TEST=LOCAL_LIVE_DB_SESSION_TERMINATION_PASS
EDGE_PROCESS_HEARTBEAT=LOCAL_DETACHED_PROCESS_PASS
CREATE_RECEIPT_ORDER_BINDING=PASS
QA_PROOF_RENEWAL=FORBIDDEN_AND_ABSENT
TEST_BYPASS_SCOPE=PASS
CONCURRENT_CLOSE_IDEMPOTENT=PASS
CLOSED_GATE_REARM=DENIED
DB_CRON_UNSCHEDULE=PASS_LOCAL
CLOSED_GATE_DENIAL=PASS
DATA_RETENTION=PASS
INDEPENDENT_SOURCE_REVIEW=PASS
P0_FINDINGS=0
P1_FINDINGS=0
P2_FINDINGS=0
```

The local harness uses a disposable PostgreSQL 17 database and a mock
`cron.schedule` table for DB runner integration. It terminates a live
database-holding executor session and verifies the independent closer still
completes. It rejects test-only manual ticks outside an owned disposable
container and verifies QA Proof renewal is absent. It does not prove the live
Hosted `pg_cron` scheduler, a loaded LaunchAgent in the owner account, or the
deployed Edge endpoint. Those remain pending until separately authorized
remote ARM.

The dedicated closer-only harness additionally proves installation without
Production M2, no `write_gates` or business-table creation, no authenticated
RPC execution, DB cron heartbeat and expired-tick close, detached Edge
heartbeat and closed HTTP probe, cron removal, and audit-retaining RPC
decommissioning.

## Required Remote Authorization

A future Owner Gate may authorize only the QA project
`xulmpqaknlwqqculbsek` to:

- install the exact closer SQL;
- register one DB closer `pg_cron` job;
- deploy only the reviewed `wos-v1-verify-image` function with
  `verify_jwt=true`, the QA ref allowlist, exact Preview Origin and writes
  initially disabled;
- deploy the exact QA Preview;
- load one Edge closer LaunchAgent;
- ARM both closers with one unique execution ID and exact code SHA;
- verify status, server-deadline denial and independent close;
- open the bounded QA UAT Gates only after both ARM receipts pass.

The corresponding closeout must:

- call both close functions;
- verify DB and Edge close receipts;
- verify a closed-state Edge probe;
- require the independently produced Edge HTTP close receipt file, bound to
  execution ID, process nonce, code SHA, `503 / WOS_V1_QA_EDGE_CLOSED` and its
  recomputed receipt hash;
- revoke both wrapper grants from `authenticated`;
- remove the QA service-role Edge/bind entry points from the exposed schema;
- unschedule the DB cron job;
- unload the Edge LaunchAgent;
- restore Edge write/read environment flags to false and redeploy the exact
  reviewed Edge source;
- run RC02 and Reactivation data-retaining Recovery;
- preserve all QA orders, images, Proofs, Storage objects and audit rows.

Production deployment, Production SQL, PR merge and automatic production
start remain forbidden.
