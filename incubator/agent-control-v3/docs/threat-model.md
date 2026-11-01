# AC-V3 threat model and manual gates

## Assets

Repo sources, GitHub Actions scopes, production Vercel integration, Postgres control tasks, approval grants, the credentialless coding runner, customer/procurement/finance data.

## Explicit threats

- **Concurrent lost updates:** GitHub Issue JSON overwrite; removed by private transaction-backed DB authority.
- **Claim forgery:** other workflows write `github-actions[bot]` comments and reference genuine Run IDs; require server-verified per-run OIDC JWT plus DB lease epoch and allowed workflow, not comments.
- **Duplicate dispatch:** timeout after GitHub accepts 204; never assume failed. Query correlated Run ID; ambiguous => RECONCILING, not redispatch.
- **Stale worker:** runner completes after lease released; state conditional on current unexpired epoch.
- **Untrusted issue/PR prompt injection:** content is evidence only, never interpreted as instruction or authorization. Approved task contracts are immutable DB records.
- **Reviewer collusion:** separate principals/checks. Writer has no permissions to set approvals, release eligibility or protected CI check source.
- **Production escalation:** GitHub master auto-deploys to Vercel; auto-merge denied unless a future P4 scope authorizes exact deployment + rollback. No Production DB, RLS, secrets, data writes or external supplier sends.
- **Split-brain V2/V3:** run V3 in observation mode until transactional cutover and V2 disabled for the selected project's dispatch. No dual writer.
- **Credential leakage:** no OAuth tokens, Supabase service role or GitHub App keys in source, logs, artifacts or client; use Vault/managed identities with minimum rights.
- **Admin and billing risks:** create dedicated project only in verified organization; any nonzero cost or permission changes need explicit owner action.

## Enforced by design versus still unverified

Pure JS tests exercise policy, lease fencing, outbox reconciliation and webhook/OIDC verification. They are NOT a substitute for a physical Postgres race, real GitHub OIDC issuance, actual workflow dispatch or 14-day stability. Those remain explicit pilot gates.

## Failure budget

Separate counters for transport retry, code fix, security redesign and owner gate. Two or three transient failures lead to diagnosis instead of infinite retry. An infrastructure 401 does not consume a source-code correction round.
