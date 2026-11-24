# Read-Only Edge Dependencies

Status: source review evidence, not an installation authorization

## Storage Snapshot RPC

The read-only Edge function depends on:

```text
public.wos_p7_service_storage_snapshot(p_path text)
```

Reviewed source at PR #277 base `8c8570f72e28c25e66eefebc42c919e9cd3c0694`:

```text
tests/sql/wos_p8_p7_production_compatible_candidate.sql
Git blob 5cb156bb4f9557f1b1a24553e9c3f48a3492b13d
```

The function:

- is `SECURITY DEFINER`;
- has `search_path=''`;
- accepts at most 600 characters;
- requires a canonical `organizations/.../wos/production-order/.../images/...` path;
- queries only `storage.objects`;
- requires `bucket_id='wos-private'`;
- matches the exact requested object path;
- excludes delete markers and archived objects;
- returns only object ID, owner ID, version, update time, MIME type and byte size;
- performs no insert, update, delete, Storage mutation or business write.

Live QA ACL verification:

```ini
SECURITY_DEFINER=true
OWNER=postgres
SEARCH_PATH=
PUBLIC_EXECUTE=false
ANON_EXECUTE=false
AUTHENTICATED_EXECUTE=false
SERVICE_ROLE_EXECUTE=true
```

The Edge function calls this RPC only through its trusted client after the
caller JWT has been verified and the active same-organization Profile, order,
version and image category/path have been checked. The browser never receives
the RPC result.

## Proof Table

The trusted client also selects one exact row from:

```text
public.wos_qa_verified_image_proofs
```

The query is bounded by exact image, order and organization IDs. It must return
exactly one row. Fields are used only for server-side comparison and are not
returned to the browser.

## Origin Limitation

The allowlisted `Origin` header is a browser CORS boundary, not proof that a
request originated in a browser. A valid JWT caller can forge that header.
Authentication and authorization therefore remain anchored in the user JWT,
active Profile, organization/order/version scope and caller-JWT Storage RLS.
A separate server-issued nonce would be required if anti-direct-invocation were
an additional security requirement.
