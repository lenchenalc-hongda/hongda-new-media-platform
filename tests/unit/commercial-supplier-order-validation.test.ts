import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UUID_PATTERN, formatSupplierMoney, lineAmountThousandths,
  validateSupplierOrder, toThousandths,
} from '../../src/lib/commercial-supplier-orders/validation';

const valid = {
  order: { supplier: '外协花膜厂', deliveryDate: '2026-11-20', orderDate: '2026-10-31' },
  lines: [{ id: 1, category: '热转印花膜', name: '亮金花膜', spec: '', unit: '卷',
    quantity: '1.125', price: '100.005', note: '' }],
};
const good = validateSupplierOrder(valid);
assert.equal(good.ok, true);
if (good.ok) assert.equal(good.amountThousandths, 112506);
assert.equal(lineAmountThousandths('0.1','0.2'), 20n);
assert.equal(lineAmountThousandths('1.125','100.005'), 112506n);
assert.equal(toThousandths('1630'), 1630000n);
assert.equal(lineAmountThousandths('1.1234','2'), null);
assert.equal(lineAmountThousandths('-1','3'), null);
assert.equal(lineAmountThousandths('0','3'), null);
assert.equal(formatSupplierMoney(112506), '112.506');
assert.equal(validateSupplierOrder({ ...valid, order: {...valid.order, supplier:''} }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, order: {...valid.order, deliveryDate:'2026-02-30'} }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, lines: [{...valid.lines[0], price:'Infinity'}] }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, lines: [{...valid.lines[0], price:'100.0055'}] }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, lines: [{...valid.lines[0], quantity:'1000000000000', price:'1000000000000'}] }).ok, false);
assert(UUID_PATTERN.test('a5634c50-2f18-4cf9-ab68-93e69ee1fa23'));
assert(!UUID_PATTERN.test('a5634c50-2f18-4cf9-ab68-93e69ee1fa23-not-uuid'));

const migration = readFileSync(new URL('../../supabase/migrations/20261031133000_commercial_supplier_order_rpc_hardening.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/confirmed/route.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../../src/components/commercial-documents/SupplierProductionOrderWorkbench.tsx', import.meta.url), 'utf8');
assert(migration.includes('AMOUNT_MISMATCH'), 'RPC must check trusted amount');
assert(migration.includes('pg_advisory_xact_lock'), 'RPC idempotency retries must serialize');
assert(migration.includes('REQUEST_MISMATCH'), 'RPC must reject changed replay');
assert(migration.includes('SUPPLIER_ORDER_VERSION_IMMUTABLE'), 'Archived versions must be immutable');
assert(api.includes('validateSupplierOrder'), 'Server endpoint must validate snapshots');
assert(api.includes("query = query.eq('owner_profile_id'"), 'Non-manager list must restrict owner');
assert(editor.includes('xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'), 'Editor stays left of preview on desktop');
console.log('commercial-supplier-order-validation.test.ts: PASS');
