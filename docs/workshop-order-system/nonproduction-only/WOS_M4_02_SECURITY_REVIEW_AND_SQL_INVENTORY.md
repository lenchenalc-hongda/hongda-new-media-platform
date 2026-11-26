# WOS M4-02 Office-Only Fallback Security Inventory

Status:

`OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED / SOURCE_REVIEW_FIX_REQUIRED_P1 / QA_SQL_NOT_INSTALLED`

Issue: `#274`

PR: `#275`

Base master: `c3b63eaddafec8aaae8460b26e804cbb4bdd70ba`

Target if separately authorized:
`xulmpqaknlwqqculbsek` (`hongda-review-dev`)

## Superseded P0

The earlier design attempted to create M4 policies on `storage.objects`. QA
`postgres` does not own that table and cannot SET ROLE to
`supabase_storage_admin`, so no supported hosted executor was demonstrated.
That path is not part of this fallback.

Historical Storage-owner SQL files remain in Git for audit continuity but are
marked `HISTORICAL_SUPERSEDED`, contain no executable installation, and are not
run by the active PostgreSQL 17 suite.

## Decisive P1: Hosted Timestamp Precision

The new fallback was independently reviewed against pinned Storage server
source commit `c0d596a798f8b21a9a5808875e6bfcdc02ca54a7`:

- `InfoRenderer` returns `last_modified: obj.updated_at`.
- Storage pins `pg@8.23.1` and `pg-types@2.2.0`.
- Storage overrides INT8 only. `timestamptz` therefore uses the default
  JavaScript `Date` parser.
- JSON serialization truncates the timestamp to milliseconds.

Examples:

```text
database: 2026-11-22T09:59:00.123456Z
info():   2026-11-22T09:59:00.123Z
```

The required commitment is exact to six fractional digits. It therefore fails
for any object whose database timestamp has non-zero sub-millisecond digits.
This is deterministic fail-closed behavior, not an availability bug that can be
fixed by ignoring metadata drift. Rounding both sides to milliseconds would
change the approved proof standard and is not authorized.

Final decision:

`OFFICE_ONLY_INFEASIBLE_FAIL_CLOSED`

No installation or Preview request follows from this source.

## Review Corrections Retained

- Activation preflight pins the approved snapshot function SHA-256
  `22d0f4b09891414be8dfb7353b97bac95f259a450ed697ee8528631b595a9361`.
- Activation pins the private bridge SHA-256
  `c4bffcc159132f8018d22dcdfbf48b45421f92483b998db8e8a93ca2a689c887`.
- Activation requires the two existing P7 Storage RLS policies to remain
  present.
- Storage metadata parsing requires `archivedAt === null` and
  `isDeleteMarker === false`; missing fields fail closed.

## Existing Storage RLS

The fallback reuses:

- `wos_p7_private_object_select`
- `wos_p7_storage_reader_roles`

For matching same-organization WOS paths:

- Admin and Manager may SELECT regardless of order status.
- Operator may SELECT only while the order is `SUBMITTED`.
- Sales SELECT remains limited to the order creator/sales owner by the existing
  permissive policy.
- Viewer, cross-organization identities and anonymous callers are denied.

The verifier route itself is stricter than Storage: only same-organization
Admin/Manager are admitted, and only for `READINESS_CHECK`. No policy or RLS
statement is included in the active forward or rollback files.

## Active SQL Files

1. `WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_NOT_INSTALLED.sql`
   - Forward phase 1.
2. `WOS_M4_02_READONLY_PROOF_VERIFIER_ACTIVATION_NOT_INSTALLED.sql`
   - Forward phase 2; first point that grants authenticated EXECUTE.
3. `WOS_M4_02_READONLY_PROOF_VERIFIER_DEACTIVATE_NOT_INSTALLED.sql`
   - Rollback phase 1; closes authenticated EXECUTE.
4. `WOS_M4_02_READONLY_PROOF_VERIFIER_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql`
   - Rollback phase 2; drops only fallback DB objects.

Every file begins with `INSTALL_NOT_AUTHORIZED`.

## Current Artifact Fingerprints

These values are the current source draft only. They must be recalculated and
re-authorized after any later edit.

| Artifact | Raw SHA-256 | Git Blob SHA |
| --- | --- | --- |
| Forward phase 1 | `e45c4ec637fb1121c9cdc13d29531a2abe75048983cb69cad00842659fda163d` | `ad0fd52eaddd3bc5f739ea0a7ad2facb5851c19e` |
| Forward phase 2 | `2d04faa8e802ca33a4311d4b73d01a0618c8cf90e0b9ca5a61c2067abb9c6997` | `b79a5234f4c5ee4527ff0eae0b83b8a239129f05` |
| Deactivate rollback | `a2f0d78d515e3033835d74b5563f66a30d7439004e060deccbd782c22e9c6d6a` | `fc4013abe2614894c741cd07e5cd68f0a7b21151` |
| Database rollback | `1a73fc8262feb871863db7bbd0ec36d90f97809dfdea6c1258a757aad5c10154` | `26869f46c7715355038d2d0130e71631d6605f1e` |

PG17 function/security inventory from the current draft:

| Item | SHA-256 |
| --- | --- |
| Snapshot function definition | `22d0f4b09891414be8dfb7353b97bac95f259a450ed697ee8528631b595a9361` |
| Private caller bridge | `c4bffcc159132f8018d22dcdfbf48b45421f92483b998db8e8a93ca2a689c887` |
| Combined function/role/policy inventory | `33028d0072e0d15fb7287a50daa5398a5b8b2da1951b3feacca481abef942815` |

## Created Objects

Forward phase 1 creates:

- NOLOGIN role `wos_m4_proof_verifier_owner`.
- `public.wos_qa_m4_current_user_id()` private caller-UID bridge, owned by the
  installer and executable only by the dedicated owner.
