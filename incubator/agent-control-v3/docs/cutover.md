# AC-V3 cutover and rollback

1. **Inventory:** snapshot live Issue #10/#72/#104/#195 machine state, open PR exact heads, active Actions and deployment IDs, no write actions. Keep legacy Issue #160 / PR #202 blocked and unmerged.
2. **Shadow:** ingest GitHub events and historical transitions into V3 DB as `OBSERVED`; do NOT issue workflow_dispatch, open PRs, merge, update V2 Issue JSON or alter Production.
3. **Single project pilot:** choose a new low-risk nonproduction project with synthetic data and empty workstream. All tasks are pre-approved, paths isolated, workflow identity attested and P4 auto merge off.
4. **Switch ownership:** for one project only, atomically set V3 dispatch owner in control DB and explicitly disable V2 dispatch for that project. Verify current running V2 tasks are terminal and no active PR/Runner conflicts exist before enabling V3 task claim.
5. **Verify:** 10 consecutive dry-run tasks, forced runner crash, duplicate webhook and dropped dispatch acknowledgement, stale lease and cross-project path collision.
6. **Rollback:** disable V3 dispatch feature flag, preserve DB/event history, reconcile in-flight GitHub runs (do not blindly restart V2), then authorize one V2 recovery owner. No destructive truncation or force push.
7. **P4/P5 later:** protected master Rulesets, controlled auto-merge and Production release require a *new* owner authorization. P0-P3 can never activate these implicitly.

Watchdog health MUST be external to the executor and must report missing heartbeat. A one-off GitHub Actions SUCCESS is not evidence of application-level task progress.
