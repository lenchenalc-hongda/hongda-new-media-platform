# WOS V1 Production Proof Lifecycle Evidence

Date: 2026-11-28

Status:
`LOCAL_SOURCE_AND_PG17_VERIFIED / REMOTE_QA_UAT_NOT_AUTHORIZED`

## Scope

This evidence closes the launch-critical gap where a ten-minute Proof TTL could
interrupt the normal multi-hour or multi-day WOS material and signoff workflow.
It does not authorize Production changes, remote QA writes, a PR merge, or an
automatic machine start.

## Implemented Contract

- Production current-order re-verification is allowed only for active,
  same-organization users with `admin`, `manager`, or the owning `sales` role.
- `WAITING_MATERIAL` and `READINESS_CHECK` re-verification requires version
  `V2+`, exactly four current READY images, no superseded current image, and
  membership in the current Baseline when a Baseline exists.
- Storage evidence is bound to bucket, path, object ID, object version, object
  update time, PNG MIME type, bounded size, and the byte SHA-256 verified by the
  Edge from the actual private object.
- The Edge reads the private object bytes, verifies PNG structure and SHA-256,
  compares two Storage object snapshots, and only then requests renewal or
  creation of the Proof.
- `RENEWED` and `UNCHANGED` responses do not invoke the Proof writer again.
- Signoff digests exclude volatile `verifiedAt` and `expiresAt`. They retain
  image ID, category, version label, bucket, path, object ID, object version,
  object update time, and verified byte SHA-256.
- A Proof update that changes only verification or expiry time does not clear
  Office or Workshop signatures.
- A real image, object, version-label, or SHA change still invalidates the
  affected Baseline signatures and rolls the order back to
  `WAITING_MATERIAL`.
- Manager release ends at `READY_TO_START` with `productionStarted=false` and
  `canStart=false`. No automatic production start path was added.

## Local Verification

The following checks passed on the final working source:

```ini
WOS_V1_PRODUCTION_PROOF_LIFECYCLE_PG17=PASS
WOS_V1_PROOF_RENEWAL_TEN_MINUTE_BOUNDARY=PASS
WOS_V1_PROOF_RENEWAL_TWENTY_FOUR_HOUR_BOUNDARY=PASS
WOS_V1_PROOF_RENEWAL_PRESERVES_SIGNOFFS=PASS
WOS_V1_PROOF_CONTENT_CHANGE_INVALIDATES=PASS
WOS_V1_PROOF_LIFECYCLE_DATA_RETAINING_RECOVERY=PASS

WOS_V1_PG17_SCHEMA_BOOTSTRAP=PASS
WOS_V1_PG17_BOOTSTRAP_ATOMIC_FAILURE=PASS
WOS_V1_PG17_HISTORICAL_LINEAGE_REPLAY=PASS
WOS_V1_PG17_PUBLIC_AND_COMMERCIAL_SCHEMA_PARITY=PASS
WOS_V1_PG17_WOS_RUNTIME_LIFECYCLE=PASS
WOS_V1_PG17_RPC_ACL_ACTIVATION_AND_DEACTIVATION=PASS
WOS_V1_PG17_RUNTIME_ROLLBACK_TO_P7_EXACT=PASS
WOS_V1_PG17_RUNTIME_ROLLBACK_WITH_DATA_REJECTED=PASS
WOS_V1_PG17_CONCURRENT_VERSION_CAS=PASS
WOS_V1_PG17_DUPLICATE_INSTALL_REJECTED=PASS
WOS_V1_PG17_FULL_ROLLBACK_PARITY=PASS
WOS_V1_PG17_CPC_GLH_COMMERCIAL_NO_DRIFT=PASS

WOS_V1_EDGE_ENTRY_HTTP_DENO_HARNESS=PASS
WOS_V1_PRODUCTION_PROOF_REFRESH_HTTP=PASS
WOS_V1_PRODUCTION_PROOF_RENEWAL_SKIPS_WRITER=PASS
WOS_V1_QA_CURRENT_ORDER_PROOF_HTTP=PASS
WOS_V1_QA_CURRENT_ORDER_NON_UPLOADER_REVIEW=PASS
WOS_V1_QA_CURRENT_ORDER_RENEWAL_SKIPS_WRITER=PASS
WOS_V1_QA_UAT_EDGE_RENEWAL_NON_UPLOADER_PG17=PASS
WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_INSTALL=PASS
WOS_V1_QA_UAT_PROOF_MIRROR_SYNC=PASS
WOS_V1_PRODUCTION_M2_QA_UAT_FULL_FLOW=PASS
WOS_V1_PRODUCTION_M2_QA_UAT_INVALIDATION=PASS
WOS_V1_PRODUCTION_M2_QA_UAT_DATA_RETAINING_RECOVERY=PASS
```

The WOS Suite, TypeScript typecheck, and Next.js production build also passed.

## Negative Matrix

The PG17 lifecycle test rejects:

- cross-organization renewal;
- non-current, superseded, missing, or wrong-version images;
- changed Storage object IDs, versions, update times, or SHA-256 values;
- altered or missing current Baseline membership;
- Viewer and unauthorized-role M2 actions;
- duplicate Office/Workshop signers;
- stale versions and concurrent CAS conflicts;
- M2 actions after the scoped write Gate is closed.

The real Deno HTTP harness rejects wrong or missing Authorization headers,
wrong projects, missing Gates, unavailable Gates, expired Gates, stale
heartbeats, closed Gates, object instability, PNG/SHA mismatch, and writes
when the Edge write switch is false.

## Evidence Sources

- `docs/workshop-order-system/production-readiness/sql/V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql`
- `supabase/migrations/20261126090000_wos_v1_production_m2_signoff.sql`
- `supabase/functions/wos-v1-verify-image/core.ts`
- `supabase/functions/wos-v1-verify-image/index.ts`
- `tests/sql/run-wos-v1-production-proof-lifecycle-pg17.sh`
- `tests/sql/wos-v1-production-proof-lifecycle-pg17.sql`
- `tests/integration/wos-v1-qa-edge-entry-http.deno.test.ts`
- `scripts/wos-production-readiness/run-pg17-rehearsal.sh`

## Safety State

```ini
PRODUCTION_CHANGED=NO
PR281_MERGED=NO
PR283_MERGED=NO
REMOTE_QA_SQL_INSTALLED=NO
REMOTE_QA_GATE_OPENED=NO
REMOTE_QA_BUSINESS_WRITE=NO
CAN_START=false
```