- `public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)`, owned by the
  dedicated owner.
- Seven owner-only SELECT policies on:
  `profiles`, `wos_production_orders`, `wos_visual_baselines`,
  `wos_visual_baseline_items`, `wos_reference_images`,
  `wos_qa_verified_image_proofs`, `wos_qa_p2_m2_receipts`.
- SELECT grants for the owner on those seven tables.
- EXECUTE for the owner on `wos_qa_p2_m2_spec_digest(uuid)` and the caller-UID
  bridge.

It creates no table, column, trigger or Storage policy.

Forward phase 2, after exact-SQL approval, grants EXECUTE on only:

- `public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)` to
  `authenticated`.

It does not expose the caller bridge, direct Proof/Receipt table access,
`service_role`, M2 writers or any Storage policy.

## Permission Contract

- Installer: `CREATEROLE`, `BYPASSRLS`, owns the seven public business tables,
  has `CREATE` on `public`, has `USAGE` on `auth`, and has no SELECT on
  `storage.objects`.
- Dedicated owner: NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
  NOREPLICATION, NOBYPASSRLS, no role memberships, no `CREATE` on `public`, no
  `USAGE` on `auth`, no `USAGE` on `storage`, no Storage privileges.
- `authenticated`: no direct SELECT on the Proof or Receipt tables and no M2
  EXECUTE.
- `anon`: no RPC EXECUTE.
- PUBLIC: no snapshot or bridge EXECUTE.

The temporary owner-membership used for function ownership/activation is
checked for `ADMIN TRUE, INHERIT FALSE, SET FALSE`, then `SET` is removed and
the final state is verified.

## Function Security

The snapshot returns only a safe JSON DTO. It derives actor identity from the
private bridge over the real `auth.uid()`, not from request parameters. It
accepts no organization or role ID, uses fully qualified objects, disables
dynamic SQL, serializes with the reviewed M2 order lock and uses fixed
`search_path=''`.

The DTO intentionally includes a per-image irreversible commitment:

```text
sha256(
  "wos-m4-storage-object-v1\n" ||
  "bucket=wos-private\n" ||
  "path=<path>\n" ||
  "id=<lowercase uuid>\n" ||
  "version=<version>\n" ||
  "lastModified=<UTC YYYY-MM-DDTHH:MM:SS.ffffffZ>\n"
)
```

It does not expose the inputs `path`, object ID or object timestamp.

## Storage API Evidence

The repository uses `@supabase/supabase-js 2.110.0`, which pins
`@supabase/storage-js 2.110.0`.

The unit test executes the actual SDK with a custom fetch boundary and proves:

- `storage.from(bucket).info(path)` calls
  `GET /storage/v1/object/info/<bucket>/<path>`.
- The SDK maps `id`, `version`, `last_modified` and `bucket_id` to `id`,
  `version`, `lastModified` and `bucketId`.
- `download(path)` with no transform calls
  `GET /storage/v1/object/<bucket>/<path>`.
- The downloaded Blob bytes are the raw response bytes.
- The synthetic caller Authorization header is preserved on both requests.
- No `render/image/authenticated` request is made.

This proves the pinned browser SDK contract and request behavior. It also shows
that the SDK itself does not repair server-side timestamp precision. Independent
Storage server source review above proves `timestamptz` is serialized through a
millisecond JavaScript Date, which is the decisive P1.

## PostgreSQL 17 Offline Evidence

The disposable PG17 suite covers:

- Manager and Admin order-scoped snapshot success.
- Existing P7 Storage RLS: Manager/Admin can read at `READINESS_CHECK`;
  Operator cannot.
- Viewer, Sales, anonymous, unknown Profile and cross-organization denial.
- Missing, inactive and ambiguous Profile denial.
- Fourth/fifth image, duplicate category, missing category, duplicate image ID
  and duplicate CURRENT baseline denial.
- Missing/duplicate/out-of-order receipt denial.
- Same Office/Workshop signer and inactive signer denial.
- Proof expiry during call, null object version, Proof SHA/digest mismatch and
  order-version drift denial.
- Exact SQL object-commitment formula comparison.
- Direct authenticated RPC invocation with no dependency on the Next.js switch.
- Function owner, `SECURITY DEFINER`, `search_path`, schema/table/function ACLs
  and absence of Storage object/schema privileges.
- Deactivation before object cleanup.
- Full rollback with row counts, content hashes, ACL hashes, policy inventory,
  role/function catalog and Storage-policy inventory restored.

Server unit tests additionally cover:

- `info()` object ID mismatch.
- `info()` version mismatch.
- one-microsecond timestamp mismatch and non-ISO timestamp failure.
- object size mismatch.
- object replacement between pre-download and post-download `info()`.
- raw byte SHA mismatch.
- database snapshot drift and proof expiry during downloads.
- malformed object commitment.

## Residual Risks

- Hosted `info()` cannot preserve the required six-digit microsecond timestamp
  through its current `Date`/JSON serialization path.
- Current historical QA Proofs are expired; a verification success cannot be
  claimed without fresh evidence or a separately authorized new QA order.
- Rounding both database and Storage values to milliseconds would change the
  approved standard and is not authorized.
- The route's 15-second deadline checks aborts around Storage calls; the SDK
  `info()` method does not accept an AbortSignal. A timed-out call returns
  fail-closed and writes no verification state.
- No path in this source task installs SQL, changes RLS/Storage/Secrets, opens a
  Gate, writes business data, deploys Production or merges the PR.

## Next Gate

`STOP_OR_REDESIGN_EXACT_OBJECT_METADATA_READ`

This fallback must not be installed or deployed. The next WOS decision is a new
business task or a separately authorized exact-metadata read architecture.
