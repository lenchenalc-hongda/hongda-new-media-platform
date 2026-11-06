# Commercial Supplier Orders Nonproduction QA

Task: `CSO-P2B-TRUSTED-TWO-SESSION-QA-GATE-001`

Base master: `7d4b373e26a8785e4b5f4aa9d197357681341125`

Expected execution head: `150f09525d150bba2ba57c98bc65ec76363fb9fe`

Evidence date: 2026-11-06, Asia/Shanghai

## Current Result

The deterministic checks, focused supplier-order test, typecheck, production
build and bundle secret audit pass. The live test gate closed because this
runner has no approved disposable QA credentials. The harness therefore took
its safe dry-run path, performed no database or Auth request, and returned a
successful `NOT_VERIFIED` result with every live acceptance matrix row still
`NOT_VERIFIED`.

The live contract has not been executed against the isolated QA project. It
must not be reported as a simulated pass.

| Live acceptance row | Current status |
| --- | --- |
| Two independent owner sign-ins plus a separate viewer | `NOT_VERIFIED` |
| Draft creation and revision conflict | `NOT_VERIFIED` |
| Concurrent `expectedVersion=2` writes produce one V3 and one conflict | `NOT_VERIFIED` |
| Winning request UUID replay returns V3 without V4 | `NOT_VERIFIED` |
| Immutable V1/V2 history remains unchanged | `NOT_VERIFIED` |
| Same-org viewer is denied by actual RLS and the RPC authorization gate | `NOT_VERIFIED` |
| Exact 0.001 RMB archived amount | `NOT_VERIFIED` |
| Archived V1/V2 printable snapshot parity | `NOT_VERIFIED` |

## Trusted Live Gate

The harness evaluates the gate before constructing a Supabase client or
issuing any database or Auth request. Every item below is mandatory:

| Input | Requirement |
| --- | --- |
| `LIVE_TEST` | Exact value `true` |
| `LIVE_TEST_ACKNOWLEDGE_IMMUTABLE_TEST_VERSIONS` | Exact value `true`; acknowledges that immutable synthetic formal versions may remain in a disposable TEST database |
| `NEXT_PUBLIC_SUPABASE_URL` | Exact HTTPS project URL `https://xulmpqaknlwqqculbsek.supabase.co`, with no alternate host, path, port, query or fragment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Present |
| `LIVE_TEST_EXPECTED_ORG_ID` | Valid expected organization UUID |
| `LIVE_TEST_ADMIN_EMAIL`, `LIVE_TEST_ADMIN_PASSWORD` | Genuine disposable admin Auth credentials |
| `LIVE_TEST_VIEWER_EMAIL`, `LIVE_TEST_VIEWER_PASSWORD` | Genuine separate disposable viewer Auth credentials |

The harness does not read or require `SUPABASE_SERVICE_ROLE_KEY`. It never
prints email addresses, passwords, bearer tokens, API keys or full Supabase
errors. It does not mint JWT claims, use SQL `SET ROLE`, or otherwise bypass
live Auth.

If any gate item is absent or invalid, the run emits structured
`CSO_NONPROD_E2E_RESULT` JSON with `mode=SAFE_DRY_RUN`, all live rows
`NOT_VERIFIED`, zero live checks and a successful process exit when the
deterministic checks pass. A missing credential is not treated as test
evidence.

## Authenticated Preflight

Before the first write, an allowed live run must complete all preflight checks:

1. Create three independent clients and perform three separate password
   sign-ins: two for the same admin/owner and one for a separate viewer.
2. Require all three returned session bearer tokens to be non-empty and
   mutually distinct.
3. Require both owner sign-ins to resolve to the same Auth user and the viewer
   to resolve to a different Auth user.
4. Read each caller's active profile through its own authenticated session.
5. Require both owner profiles to be identical, role `admin`, and in
   `LIVE_TEST_EXPECTED_ORG_ID`.
6. Require the viewer profile to be role `viewer`, active, and in the same
   expected organization.

