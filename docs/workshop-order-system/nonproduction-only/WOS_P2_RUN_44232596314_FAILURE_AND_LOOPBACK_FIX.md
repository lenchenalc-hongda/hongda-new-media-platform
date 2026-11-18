# WOS P2 QA first protected browser run — root-cause finding and safety closeout

**Observed live run:** [GitHub Actions #44232596314](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44232596314), exact protected master `82ae36421a727417606a559bf1588f117930ee48`, business PR #241 pinned `89bb408d13e45458c608db29c47e2803d49b3170`.

**Result: FAIL.** The `protected-source-gate`, setup, and local Preview build jobs passed; `real-qa-browser` failed at `CREATE_SYNTHETIC_ORDER`, class `TIMEOUT`. The UI never produced the expected submit HTTP response, and Supabase QA database counts remained 83 orders / 81 P1 Inbox / 81 P1 receipts / 7 P2 action receipts / 0 Office revisions / 0 Operator review receipts.

## Definite source-level host mismatch

- The trusted Playwright harness at old master used `const origin='http://127.0.0.1:3000'`.
- The actual business QA component at PR #241 exact HEAD explicitly permits:
  `window.location.hostname.endsWith('.vercel.app')`, or `window.location.hostname === 'localhost'` **with** `NEXT_PUBLIC_WOS_QA_LOCAL_TEST === 'true'`.
- Consequently, navigating to `127.0.0.1` cannot pass `guard()` and can raise the fixed error `QA_ENVIRONMENT_NOT_PINNED` before any HTTP submit is attempted.
- The old harness waited 110 seconds for `POST /api/workshop-orders/production` without observing the UI `role=alert`, so it hid the client-side rejection and reported only `TIMEOUT`.
- This is a source-backed mismatch and a sufficient blocking cause; the protected run did not print the UI alert itself. Do not claim a browser-observed error code or successful authentication beyond what the Run steps prove.

## QA-only fix (not merged, not rerun)

- Test harness now navigates to `http://localhost:3000`, with Chromium resolving `localhost` to the **same** `127.0.0.1` loopback to preserve the private local Preview.
- Split the Office upload stage into explicit deterministic progress names and detect a visible allowlisted `role=alert` or missing HTTP response, instead of waiting 110 seconds silently.
- Introduce no new database permissions, no Production auth bypass, no change to pinned business PR #241, and no client-side loosening of its trusted QA hostname.
- Add a secretless QA source-regression workflow. A new protected master integration requires separate review and SHA-bound authorization; running a second real E2E requires a **new** independent 15-minute QA write authorization.

## Evidence of safe closure

- During run, QA Operator and Office gates were authorized in a single CAS transaction at UTC 2026-11-18 04:39:49 with expiry 04:54:49, solely for the approved E2E.
- GitHub's `if:always()` QA Admin close-only RPC succeeded at **04:41:09 UTC**, and both gates were restored to `enabled=false`, `enabled_until=NULL`, `approval_reference='NOT_AUTHORIZED'`. One `FAIL` close receipt was persisted under the exact GitHub Run ID; this is stronger than relying on expiry-only Cron.
- An independent DBA read-back and repeat fail-close executed at 04:41:34 UTC. Verified DB counts: 83 orders, 81 Inbox, 81 submit receipts, 7 P2 action receipts, 0 Office revisions, 0 review receipts, 88 status history entries. No Production operations or business PR merge.
- The existing QA watchdog remains active with 30-second cadence and recent successful executions.
