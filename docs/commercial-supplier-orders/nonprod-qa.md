# Commercial Supplier Orders Nonproduction QA

Task: `CSO-P2-NONPROD-E2E-001`

Base master: `578b3d67ea0b3c5f67bd10a902d89900577b231b`

Execution head: `dec9d59c81aab2366f3c5caf78cb565939a9f0d2`

Evidence date: 2026-11-01, Asia/Shanghai

## Current Result

The deterministic commercial-supplier-order checks pass. The isolated live E2E
suite is executable and fail-closed, but it was not run against a database on
this runner because no isolated Supabase credentials or authenticated QA
accounts were available. Live database, RLS and archived-snapshot behavior is
therefore `NOT_VERIFIED`; it is not reported as a simulated pass.

| Readiness area | Deterministic evidence | Live nonproduction evidence |
| --- | --- | --- |
| Draft creation and revision conflict | `PASS` contract assertions | `NOT_VERIFIED` |
| Immutable formal-order V1/V2 history | `PASS` contract assertions | `NOT_VERIFIED` |
| Exact 0.001 RMB calculation | `PASS` execution | `NOT_VERIFIED` |
| Cross-user RLS contract | `PASS` policy/source assertions | `NOT_VERIFIED` |
| Printable historical snapshot parity | `PASS` model/source assertions | `NOT_VERIFIED` |
| Server and client feature gates closed by default | `PASS` execution | Not applicable |

## Deterministic Coverage

`tests/unit/commercial-supplier-order-validation.test.ts` verifies:

- integer thousandth conversion and per-line HALF_UP rounding at 0.001 RMB;
- `0.003 x 1.5 = 0.005` and `1.005 x 1.001 = 1.006`, without binary
  floating-point conversion;
- draft creation stamps the authenticated owner and exposes revision 1;
- draft updates require `expectedRevision`, compare the stored revision, and
  return a visible 409 version conflict;
- formal saves use the append-only RPC, compare `latest_version`, increment
  exactly one version, and reject changed idempotency replays;
- the database migration carries immutable-version, trusted-amount,
  advisory-lock, unique-version, ownership and RLS constraints;
- the server feature flag defaults closed and remains closed on Vercel
  Production without separate approval;
- a V1 and V2 print model preserve every order and line field independently,
  use their own archived amounts, and feed the preview and printable section
  from the same frozen model.

The component workbench now formats integer thousandths directly. It no longer
converts the total through binary floating point before displaying or printing
the snapshot.

## Executable Live Harness

Run only against a disposable development or preview database:

```bash
node --import tsx tests/e2e/commercial-supplier-order-nonprod.spec.ts
```

The harness uses the repository live-test safety gate. It requires
`AUTH_MODE=supabase`, `ALLOW_LIVE_AUTH_TESTS=true`, an isolated
`SUPABASE_ENVIRONMENT` of `development` or `preview`, the three Supabase
connection variables, and admin/viewer QA account variables using the
`LIVE_TEST_*` names defined in `.env.example`. It does not print their values.

When setup is unavailable, the harness prints `LIVE_E2E: NOT_VERIFIED` and
leaves all setup-dependent rows `NOT_VERIFIED`. Once setup is available, it:

1. creates an owner-owned draft, advances revision 1 to 2, rejects a stale
   revision-1 write, and proves the stale write did not replace revision 2;
2. creates formal V1 and V2 through `save_supplier_order_version`, rejects a
   stale expected-version write and a changed idempotency replay, and verifies
   that only V1/V2 remain with their original snapshots and amounts;
3. proves a same-org viewer cannot read or write another user's draft, formal
   order, or version history and cannot invoke the formal-order RPC;
4. rebuilds printable V1/V2 output from the archived database snapshots and
   compares each version with its own fixture and exact thousandth total;
5. soft-deletes the synthetic active draft. Synthetic formal versions remain
   by design because archived versions are immutable.

The database must be disposable. The live harness intentionally cannot delete
formal versions after creation.

## Required Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Focused deterministic test | `PASS` | `commercial-supplier-order-validation.test.ts: PASS` |
| Typecheck | `PASS` | `tsc --noEmit` exited 0 |
| Build | `PASS` | metadata generation and Next.js production build exited 0 |
| Bundle secret audit | `PASS` | no configured secret patterns found in `.next/static` |
| Built-app HTTP smoke | `BLOCKED_BY_SANDBOX_LISTEN_EPERM` | `next start` was attempted on `0.0.0.0:3000` and `127.0.0.1:3000`; both were denied |
| Isolated live nonproduction E2E | `NOT_VERIFIED` | required live environment and authenticated QA accounts absent |

The build emitted the existing Edge Runtime warning for
`@supabase/supabase-js` using `process.version`, but compilation and type
validation completed successfully. The wrapper's independent check
environment is still responsible for the final HTTP smoke result.

## Sanitized Environment Evidence

Only presence was checked; no credential values were read into the report.

```text
AUTH_MODE=MISSING
NEXT_PUBLIC_SUPABASE_URL=MISSING
NEXT_PUBLIC_SUPABASE_ANON_KEY=MISSING
SUPABASE_SERVICE_ROLE_KEY=MISSING
ALLOW_LIVE_AUTH_TESTS=MISSING
SUPABASE_ENVIRONMENT=MISSING
LIVE_TEST_ADMIN_EMAIL=MISSING
LIVE_TEST_ADMIN_PASSWORD=MISSING
LIVE_TEST_VIEWER_EMAIL=MISSING
LIVE_TEST_VIEWER_PASSWORD=MISSING
FEATURE_SUPPLIER_ORDERS=MISSING
NEXT_PUBLIC_FEATURE_SUPPLIER_ORDERS=MISSING
SUPPLIER_ORDERS_PRODUCTION_APPROVED=MISSING
```

## Boundaries Preserved

This task did not change migrations, database RLS, Auth or Storage policies,
environment variables, secrets, Production data, official PDF archive
semantics, real supplier messaging, auto-merge, or Production rollout. Edits
are limited to the task-authorized paths and remain unstaged.
