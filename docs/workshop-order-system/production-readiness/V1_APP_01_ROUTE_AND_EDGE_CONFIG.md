# WOS V1-APP-01 Route and Edge Configuration

Status: source-only delivery. No Production environment or database change is
authorized by this document.

## Next.js production app

Both settings are server-only and default OFF:

```ini
WOS_V1_APP_ENABLED=false
WOS_V1_APP_WRITES_ENABLED=false
```

The API also requires:

```ini
VERCEL_ENV=production
AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://amqpvxrurenevniilhtl.supabase.co
```

Reads require all four conditions plus `WOS_V1_APP_ENABLED=true`. Writes add a
second independent `WOS_V1_APP_WRITES_ENABLED=true` condition.

The app flag is not a substitute for database authorization. The reviewed
business RPC EXECUTE grants and the Edge write flag remain an independent,
authoritative release gate. They must remain OFF/revoked unless the same
approved release window explicitly turns them on.

Storage upload is a third write surface. Outside an approved write window the
database operator must keep `wos_p8_private_insert`/private-bucket INSERT
authorization revoked (or use an exact-SQL Storage gate in the same release
window). Existing DRAFTs must be inventoried and their orphan objects included
in cleanup/quota review before the next write window.

The client cannot select QA or Production by query parameter, header or public
flag. QA and foreign Supabase project URLs fail closed in the Production route.

## Isolated Hosted QA adapter

The QA adapter is a separate route and is default OFF:

```text
GET|POST /api/workshop-orders/v1-qa
```

It reuses the same handler, schemas, identity resolution, organization/role
checks, RPC contracts and read models as the Production route. It is enabled
only when all of these exact server-side conditions match:

```ini
VERCEL_ENV=preview
AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://xulmpqaknlwqqculbsek.supabase.co
WOS_V1_QA_APP_ENABLED=true
WOS_V1_QA_APP_WRITES_ENABLED=false
```

The public path selector
`NEXT_PUBLIC_WOS_V1_QA_PREVIEW=true` only lets the browser choose the QA route.
It does not authorize the route: a Production runtime, Production Supabase
project, missing server flag or wrong auth mode still fails closed. The QA
route rejects the Production project, and the Production route rejects the QA
project. Request headers, cookies, URLs and database values cannot switch the
selected adapter.

The adapter is wired into the normal Office and Workshop V1 pages. QA source
currently forces `writesEnabled=false` even if an environment flag is set.
Hosted QA writes must remain blocked until a separate order-scoped QA
business-RPC database Gate is designed, installed and reviewed. The future gate
must also stop direct PostgREST RPC calls from bypassing the Next.js route.
`canStart=false` remains immutable.

## Project-neutral Edge function

Function name: `wos-v1-verify-image`

Deployment-specific allowlist:

```ini
WOS_SUPABASE_ALLOWED_REFS=amqpvxrurenevniilhtl
WOS_V1_EDGE_ALLOWED_ORIGINS=https://www.hongdaprinting.tech
WOS_V1_EDGE_WRITES_ENABLED=false
```

For an isolated QA deployment the value must be changed to only the approved QA
project ref. The function reads the actual `SUPABASE_URL` and requires its
project ref to appear in this allowlist.

The function also requires every browser Origin to exactly match an HTTPS entry
in `WOS_V1_EDGE_ALLOWED_ORIGINS`. It implements an explicit OPTIONS preflight,
allows only `POST, OPTIONS`, and echoes only an approved Origin. Server calls
without an Origin remain supported.

The browser never receives the service-role secret. The caller JWT performs
profile/order checks and the private Storage download. The service credential is
limited to three reviewed database calls:

```text
wos_p7_service_storage_snapshot
wos_v1_renew_expired_image_proof
wos_p7_record_trusted_image_proof
```

The function rejects non-PNG content, incorrect SHA-256, stale/invalid order
versions, cross-organization access, object replacement and snapshot drift.
Expired Proofs can only be renewed when the full immutable proof identity still
matches; renewal is a source draft in
`sql/V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql` and is not installed here.

## API operations

`GET /api/workshop-orders/v1`

```text
?view=inbox
?view=office
?view=returned
?view=office&orderId=<uuid>
```

`POST /api/workshop-orders/v1`

```text
CREATE_ORDER
REGISTER_IMAGE
CONFIRM_OFFICE
SUBMIT_ORDER
OPERATOR_ACTION
SAVE_CORRECTION
RESUBMIT_ORDER
REVIEW_CORRECTION
```

All POSTs require same-origin validation, JSON content type, bounded request
size and header `x-wos-v1-action: 1`.

## Explicitly not established

- Production or QA environment flag changes
- SQL installation
- hosted Edge deployment
- real Hosted Storage byte E2E
- Production browser acceptance
- merge or release approval
