# Agent Control Multi-Project Protocol V1

## Goal

Allow independent Hongda projects in the same repository to make real coding progress at the same time without returning to an unsafe free-for-all.

The concurrency unit is **project**, not repository and not individual file edit.

## Core invariants

- One active coding task per project.
- Up to two projects may execute concurrently in V1.
- Every project has its own control issue, machine state, active PR, branch, task ID and fix round.
- Concurrent project tasks must have disjoint allowed paths.
- Shared paths are serialized behind a shared-path lock.
- Each self-hosted runner service uses its own installation/work directory.
- Production remains a human gate regardless of project concurrency.

## Registered V1 lanes

| Project | Control issue | Task prefix | Default branch prefix |
| --- | ---: | --- | --- |
| Customer Project Center | #10 | `CPC-` | `codex/cpc-` |
| Global Lead Hub | #72 | `GLH-` | `codex/glh-` |

The machine-readable registry is `.github/agent-control/project-registry.json`.

## Project state

Each control issue uses the existing `AGENT_CONTROL_STATE_START/END` JSON block. `project` must match the registry slug.

A project may have one of the existing workflow states:

- `READY_FOR_CODEX`
- `CODEX_WORKING`
- `WAITING_REVIEW`
- `FIX_REQUIRED`
- `NEEDS_DECISION`
- `APPROVED_FOR_MERGE`
- `MERGED`
- `BLOCKED`

`active_pr`, `active_branch`, `verified_head`, `master_sha`, `fix_round`, `max_fix_rounds`, `auto_merge` and `auto_production` remain project-local.

## Concurrent execution

GitHub may run CPC and GLH at the same wall-clock time when:

1. both control states are executable;
2. each task belongs to its own control issue;
3. task allowed paths pass the registry policy;
4. allowed paths do not overlap;
5. neither task holds/needs a shared path;
6. two self-hosted runner instances are online and both carry the `hongda-agent-control` label.

The runners may be on the same physical Mac. They must use different runner installation directories and therefore different `_work` directories.

## Shared path lock

Shared paths include Agent Control infrastructure, root app/config, shared layout/navigation, package manifests/lockfiles, common auth/Supabase helpers and any path not owned by exactly one registered project.

A normal CPC or GLH lane must fail closed when a requested path is shared.

If a business task really requires a shared change:

1. PM creates a separate bounded shared-path task;
2. all other project tasks that could touch that shared path remain read-only for it;
3. PM records the lock holder;
4. shared task is reviewed/merged;
5. affected project branches refresh from current master before continuing.

## Cross-project master movement

One project merging changes moves `master` while another project PR is open. This is expected.

Rules:

- Do not invalidate a running project solely because unrelated disjoint paths merged to master.
- Before merge, PM must check the open PR against current master for mergeability and cross-project conflicts.
- If GitHub reports conflicts or a shared dependency changed materially, refresh/rebase through a bounded task before merge.
- Never force-push to hide divergence.

## Runner pool

V1 target pool:

- runner 1: existing `hongda-agent-control` self-hosted macOS X64 runner;
- runner 2: second self-hosted macOS X64 runner on the same Mac, separate installation/work directory, same `hongda-agent-control` label.

GitHub Actions will assign independent project jobs to whichever runner is free.

## PM review

PM review is project-aware:

- branch/task/PR must match that project's control issue;
- exact-head review still applies;
- CI/Vercel/Build/Smoke/Secret Audit remain required as applicable;
- ordinary repository merges may use the owner's standing authorization only for the matching project control state;
- Production/high-risk gates still require the owner.

## Anti-loop and idempotency

Per project:

- `ONE_ACTIVE_TASK_PER_PROJECT = true`
- `MAX_AUTO_FIX_ROUNDS = 3`
- idempotency key includes project + task + head
- do not create a second PR for a fix when that project already has an active PR

Across projects:

- same task ID may never be reused across different project slugs;
- overlapping allowed paths fail closed;
- shared path requires explicit lock ownership.

## Migration from single-repo serialization

1. Keep CPC Issue #10 and its existing workflow intact while current work finishes.
2. Merge the multi-project infrastructure change.
3. Bring a second runner instance online.
4. Convert Issue #72 into the GLH control issue with its own machine state.
5. Start GLH through the dedicated project-lane workflow.
6. Run CPC and GLHÛÛ˜İ\œ™[K‚Ëˆ™]\™H™\ÜÚ]ÜK]ÚYHÙ\šX[^˜][ÛˆÛ›HY\ˆ›İ[[™H›ÛÙˆ\ÜÙ\Ë‚‚ˆÈÈ[X[ˆØ]\È[˜Ú[™ÙB‚“™]™\ˆ\˜[[^™H]Ø^H\›İ˜[™\]Z\™[Y[È›Ü‚‚‹H›ÙXİ[ÛˆÔSÔ“ËÙ[‹ÜÙXÜ™]ÎÂ‹H\İXİ]™H›ÙXİ[Ûˆ]HXİ[ÛœÎÂ‹H\İXİ]™HZYÜ˜][ÛœÎÂ‹H™X[Y]KÕÚ]Ğ\›ÙXİ[Ûˆİ]İ™\Â‹Hİ\İÛY\ˆİÛ™\œÚ\]Â‹Hš[˜[˜ÚX[Ûİ\˜ÙK[Ù‹]]Â‹H^\›˜[X›\Ú[™ÎÂ‹HX]\šX[\Ú[™\ÜË\ÛXŞHXÚ\Ú[ÛœË‚