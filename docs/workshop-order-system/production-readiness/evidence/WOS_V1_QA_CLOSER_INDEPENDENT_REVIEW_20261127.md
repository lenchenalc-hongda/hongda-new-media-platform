# WOS V1 QA Closer Independent Review

Reviewed source baseline:
`PR #283` working-tree changes after HEAD
`61db9cc8fb386aea47a81bd768a0ae61b5d7b3ed`.

Final verdict:

```ini
FINAL_SOURCE_REVIEW=PASS
P0_FINDINGS=0
P1_FINDINGS=0
P2_FINDINGS=0
```

Reviewer scope:

- Supabase Edge Admin key versus legacy closer JWT separation.
- `verify_jwt=true` trust assumptions and service-role claim checks.
- Actual `@supabase/supabase-js` Admin RPC behavior through a real local
  PostgREST endpoint.
- Closer probe `OPEN`, `STALE`, `NOT_ARMED`, `EXPIRED` and `CLOSED` behavior.
- Exact authorization, project, execution, nonce, code SHA and ARM token
  binding.
- `DB=PG_CRON` plus DB cleanup deadline and `EDGE=LAUNCHD` plus Edge cleanup
  deadline receipt pairing.
- Closer-only isolation from Production M2 and authenticated business wrappers.
- Closed Gate denial, concurrent close idempotency and data-retaining Recovery.
- Test-to-implementation consistency and secret leakage.

Independent local evidence:

```ini
TYPECHECK=PASS
WOS_FULL_SUITE=PASS
DENO_REAL_SUPABASE_CLIENT_HTTP_HARNESS=PASS
PG17_CLOSER_ONLY=PASS
PG17_PRODUCTION_M2=PASS
PG17_PRODUCTION_M2_CONCURRENCY=PASS
PG17_QA_UAT_FULL_FLOW=PASS
PG17_QA_UAT_DATA_RETAINING_RECOVERY=PASS
NEXT_BUILD=PASS
SECRET_BUNDLE_AUDIT=PASS
```

Review findings fixed before final approval:

1. Authorization cutover to `WOS-V1-PRODUCTION-M2-QA-UAT-002` was completed in
   application, SQL, runners, fixtures and tests.
2. The full-M2 closed-edge probe path was confirmed SELECT-only and covered by
   PG17.
3. All write/status/probe receipt predicates now require exact code SHA, ARM
   token, write deadline, executor pairing and cleanup deadline.
4. The Owner Gate ARM token Keychain service was aligned to
   `WOS_V1_QA_DB_CLOSER_ARM_TOKEN`.
5. The Deno harness was pinned to `deno@2.9.6`.

## Remote Fail-Closed Re-review

The first remote attempt on `c20728f` stopped before ARM because the reserved
Supabase project secret `SUPABASE_SERVICE_ROLE_KEY` did not equal the current
legacy API key and cannot be overwritten. Recovery restored Hosted v36 bytes,
removed temporary public RPCs and left no control, Cron or LaunchAgent.

The replacement source adds a dedicated non-reserved
`WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY` precedence for closer probe equality,
retains the reserved value only as a compatibility fallback, and advances the
active authorization to `...-003`.

The independent reviewer also identified and rechecked:

1. A preserved closer table created with the old `...-002` CHECK had to migrate
   to an audit-preserving `WOS-V1-PRODUCTION-M2-QA-UAT-%` table constraint.
2. Function entry points still require the exact current `...-003`;
   the table-level pattern cannot activate an old authorization.
3. Constraint discovery targets only the single `authorization_id` column.
4. PG17 seeds and preserves a closed historical `...-002` row plus close
   receipts through install, current ARM, close and Recovery.

Final remote-fix review:

```ini
P0_FINDINGS=0
P1_FINDINGS=0
P2_FINDINGS=0
SOURCE_SECURITY_REVIEW=PASS
MIGRATION_SAFETY=PASS
HISTORICAL_AUDIT_PRESERVATION=PASS
AUTHORIZATION_PATTERN_SECURITY=PASS
DEDICATED_EDGE_SECRET_REQUIRED=PASS
```

This review is independent source evidence. It is not Owner approval, a remote
ARM result, a Hosted timer proof or permission to merge/deploy Production.
