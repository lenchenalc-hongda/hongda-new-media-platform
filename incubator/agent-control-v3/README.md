# Hongda Agent Control V3 (P0-P3 isolated incubator)

**Status:** nonproduction prototype; no remote dispatch, merge, deployments, database mutations or webhook listeners enabled. Original HongdaOS repository and blocked PRs remain untouched.

## Intent

An autonomous orchestration control plane that survives worker restarts, uses PostgreSQL as the sole machine-state authority, and requires exact-identity/authorization evidence for each task, PR, and release. GitHub Issues are mirrors rather than writable machine-state storage. Existing GitHub Actions/Codex/DeepSeek/Mac Runner/CI/Vercel are execution adapters, not authorities.

## Quick local verification

```bash
node --version # Node 22+
npm test
npm run demo
```

No environment variables, accounts or remote services are needed for the local model tests. The demo intentionally runs with `remote_dispatch_enabled=false`.

## Layout

- `docs/architecture.md` P0 architecture, state diagram, scope, milestones.
- `docs/threat-model.md` security, limitations, manual gates and OIDC assumptions.
- `docs/cutover.md` migration/shadow/rollback for legacy Issues and blocked PRs.
- `db/001_control_plane.sql` P1 **unapplied** private schema and guarded SQL functions.
- `src/core.mjs` P1 deterministic in-memory transactional model (tests only).
- `src/policy.mjs` P3 deterministic approved-next-task/merge-safety policy.
- `src/github-webhook.mjs` P2 signature verification, delivery validation.
- `src/oidc.mjs` P2 GitHub-issued OIDC JWT verification with exact workflow and repository identity.
- `src/dispatcher.mjs` P2 fail-closed outbox dispatcher/reconciliation adapter.
- `test/*.test.mjs` adversarial P1/P2/P3 tests; do not substitute for actual Postgres/GitHub pilot evidence.

## Current hard gates

- GitHub connector currently cannot create a fresh repository, so source may be staged temporarily on a non-merged incubator branch of the existing repo, and must be migrated to a private dedicated repository after admin provisioning.
- Dedicated Supabase `hongda-agent-control` project not created until organization and cost provisioning are confirmed. Existing business Production database and `hongda-review-dev` remain unchanged.
- SQL schema is a migration proposal until applied to the dedicated database and verified with concurrent physical sessions. No claim of actual PostgreSQL concurrency acceptance yet.
- P2 outbound GitHub dispatch defaults OFF; outbound workflow tokens, OIDC audience and GitHub App installation have not been configured, so live unattended dispatch has not been verified.
- P4 auto-merge and Production release are OUT OF SCOPE. Even a green CI run does not authorize merge or Production mutations.

## Acceptance

P0 architecture frozen; P1 SQL concurrency and RLS security tests on isolated PostgreSQL; P2 signed webhook, OIDC, ambiguous run reconciliation and lease failure-injection; P3 approved-epic deterministic continuation and 10-task nonproduction pilot; independent PM and security review before any cutover.
