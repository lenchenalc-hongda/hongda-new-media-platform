# WOS V1-APP-01 Implementation Report

Project: `WOS_V1_APP_01_PRODUCTION_NEUTRAL`

Base: PR #276 / `b1937311fc3281439939c43bc5abcdd699f608bc`

## Delivered source

### Production HTTP app

- `GET /api/workshop-orders/v1`
  - Operator Inbox list/detail
  - Office active/returned list/detail
- `POST /api/workshop-orders/v1`
  - `CREATE_ORDER`
  - `REGISTER_IMAGE`
  - `CONFIRM_OFFICE`
  - `SUBMIT_ORDER`
  - `OPERATOR_ACTION`
  - `SAVE_CORRECTION`
  - `RESUBMIT_ORDER`
  - `REVIEW_CORRECTION`

The server derives organization, Profile and role from the verified Supabase
session. Client owner/role/organization claims are rejected. Production reads
and writes are controlled by separate default-OFF server flags.

Office lists include DRAFT records, recover an interrupted DRAFT by exact order
number only after every submitted field matches, reuse already registered image
IDs, and paginate in 50-row pages. Detail responses recheck the current stock
version and both Office/Operator clients discard superseded responses.

### Office UI

- Existing production form now exposes a Production-only four-image workflow.
- Current files are uploaded to the private bucket only after the server app
  gate is enabled.
- Each upload is verified by the project-neutral Edge function before the
  reviewed image-registration RPC is called.
- Office orders list shows submitted/returned versions, legal DOCUMENT return
  reasons, current proof state and the six-field correction/resubmit controls.
- When the write flag is OFF, write controls are disabled and the API also
  independently returns `503`.

### Operator UI

- Existing Workshop Inbox page switches to the Production-neutral Inbox when
  the Production app read flag is enabled.
- Detail shows current version, legal return reasons, registered image states,
  resource readiness, CURRENT baseline count and `UNVERIFIED` private proof.
- Operator actions are limited to current-version ACCEPT, RETURN and
  REVIEW_CORRECTION.
- All responses retain `canStart=false`.

### Project-neutral Edge

Function source: `supabase/functions/wos-v1-verify-image`

- Requires `WOS_SUPABASE_ALLOWED_REFS`
- Requires default-OFF `WOS_V1_EDGE_WRITES_ENABLED=true`
- Uses the caller JWT for Auth, Profile, order and Storage download
- Requires the exact current DRAFT/NEEDS_INFORMATION version
- Accepts only four canonical PNG categories
- Parses PNG chunks, CRC, structure and bounded inflation
- Recomputes SHA-256 from downloaded bytes
- Requires non-empty exact Storage object version and exact updated time
- Verifies a stable first/second object snapshot
- Uses a service credential only for the reviewed snapshot and proof writer RPC
- Renews only a fully matching expired Proof through a separate reviewed,
  non-installed database source draft
- Returns no private path, object ID or raw proof record

The Storage INSERT policy is a third release surface. Outside the approved write
window its policy/INSERT authorization must be revoked, and retained DRAFTs and
orphan objects must be included in cleanup and quota review.

### Isolated Hosted QA adapter

- `GET|POST /api/workshop-orders/v1-qa`
- Reuses the Production handler, request schemas and business RPC contracts
- Requires Preview, Supabase auth and the exact QA project ref
- Requires separate default-OFF server read/write flags
- Rejects Production in the QA route and QA in the Production route
- Cannot be selected through headers, cookies, URL parameters or client claims
- Keeps `canStart=false` in every response

The browser path selector is build configuration only. The server-side adapter
remains authoritative and default-deny.

## Verified locally

```text
pnpm typecheck
  PASS

WOS Suite
  PASS

Next.js production build
  PASS

Secret Audit
  PASS

HTTP end-to-end simulation
  PASS

HTTP lost-response and idempotent retry
  PASS

HTTP version conflict and role denial
  PASS

Edge PNG / SHA-256 / object stability
  PASS

Direct registration without trusted Proof
  DENIED

Expired matching Proof renewal / rollback
  PASS

Split-delivery unsupported path
  DENIED

PG17 schema, runtime, ACL, rollback and CPC/GLH/commercial no-drift
  PASS

Hosted QA three-function dependency install / rollback / browser denial
  PASS (offline PG17)
```

The HTTP test uses the real handler over a local Node HTTP server and an
isolated in-memory transaction adapter. PG17 separately validates the reviewed
SQL transaction, RLS, ACL and rollback semantics.

## Not established

- Database installation
- Hosted Edge deployment
- Real hosted Storage byte download
- Hosted QA SQL installation
- Bounded Hosted QA Office/Operator write E2E
- Production employee accounts or role provisioning
- Production browser acceptance
- Production feature flag activation
- Merge or release approval

The dependency PR uses a non-master base, while the existing CI pull-request
trigger only observes `master` and `main`. No shared workflow may be modified
under this task, so source CI for this dependency PR is recorded as unavailable
rather than claimed as PASS.
