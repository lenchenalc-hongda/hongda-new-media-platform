import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UUID_PATTERN, buildSupplierOrderPrintableSnapshot, formatSupplierMoney,
  lineAmountThousandths, validateSupplierOrder, toThousandths,
} from '../../src/lib/commercial-supplier-orders/validation';
import { supplierOrdersEnabled } from '../../src/lib/commercial-supplier-orders/availability';

const valid = {
  order: { supplier: '外协花膜厂', deliveryDate: '2026-11-20', orderDate: '2026-10-31' },
  lines: [{ id: 1, category: '热转印花膜', name: '亮金花膜', spec: '', unit: '卷',
    quantity: '1.125', price: '100.005', note: '' }],
};
const good = validateSupplierOrder(valid);
assert.equal(good.ok, true);
if (good.ok) assert.equal(good.amountThousandths, 112506);
assert.equal(lineAmountThousandths('0.1','0.2'), BigInt(20));
assert.equal(lineAmountThousandths('1.125','100.005'), BigInt(112506));
assert.equal(toThousandths('1630'), BigInt(1630000));
assert.equal(lineAmountThousandths('1.1234','2'), null);
assert.equal(lineAmountThousandths('-1','3'), null);
assert.equal(lineAmountThousandths('0','3'), null);
assert.equal(formatSupplierMoney(112506), '112.506');
assert.equal(formatSupplierMoney(BigInt(1000)), '1.00');
assert.equal(formatSupplierMoney(BigInt(1005)), '1.005');
assert.equal(formatSupplierMoney(BigInt(123450)), '123.45');
assert.equal(formatSupplierMoney(BigInt(1234500)), '1,234.50');
assert.equal(formatSupplierMoney(BigInt(-1005)), '-1.005');

// HALF_UP is applied exactly once per line at 0.001 RMB precision.
assert.equal(lineAmountThousandths('0.003', '1.5'), BigInt(5));
assert.equal(lineAmountThousandths('0.003', '1.499'), BigInt(4));
assert.equal(lineAmountThousandths('1.005', '1.001'), BigInt(1006));
assert.equal(formatSupplierMoney(lineAmountThousandths('0.003', '1.5')!), '0.005');
assert.equal(validateSupplierOrder({ ...valid, order: {...valid.order, supplier:''} }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, order: {...valid.order, deliveryDate:'2026-02-30'} }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, lines: [{...valid.lines[0], price:'Infinity'}] }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, lines: [{...valid.lines[0], price:'100.0055'}] }).ok, false);
assert.equal(validateSupplierOrder({ ...valid, lines: [{...valid.lines[0], quantity:'1000000000000', price:'1000000000000'}] }).ok, false);
assert(UUID_PATTERN.test('a5634c50-2f18-4cf9-ab68-93e69ee1fa23'));
assert(!UUID_PATTERN.test('a5634c50-2f18-4cf9-ab68-93e69ee1fa23-not-uuid'));

const migration = readFileSync(new URL('../../supabase/migrations/20261031133000_commercial_supplier_order_rpc_hardening.sql', import.meta.url), 'utf8');
const draftsMigration = readFileSync(new URL('../../supabase/migrations/20261031110000_commercial_supplier_order_drafts.sql', import.meta.url), 'utf8');
const versionsMigration = readFileSync(new URL('../../supabase/migrations/20261031120000_commercial_supplier_order_versions.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/confirmed/route.ts', import.meta.url), 'utf8');
const detailApi = readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/confirmed/[id]/route.ts', import.meta.url), 'utf8');
const draftsApi = readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/drafts/route.ts', import.meta.url), 'utf8');
const draftDetailApi = readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/drafts/[id]/route.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../../src/components/commercial-documents/SupplierProductionOrderWorkbench.tsx', import.meta.url), 'utf8');
assert(migration.includes('AMOUNT_MISMATCH'), 'RPC must check trusted amount');
assert(migration.includes('pg_advisory_xact_lock'), 'RPC idempotency retries must serialize');
assert(migration.includes('REQUEST_MISMATCH'), 'RPC must reject changed replay');
assert(migration.includes('SUPPLIER_ORDER_VERSION_IMMUTABLE'), 'Archived versions must be immutable');
assert(migration.includes('p_expected_version + 1'), 'Formal saves must append the next immutable version');
assert(migration.includes('v_order.latest_version <> p_expected_version'), 'Stale formal saves must conflict');
assert(versionsMigration.includes('unique(order_id,version)'), 'Order history must have one row per version');
assert(versionsMigration.includes('v_order.latest_version<>p_expected_version'), 'Formal writes must compare expected versions');
assert(api.includes('validateSupplierOrder'), 'Server endpoint must validate snapshots');
assert(api.includes("query = query.eq('owner_profile_id'"), 'Non-manager list must restrict owner');
assert(api.includes("rpc('save_supplier_order_version'"), 'Formal saves must use the transactional append-only RPC');
assert(api.includes('expectedVersion'), 'Formal saves must require an expected version');
assert(detailApi.includes('.order(\'version\',{ascending:false})'), 'History must return newest formal versions');
assert(draftsApi.includes('owner_profile_id:ctx.profile.id'), 'Draft creation must stamp the authenticated owner');
assert(draftsApi.includes('revision'), 'Draft creation response must expose its revision');
assert(draftDetailApi.includes('expectedRevision'), 'Draft updates must require a revision');
assert(draftDetailApi.includes(".eq('revision',rev)"), 'Draft updates must use compare-and-swap');
assert(draftDetailApi.includes('VERSION_CONFLICT') && draftDetailApi.includes('409'), 'Stale drafts must return a visible conflict');
assert(draftsMigration.includes('p.id=commercial_supplier_order_drafts.owner_profile_id'), 'Draft ownership must be enforced in RLS');
assert(draftsMigration.includes('supplier_drafts_update'), 'Draft revisions must be updated in place under ownership');
assert(versionsMigration.includes('p.id=commercial_supplier_orders.owner_profile_id'), 'Formal order reads must enforce owner or manager scope');
assert(versionsMigration.includes('revoke all on public.commercial_supplier_orders from public, anon, authenticated'),
  'Formal order writes must not be available as direct table mutations');
