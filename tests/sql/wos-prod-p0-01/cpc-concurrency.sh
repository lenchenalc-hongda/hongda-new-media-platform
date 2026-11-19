#!/usr/bin/env bash
# Runs only inside the disposable CI postgres:17.11 service.
set -euo pipefail
db="${1:-wos_p0_contract}"
psql -v ON_ERROR_STOP=1 -d "$db" <<'SQL' >/dev/null
INSERT INTO public.cpc_projects(id,org_id,customer_reference_id,title,owner_profile_id,status)
VALUES ('42222222-0000-4000-8000-000000000001',
 'aaaaaaaa-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001',
 'Concurrent test project',
 '11111111-0000-4000-8000-000000000001','active');
SQL
# Transaction A holds a CPC key update while Transaction B attempts a WOS
# order using the no-longer-valid customer/project tuple; FK must wait/reject.
psql -v ON_ERROR_STOP=1 -d "$db" -c "
BEGIN;
UPDATE public.cpc_projects
 SET customer_reference_id='32222222-0000-4000-8000-000000000001'
 WHERE id='42222222-0000-4000-8000-000000000001';
SELECT pg_sleep(2);
COMMIT;" >/tmp/wos-p0-cpc-concurrency-writer.log 2>&1 &
writer_pid=$!
sleep 0.4
set +e
psql -v ON_ERROR_STOP=1 -d "$db" -c "
INSERT INTO public.wos_production_orders(
 organization_id,customer_id,customer_name_snapshot,project_id,
 project_name_snapshot,order_number,product_name,sales_owner_profile_id,
 project_owner_profile_id,priority,version_label,requested_quantity,
 current_batch_quantity,product_material,created_by_profile_id)
VALUES(
 'aaaaaaaa-0000-4000-8000-000000000001',
 '31111111-0000-4000-8000-000000000001',
 'Synthetic Test Customer',
 '42222222-0000-4000-8000-000000000001',
 'Concurrent test project','WOS-CPC-RACE-001','Synthetic test PP',
 '11111111-0000-4000-8000-000000000001',
 '11111111-0000-4000-8000-000000000001',
 'MEDIUM','V1',10,10,'PP','11111111-0000-4000-8000-000000000001');" >/tmp/wos-p0-cpc-concurrency-reader.log 2>&1
reader_rc=$?
wait "$writer_pid"
writer_rc=$?
set -e
test "$writer_rc" -eq 0
test "$reader_rc" -ne 0
grep -q "violates foreign key constraint" /tmp/wos-p0-cpc-concurrency-reader.log
test "$(psql -At -d "$db" -c "select count(*) from public.wos_production_orders where order_number='WOS-CPC-RACE-001'")" = 0
echo WOS_P0_01_02_CONCURRENT_CPC_RELINK_VS_ORDER_INSERT_DENIED=PASS
