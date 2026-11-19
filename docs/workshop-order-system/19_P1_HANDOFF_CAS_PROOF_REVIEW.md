# WOS P1 | isolated CAS & signer verification (REVIEW ONLY)

This PR carries three strictly separate things:
1. **Disposable SQLite real transactions**: BEGIN IMMEDIATE, conditional UPDATE RETURNING, one winner among 20 real parallel two-writer trials; unique JTI/attestor/reviewer receipts; one REVIEW_REQUIRED outbox; retry after COMMIT is idempotent; crash before commit rolls back.
2. **Offline cryptographic verification**: synthetic GitHub RS256 OIDC JWT signed in memory and synthetic Ed25519 Attestor+Reviewer keys; scope binds repository ID 1286793274, workflow_ref, sha, protected master, event, run ID/attempt, JTI, issue owner, epoch. Distinct signer identities required. No actual GitHub OIDC token or independently owned keys are used.
3. **Ephemeral PostgreSQL 17 hosted CI**: the WOS suite starts a disposable Docker Postgres inside the GitHub-hosted runner and opens two competing psql sessions in 12 rounds. It checks exactly one UPDATE/receipt/outbox succeeds and that an SQL exception rolls back a transaction. No Supabase database/credential is used.

`18_P1_HANDOFF_ISOLATED_POSTGRES_DDL_REVIEW_ONLY.sql` is a NON-EXECUTED proposal: private schema, unique receipts, conditional UPDATE, outbox that cannot dispatch, explicit identity gate always DENIED. It is not an executable migration; no independent control project is provisioned. A separate trusted verified attestor/DB identity service must be designed before the gate can be enabled, and genuine PostgreSQL two-session races must be rerun against that NEW isolated authority.

## Required fail-closed controls

- Issue #160 stays BLOCKED; lock owner Draft PR #202; fix round 3/3. PR #258 stays Draft with unsafe old shared workflow and unowned `tools/wos/**`. This PR #259 remains Draft and changes only WOS-owned source/tests/docs.
- A GitHub bot comment and a valid pre-existing Watchdog Run ID are not proof of authorship. Trust material must be fetched and pinned independently, never supplied by the writer. A real GitHub OIDC token and actual independent Reviewer-signed receipt must be tested before any CAS is authorized.
- Even with cryptographic verification, all allowed control writers must consult the SAME authoritative ledger; otherwise GitHub Issue-body PATCH can still race. GitHub Issue body becomes a read-only projection, never a dispatch authority.
- A CAS winner only enters REVIEW_PENDING and writes a REVIEW_REQUIRED outbox row. No automatic dispatch, App installation, Secret mutation, P1/P2 Gate, Production, V3 or PR merge is enabled.
- The observation-only Reaper is NOT a credential deletion system. GitHub DELETE Environment Secret API lacks Secret-version CAS. Automatic deletion requires a separately reviewed serialized writer+reaper design, enumerating ALL write paths and proving no stale delete can erase a rotated valid credential. Until then DELETE stays disabled.
- Existing Supabase projects: Production `amqpvxrurenevniilhtl`, WOS QA `xulmpqaknlwqqculbsek`, V3 control `tvnikxtrzdnomuudmfbo` must NOT be used as the new authority without separate authorization.

## Next authorized engineering sequence

1. Independent Reviewer inspects exact PR #259 HEAD, authentic signed provenance design, the Docker Postgres run logs, and negative tests.
2. Owner chooses Supabase organization and explicitly accepts any new standalone project cost; create **new** isolated WOS handoff authority and no more than one bounded nonproduction test project.
3. Isolated project: install reviewed private schema, provision identity-bound dedicated verifier role, verify actual GitHub OIDC signature from GitHub-owned JWKS and independent Reviewer public key, run genuine two-session PostgreSQL CAS+replay+crash negative tests.
4. Only after independent PASS and a **new exact-HEAD Owner authorization**, transition the lock from #202 via audited CAS, then separately develop the locked `.github/workflows/**` integration from the reviewed read-only candidate.
