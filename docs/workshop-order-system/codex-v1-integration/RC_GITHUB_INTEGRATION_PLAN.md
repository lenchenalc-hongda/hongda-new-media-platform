# WOS V1 GitHub Integration Plan

REPOSITORY: `lenchenalc-hongda/hongda-new-media-platform`
CONTROL_ISSUE: #104
ACTIVE_TASK: `WOS-P2-M2-PROOF-LOCK-001`
ACTIVE_PR: #269
ACTIVE_PR_HEAD: `cb46d2380062a2d286fb2d0e56a0a2a51debdcce`
ACTIVE_STATE: `WAITING_REVIEW`
MASTER_AT_AUDIT: `5ac678a50af6391efbdfb0258f037cbdeb2e18d6`
REMOTE_PUSH_AUTHORIZED: NO
NEW_PR_AUTHORIZED: NO

## Current Control Finding

PR #269 is open, Draft, mergeable and contains exactly six WOS-owned files.
The RC local branch contains 142 allowlisted delivery files relative to master,
including five shared paths and substantial UI/API/test/documentation
integration.

Therefore, the RC cannot be pushed to PR #269 or treated as a replacement for
the active task without violating the current task allowlist and single-active-PR
rule.

The five PR #269 source blobs match the RC exactly:

- M2 SQL
- M2 security/authorization document
- Handoff timeline source
- Handoff timeline test
- M2 proof-lock source test

Only `tests/unit/workshop-order-suite.test.ts` is intentionally extended in the
RC to wire the additional WOS tests.

## Generated Handoff Artifacts

- Complete 142-file status list: `RC_FILE_DIFF.tsv`
- Machine-readable file allowlist candidate: `RC_ALLOWED_PATHS.json`
- This file lists shared/waiting actions and the legal sequence.

The final evidence bundle and Git bundle are generated after the documentation
commit so their metadata points at the final RC delivery commit.

## WOS-Owned Paths

All files listed as `WOS` in `RC_FILE_DIFF.tsv`, including:

- `src/lib/workshop-orders/**`
- `src/app/workshop-orders/**`
- `src/app/api/workshop-orders/**`
- `src/components/workshop-orders/**`
- `supabase/functions/wos-p7-verify-image/**`
- WOS unit, SQL and browser tests
- `docs/workshop-order-system/**`
- Additional WOS entries in shared navigation files

## Shared Paths

These five paths require separate review and cannot be added to PR #269:

- `src/app/workspace-home/page.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/lib/constants/navigation.ts`
- `src/middleware.ts`
- `tsconfig.json`

Shared path summary:

- `workspace-home`, Sidebar and navigation add the Workshop portal entry.
- Middleware skips duplicate WOS API auth resolution because each WOS API route
  performs its own trusted identity and organization check.
- `tsconfig` excludes Deno Edge source from the Next TypeScript project.

## Required Legal Sequence

1. Issue #104's existing `WOS-P2-M2-PROOF-LOCK-001` completes its review/CI/
   completion-contract path.
2. If PR #269 is accepted, it is handled under its own exact-head decision. It
   is not force-merged or used as the RC integration vehicle.
3. The six-file task reaches a terminal state or is explicitly superseded by an
   Owner/PM control action.
4. Re-read live master, registry/concurrency state and Issue #104 machine JSON.
5. Register a new bounded task such as
   `WOS-V1-RC-INTEGRATION-001`.
6. Use a new branch, `codex/wos-v1-rc-integration-<master-prefix>`, from the
   then-current master.
7. Upload `RC_ALLOWED_PATHS.json` as the exact allowed-path set after PM review.
8. Copy the RC commits/patch without rewriting master or existing PRs.
9. Run exact-head typecheck, WOS suite, Next build, secret audit and smoke.
10. Open one Draft PR for the new task; do not create a concurrent second active
    PR under Issue #104.

## Branch And Patch

Recommended new branch:

```text
codex/wos-v1-rc-integration-<current-master-prefix>
```

Recommended commit preservation:

```text
7cb3256 feat(wos): integrate local V1 office and workshop workflow
806b2c2 docs(wos): record local integration evidence
b6b9b09 feat(wos): complete local Supabase E2E
<delivery> docs(wos): add RC review and QA installation package
```

The final Git bundle preserves all parent relationships. Do not squash or rebase
the local evidence history unless the new task explicitly authorizes a different
provenance model.

## Conflict And Overlap Review

- PR #269 M2 SQL and security docs are already byte-identical to the RC source.
- PR #269 handoff evaluator/tests are byte-identical.
- PR #269 aggregate suite lacks the extra RC test imports; the RC version is an
  intentional superset.
- PRs #263/#265/#267/#268 remain passive stacked sources and are not moved.
- No `.github/workflows/**` file is part of the RC relative-to-master diff.
- No Supabase migration is part of the RC diff.

## What Must Wait

- Push of the RC branch: WAIT for a new authorized task.
- Creation of a new PR: WAIT for a new authorized task.
- Any update to PR #269 outside its six files: PROHIBITED.
- Issue #104 machine-state edit: not performed.
- Merge or force-push: PROHIBITED.
- Vercel deployment: separate authorization required.
- QA SQL install: separate authorization required.

## Exact File Allowlist

The authoritative machine-readable list is:

```text
RC_ALLOWED_PATHS.json
```

The full human-readable status list is:

```text
RC_FILE_DIFF.tsv
```

No remote branch or PR was created during this preparation.