assert(editor.includes('xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'), 'Editor stays left of preview on desktop');
const availability=readFileSync(new URL('../../src/lib/commercial-supplier-orders/availability.ts',import.meta.url),'utf8');
const supplierPage=readFileSync(new URL('../../src/app/commercial-documents/production-orders/page.tsx',import.meta.url),'utf8');
const supplierDraftApi=readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/drafts/route.ts',import.meta.url),'utf8');
const supplierHistoryApi=readFileSync(new URL('../../src/app/api/commercial-documents/production-orders/confirmed/[id]/route.ts',import.meta.url),'utf8');
const nav=readFileSync(new URL('../../src/lib/constants/navigation.ts',import.meta.url),'utf8');
assert(availability.includes('SUPPLIER_ORDERS_PRODUCTION_APPROVED'));
assert(supplierPage.includes('supplierOrdersEnabled()'));
assert(api.includes('supplierOrdersEnabled()'));
assert(supplierDraftApi.includes('supplierOrdersEnabled()'));
assert(supplierHistoryApi.includes('supplierOrdersEnabled()'));
assert(nav.includes("NEXT_PUBLIC_FEATURE_SUPPLIER_ORDERS === 'true'"));
assert(editor.includes('setConfirmedId(null)'), 'Opening a draft must not overwrite a previous confirmed order');
assert(editor.includes('versionHistory'), 'Historical snapshots must be selectable');
assert(editor.includes('buildSupplierOrderPrintableSnapshot'), 'Preview and print must share one frozen snapshot model');
assert(editor.includes('printable.order.') && editor.includes('printable.lines.map'),
  'Printable historical data must render from the frozen snapshot model');

const v1 = {
  order: { ...valid.order, supplier: '历史供应商 V1', remarks: 'V1 冻结备注' },
  lines: [{ ...valid.lines[0], quantity: '0.003', price: '1.5' }],
};
const v2 = {
  order: { ...valid.order, supplier: '当前供应商 V2', remarks: 'V2 当前备注' },
  lines: [{ ...valid.lines[0], name: '新版花膜', quantity: '1.005', price: '1.001' }],
};
const printableV1 = buildSupplierOrderPrintableSnapshot(v1);
assert.deepEqual(printableV1.order, v1.order, 'Printable snapshot must preserve every order field');
assert.deepEqual(printableV1.lines[0].line, v1.lines[0], 'Printable snapshot must preserve every line field');
assert.equal(printableV1.lines[0].amountThousandths, BigInt(5));
assert.equal(formatSupplierMoney(printableV1.totalThousandths), '0.005');
const printableV2 = buildSupplierOrderPrintableSnapshot(v2);
assert.notDeepEqual(printableV1, printableV2, 'Selecting V2 must not reuse V1 print content');
assert.equal(printableV2.lines[0].amountThousandths, BigInt(1006));
assert.equal(formatSupplierMoney(printableV2.totalThousandths), '1.006');

const originalFeatureFlag = process.env.FEATURE_SUPPLIER_ORDERS;
const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalProductionApproval = process.env.SUPPLIER_ORDERS_PRODUCTION_APPROVED;
try {
  delete process.env.FEATURE_SUPPLIER_ORDERS;
  delete process.env.VERCEL_ENV;
  delete process.env.SUPPLIER_ORDERS_PRODUCTION_APPROVED;
  assert.equal(supplierOrdersEnabled(), false, 'Server feature gate must default closed');
  process.env.FEATURE_SUPPLIER_ORDERS = 'true';
  assert.equal(supplierOrdersEnabled(), true);
  process.env.VERCEL_ENV = 'production';
  assert.equal(supplierOrdersEnabled(), false, 'Production must remain closed without explicit approval');
  process.env.SUPPLIER_ORDERS_PRODUCTION_APPROVED = 'true';
  assert.equal(supplierOrdersEnabled(), true);
} finally {
  if (originalFeatureFlag === undefined) delete process.env.FEATURE_SUPPLIER_ORDERS;
  else process.env.FEATURE_SUPPLIER_ORDERS = originalFeatureFlag;
  if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnvironment;
  if (originalProductionApproval === undefined) delete process.env.SUPPLIER_ORDERS_PRODUCTION_APPROVED;
  else process.env.SUPPLIER_ORDERS_PRODUCTION_APPROVED = originalProductionApproval;
}
console.log('commercial-supplier-order-validation.test.ts: PASS');
