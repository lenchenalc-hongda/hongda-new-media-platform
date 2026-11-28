# WOS V1 QA UAT 009 Fail-Closed Record

Status:
`CONSUMED / FAIL_CLOSED / RECOVERED_WITH_RETAINED_DATA`

```ini
AUTHORIZATION_ID=WOS-V1-PRODUCTION-M2-QA-UAT-009
EXECUTION_ID=6ee17c06-fd16-46dc-9054-c9e5c5da139d
EDGE_PROCESS_NONCE=4bee8f3c-4ad5-4f85-80a5-29fe09235f9d
EXACT_HEAD=962e6797dca220b3ca2ef169fc4bd6f72fae99a7
EXACT_HEAD_CI=46101570089
CI_RESULT=SUCCESS
```

The one-use UAT-009 authorization was consumed. The DB closer armed and
produced a real heartbeat. The Edge closer failed before ARM with
`WOS_V1_QA_EDGE_OPEN_PROBE_EXCEPTION`. The business Gates were never opened
and no order was created or mutated.

The DB Gate was closed at `2026-11-28T03:23:39.650604Z`, before its
`2026-11-28T03:32:01.606812Z` cleanup deadline. The UAT-009 cron job was
removed. A direct closed-state probe first returned HTTP `503` with
`WOS_V1_QA_EDGE_CLOSED`; the Node `fetch` path used by the closer was then
identified as the unreliable component.

Recovery completed in this order:

1. QA Storage compatibility rollback.
2. QA application wrapper deactivation.
3. M2 deactivation and data-retaining rollback.
4. Edge write and read-only verification flags set to `false`.
5. Hosted write Edge restored from the reviewed v49 source and read-only Edge
   verified at v42 source-equivalent hashes.
6. `verify_jwt=true` revalidated.

Final retained state:

```ini
runtime_proofs=36
orphan_claims=0
create_receipts=6
operator_action_receipts=10
operator_review_receipts=4
office_revisions=9
HISTORICAL_DATA_SHA256=ee71ed883953449043dfaa0e788906454349902fec2af164f9d290a83555fca8
ORDER_ID=3ade0180-e6bf-49da-b80b-fd00cd1948a8
ORDER_VERSION=5
ORDER_LABEL=V2
ORDER_STATUS=NEEDS_INFORMATION
OPEN_WRITE_GATES=0
CRON_JOBS=0
STORAGE_COMPAT_SCHEMA=ABSENT
QA_WRAPPERS=ABSENT
AUTHENTICATED_BUSINESS_WRITES=false
LAUNCH_AGENT_LOADED=false
```

UAT-009 is not retryable. The subsequent UAT-010 source change disables
`~/.curlrc` with `curl -q`, uses stdin-only credential configuration, and
persists the selected QA Edge proxy into the unique LaunchAgent.
