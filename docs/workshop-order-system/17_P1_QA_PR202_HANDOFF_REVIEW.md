# PR #202 → WOS Cloud Reaper | Independent serial-handoff review gate

**Decision: BLOCKED — this is a code-owner assessment, NOT an independent Reviewer PASS.**

Examined: PR #202 exact HEAD `b3f382976049eacabefc7965cbb90312fd6903cc`; Issue #160 remains `BLOCKED` with `shared_path_lock_owner=202`, fix round 3/3. PR #258 HEAD `06696e2bad4c6e0b2da49e4c43f9b59095c9c568` remains Draft. This branch is WOS-owned source-only, not the locked infrastructure lane.

## Demonstrated failures in the existing protocol

1. `reliability-watchdog.mjs` uses `updateState(issue, state)`: full GitHub Issue-body PATCH after GET. An Owner edit between final GET and PATCH is lost; post-PATCH check cannot undo overwrite. GitHub Issue PATCH has no proven atomic body CAS.
2. `validateWatchdogClaimRun` checks referenced authentic watchdog Run metadata, not which workflow **wrote the Issue comment**. A foreign `issues:write` workflow using `github-actions[bot]` can reference a genuine Run ID. The comment is forgeable as a trusted claim.
3. `shared-infra-lock.mjs` requires one exclusive `infra/` PR matching the Issue state, branch, exact HEAD/master and infra-owned changed paths. PR #202 is that owner; a second infra PR or text-only state amendment cannot safely take its lock. `tools/wos/**` is currently outside WOS/infra registry ownership.

## Safe new protocol (design only, NOT installed)

Use an **isolated authoritative transactional control ledger**, not the GitHub Issue body, not Production, and not the V3 database under current authority. Store unique resource name, monotonically increasing epoch, holder PR/head, reviewer and Owner decision digest. An authenticated single transaction must conditionally change the row only when old owner=202, old HEAD and expected epoch match; `UPDATE ... RETURNING` must change exactly one row. 0 rows means **BLOCKED**, not retry with an invented epoch. Release and acquire are a single atomic transaction. All relevant writers MUST be forced through that ledger; otherwise CAS is not universal. Issue state is a read-only projection, never written to drive execution.

Require independently verified, workflow-scoped GitHub OIDC identity plus signed attestor receipt bound to exact repository, protected workflow/ref, SHA, run, short-lived token, owner decision and ledger epoch; validate cryptographic signature, permitted audience/issuer and replay resistance. `github-actions[bot]` login or the referenced real Run ID alone is insufficient. An independent Reviewer must check writer/reviewer separation.

**Security tests required before PASS:** two concurrent candidates yield exactly one CAS success; stale epoch/master/HEAD rejected; Owner Issue edit never overwritten; external workflow fake comment referencing a *real* watchdog run rejected; wrong signature/OIDC/replay rejected; crash-after-CAS recovers without second dispatch. Verify against a real isolated control store and independently issued attestation. No local test or self-authored comment alone proves these properties.

No creation/configuration of control ledger, new App, OIDC/credential, GitHub shared workflow path, Supabase project, production environment or master merge is authorized now. Keep Issue #160 and PR #202 unchanged until an independent technical Reviewer provides explicit signed PASS and Owner separately authorizes actual handoff.

## Stage 3 staged but not installed

`docs/workshop-order-system/16_P1_QA_CLOUD_REAPER_READONLY_WORKFLOW_CANDIDATE.yml` is **non-executable documentation**, with `permission-environments: read`, protected master checkout, default-off gate, and reference to the actual observation-only source `src/lib/workshop-orders/qa-cloud-reaper/observer.py`. This observer can never delete an expired secret. It is not a replacement for PR #258's current unsafe writer workflow. Separate independent shared-infra review and authorization must precede copying it to `.github/workflows/**` and binding to a new exact protected master.

**Not authorized:** App install, Secrets set/delete, Cloud Reaper activation, real QA credentials, P1/P2 Gate, control Issue changes, PR merge, Production or V3.
