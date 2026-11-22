#!/usr/bin/env bash
set -euo pipefail
# Ephemeral synthetic PostgreSQL 17 ONLY; no QA or production credentials.
test "$PGDATABASE" = "wos_p2_synthetic"
test "$WOS_P2_QA_MUTATIONS_ENABLED" = "false"
ORDER_ID="99999999-9999-4999-8999-999999999999"
REQUEST_ID="abababab-abab-4bab-8bab-abababababab"
# The prior test deliberately revokes the synthetic database gate. A separate
# ephemeral approval is required for this independent concurrency scenario.
psql -X -v ON_ERROR_STOP=1 -q -c "UPDATE public.wos_qa_p2_execution_gate SET enabled=true,enabled_until=pg_catalog.clock_timestamp()+INTERVAL '5 minutes',approval_reference='SYNTHETIC_CONCURRENCY_PG17_ONLY',updated_at=pg_catalog.clock_timestamp() WHERE gate_name='OPERATOR_WRITES'"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO public.wos_production_orders
 (id,organization_id,order_number,workflow_status,version,version_label,current_batch_quantity)
 VALUES ('99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'QA-NONPROD-P2-CONCURRENT','SUBMITTED',2,'V1',150);
INSERT INTO public.wos_submission_receipts
 (id,organization_id,order_id,source_revision,source_version_label)
 VALUES ('89898989-8989-4989-8989-898989898989','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '99999999-9999-4999-8999-999999999999',1,'V1');
INSERT INTO public.wos_workshop_inbox
 (id,organization_id,order_id,submission_id,source_revision,source_version_label,workflow_status)
 VALUES ('78787878-7878-4787-8787-787878787878','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '99999999-9999-4999-8999-999999999999','89898989-8989-4989-8989-898989898989',1,'V1','SUBMITTED');
SQL
first="$(mktemp)"
second="$(mktemp)"
trap 'rm -f "$first" "$second"' EXIT
# Connection 1 holds the order advisory lock while the second transaction
# starts; only one APPLIED result and one REPLAYED result may be produced.
(
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(
 pg_catalog.hashtextextended('wos-qa-p2:99999999-9999-4999-8999-999999999999',0));
SELECT public.wos_qa_p2_operator_action(
 '99999999-9999-4999-8999-999999999999',2,
 'abababab-abab-4bab-8bab-abababababab',
 'ACCEPT',NULL,NULL,NULL,NULL,
 'concurrent same-owner synthetic task acceptance');
SELECT pg_catalog.pg_sleep(1);
COMMIT;
SQL
) >"$first" 2>&1 &
p1=$!
sleep 0.2
(
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
SELECT public.wos_qa_p2_operator_action(
 '99999999-9999-4999-8999-999999999999',2,
 'abababab-abab-4bab-8bab-abababababab',
 'ACCEPT',NULL,NULL,NULL,NULL,
 'concurrent same-owner synthetic task acceptance');
SQL
) >"$second" 2>&1 &
p2=$!
wait "$p1" || { cat "$first"; exit 1; }
wait "$p2" || { cat "$second"; exit 1; }
grep -q '"status": "APPLIED"' "$first"
grep -q '"status": "REPLAYED"' "$second"
count="$(psql -X -v ON_ERROR_STOP=1 -qAt -c "SELECT count(*) FROM public.wos_qa_p2_action_receipts WHERE request_id='$REQUEST_ID'")"
history="$(psql -X -v ON_ERROR_STOP=1 -qAt -c "SELECT count(*) FROM public.wos_status_history WHERE entity_id='$ORDER_ID'")"
state="$(psql -X -v ON_ERROR_STOP=1 -qAt -c "SELECT workflow_status||':'||version FROM public.wos_production_orders WHERE id='$ORDER_ID'")"
task="$(psql -X -v ON_ERROR_STOP=1 -qAt -c "SELECT workflow_status FROM public.wos_workshop_inbox WHERE order_id='$ORDER_ID'")"
test "$count" = 1
test "$history" = 1
test "$state" = "WORKSHOP_REVIEW:3"
test "$task" = "SUBMITTED"
echo WOS_P2_PG17_TWO_SESSION_CAS_AND_IDEMPOTENT_REPLAY=PASS
echo WOS_P2_PG17_SINGLE_HISTORY_SINGLE_RECEIPT=PASS
psql -X -v ON_ERROR_STOP=1 -q -c "UPDATE public.wos_qa_p2_execution_gate SET enabled=false,enabled_until=NULL,approval_reference='NOT_AUTHORIZED',updated_at=pg_catalog.clock_timestamp() WHERE gate_name='OPERATOR_WRITES'"
echo WOS_P2_PG17_CONCURRENCY_GATE_REVOKED_AFTER_TEST=PASS