An Auth, token, user or profile ambiguity returns `NOT_VERIFIED` without a
write. No test-only claims or role impersonation are accepted as substitutes.

## Live Acceptance Contract

After preflight succeeds, the harness:

1. Creates an owner draft, advances it from revision 1 to 2, rejects a stale
   revision-1 write, verifies revision 2 content is intact, and proves a
   same-org viewer cannot read, update or create owner drafts under actual RLS.
2. Creates and verifies a disposable formal fixture at V1 and V2 before the
   concurrency check. V1 is `0.001 x 1.000 = 0.001 RMB`; V2 is
   `1.005 x 1.001 = 1.006 RMB`.
3. Uses two independent owner sessions and two distinct request UUIDs to issue
   simultaneous `save_supplier_order_version` calls at `expectedVersion=2`.
   Exactly one call must return V3 and exactly one must return
   `VERSION_CONFLICT`; any other combination fails closed.
4. Replays the winning UUID with its exact V3 payload. The replay must return
   the same V3 row and `saved_at`, and history must remain exactly V1, V2 and
   V3 with no V4.
5. Verifies V1 and V2 request IDs, snapshots and integer thousandth amounts
   are unchanged. The order's `latest_version` must remain 3.
6. Verifies direct archived-version mutation is rejected. A same-org viewer
   must not read the formal order or history and must receive
   `NOT_AUTHORIZED` from the formal writer.
7. Rebuilds printable output from both archived snapshots and compares every
   frozen order and line field, each archived amount and the exact printable
   totals.
8. Soft-deletes the synthetic active draft. Formal versions intentionally
   cannot be deleted and may remain in the disposable TEST database.

Any unexpected, missing or contradictory result returns `FAIL` or
`NOT_VERIFIED`; it never returns `PASS`.

## Execution

Run the static/dry-run path without live credentials:

```bash
node --import tsx tests/e2e/commercial-supplier-order-nonprod.spec.ts
```

The command using `node_modules/tsx/dist/cli.mjs` is also supported in an
environment that permits the runner IPC socket. Live execution is allowed only
with credentials injected through the approved protected runner and all gate
inputs above. This task intentionally did not execute the live path.

## Required Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Typecheck | `PASS` | `tsc --noEmit` exited 0 |
| Focused deterministic test | `PASS` | `tests/unit/commercial-supplier-order-validation.test.ts` |
| Supplier-order safe dry-run | `PASS` | Four static checks passed; no client created; all eight live rows `NOT_VERIFIED`; exit 0 |
| Production build | `PASS` | Next.js 14.2.35 compiled and generated 128 static pages |
| Bundle secret audit | `PASS` | No configured secret patterns found in `.next/static` |
| Built-app HTTP smoke | `BLOCKED_BY_SANDBOX_LISTEN_EPERM` | `next start` was attempted on `0.0.0.0:3000` and `127.0.0.1:3000`; both listeners were denied |
| Live isolated nonproduction E2E | `NOT_VERIFIED` | No approved disposable QA credentials were injected |

The build emitted the existing Edge Runtime warning for
`@supabase/supabase-js` referencing `process.version`; compilation and type
validation completed successfully. The wrapper's independent check
environment remains responsible for its own smoke result.

## Sanitized Gate Evidence

Only presence and closed-gate reasons were observed. No credential value was
read into this report or printed by the harness.

```text
LIVE_TEST != true
immutable disposable-test-version acknowledgement missing
Supabase URL is not the exact isolated QA project
NEXT_PUBLIC_SUPABASE_ANON_KEY missing
LIVE_TEST_EXPECTED_ORG_ID missing or invalid
LIVE_TEST_ADMIN_* credentials missing
LIVE_TEST_VIEWER_* credentials missing
```

## Boundaries Preserved

This task did not change migrations, Production SQL/RLS, Auth or Storage
policies, environment variables, secrets, Production data, supplier order
workbench behavior, saved-draft logic, PDF/data semantics, external supplier
messaging, archived PDF state, auto-merge or Production rollout. Edits are
limited to the authorized test and documentation paths and remain unstaged.
