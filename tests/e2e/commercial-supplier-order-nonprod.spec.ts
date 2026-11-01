// ===== Commercial Supplier Orders Isolated Nonproduction E2E =====
// This suite is read/write-enabled only when the shared live-test safety gate
// explicitly allows a disposable development or preview Supabase environment.
// Run: node node_modules/tsx/dist/cli.mjs tests/e2e/commercial-supplier-order-nonprod.spec.ts

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { evaluateLiveAuthGate } from '../live/live-auth-gate';
import {
  buildSupplierOrderPrintableSnapshot,
  formatSupplierMoney,
  validateSupplierOrder,
  type SupplierOrderPayload,
} from '../../src/lib/commercial-supplier-orders/validation';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): boolean {
  if (condition) {
    passed++;
    return true;
  }
  failed++;
  console.error(`FAIL: ${label}`);
  return false;
}

function rpcRow(result: { data: unknown }): Record<string, unknown> | null {
  return Array.isArray(result.data) && result.data[0] && typeof result.data[0] === 'object'
    ? result.data[0] as Record<string, unknown>
    : null;
}

function rpcErrorIs(result: { error: unknown }, token: string): boolean {
  if (!result.error || typeof result.error !== 'object') return false;
  const message = (result.error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes(token);
}

function printableFixture(version: 1 | 2, tag: string): SupplierOrderPayload {
  const isV1 = version === 1;
  return {
    order: {
      supplier: `QA-CSO-${tag}-V${version}`,
      contact: 'QA Contact',
      phone: '00000000000',
      address: 'Isolated QA address',
      orderDate: '2026-10-31',
      deliveryDate: '2026-11-20',
      project: `QA-${tag}`,
      receiver: 'QA Receiver',
      deliveryAddress: 'Isolated QA delivery address',
      quality: isV1 ? 'V1 quality snapshot' : 'V2 quality snapshot',
      technical: isV1 ? 'V1 technical snapshot' : 'V2 technical snapshot',
      payment: 'QA terms',
      shipping: 'QA pickup',
      tax: '未约定',
      remarks: `Frozen V${version}`,
    },
    lines: [{
      id: 1,
      category: '热转印花膜',
      name: isV1 ? 'QA V1 film' : 'QA V2 film',
      spec: `SPEC-V${version}`,
      unit: '卷',
      quantity: isV1 ? '0.003' : '1.005',
      price: isV1 ? '1.5' : '1.001',
      note: `Line snapshot V${version}`,
    }],
  };
}

function printMatrix(matrix: Record<string, string>) {
  console.log('\nCSO_NONPROD_E2E_MATRIX');
  for (const [name, status] of Object.entries(matrix)) {
    console.log(`${name}=${status}`);
  }
  console.log(`passed=${passed} failed=${failed}`);
}

async function main() {
  console.log('\n=== Commercial Supplier Orders Isolated Nonproduction E2E ===');

  const matrix: Record<string, string> = {
    draft_create_and_revision_conflict: 'NOT_VERIFIED',
    formal_immutable_v1_v2_history: 'NOT_VERIFIED',
    cross_user_rls_contract: 'NOT_VERIFIED',
    exact_0_001_rmb_calculation: 'NOT_VERIFIED',
    printable_historical_snapshot_parity: 'NOT_VERIFIED',
  };

  const v1 = printableFixture(1, 'DETERMINISTIC');
  const v2 = printableFixture(2, 'DETERMINISTIC');
  const checkedV1 = validateSupplierOrder(v1);
  const checkedV2 = validateSupplierOrder(v2);
  check(checkedV1.ok && checkedV1.amountThousandths === 5,
    'deterministic V1 total must round exactly to 0.005 RMB');
  check(checkedV2.ok && checkedV2.amountThousandths === 1006,
    'deterministic V2 total must calculate exactly as 1.006 RMB');
  const printableV1 = buildSupplierOrderPrintableSnapshot(v1);
  const printableV2 = buildSupplierOrderPrintableSnapshot(v2);
  check(printableV1.order.supplier === v1.order.supplier &&
    printableV1.lines[0].line.name === v1.lines[0].name &&
    formatSupplierMoney(printableV1.totalThousandths) === '0.005',
    'V1 print model must preserve its immutable snapshot and amount');
  check(printableV2.order.supplier === v2.order.supplier &&
    printableV2.lines[0].line.name === v2.lines[0].name &&
    formatSupplierMoney(printableV2.totalThousandths) === '1.006',
    'V2 print model must preserve its own snapshot rather than V1');
  matrix.exact_0_001_rmb_calculation = failed === 0 ? 'PASS' : 'FAIL';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const gate = evaluateLiveAuthGate({
    authMode: process.env.AUTH_MODE,
    supabaseUrl: url,
    anonKey,
    serviceRoleKey: serviceKey,
    allowLiveAuthTests: process.env.ALLOW_LIVE_AUTH_TESTS,
    supabaseEnvironment: process.env.SUPABASE_ENVIRONMENT,
    adminEmail: process.env.LIVE_TEST_ADMIN_EMAIL,
    adminPassword: process.env.LIVE_TEST_ADMIN_PASSWORD,
    viewerEmail: process.env.LIVE_TEST_VIEWER_EMAIL,
    viewerPassword: process.env.LIVE_TEST_VIEWER_PASSWORD,
  });

  if (!gate.allowed) {
    console.log('LIVE_E2E: NOT_VERIFIED');
    console.log(`Reason: ${gate.reasons.join('; ')}`);
    printMatrix(matrix);
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const adminClient = createClient(url, anonKey, clientOptions);
  const viewerClient = createClient(url, anonKey, clientOptions);

  const adminLogin = await adminClient.auth.signInWithPassword({
    email: process.env.LIVE_TEST_ADMIN_EMAIL!,
    password: process.env.LIVE_TEST_ADMIN_PASSWORD!,
  });
  const viewerLogin = await viewerClient.auth.signInWithPassword({
    email: process.env.LIVE_TEST_VIEWER_EMAIL!,
    password: process.env.LIVE_TEST_VIEWER_PASSWORD!,
  });
  if (adminLogin.error || !adminLogin.data.user || viewerLogin.error || !viewerLogin.data.user) {
    console.log('LIVE_E2E: NOT_VERIFIED');
    console.log('Reason: authenticated test accounts are unavailable');
    printMatrix(matrix);
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  const adminProfileResult = await adminClient.from('profiles')
    .select('id,org_id,role,is_active')
    .eq('user_id', adminLogin.data.user.id)
    .maybeSingle();
  const viewerProfileResult = await viewerClient.from('profiles')
    .select('id,org_id,role,is_active')
    .eq('user_id', viewerLogin.data.user.id)
    .maybeSingle();
  const adminProfile = adminProfileResult.data;
  const viewerProfile = viewerProfileResult.data;
  const profilesReady = !adminProfileResult.error && !viewerProfileResult.error &&
    adminProfile?.role === 'admin' && adminProfile.is_active === true &&
    viewerProfile?.role === 'viewer' && viewerProfile.is_active === true &&
    adminProfile.org_id === viewerProfile.org_id;
  if (!profilesReady) {
    console.log('LIVE_E2E: NOT_VERIFIED');
    console.log('Reason: admin/viewer profiles are not a same-org active QA fixture');
    printMatrix(matrix);
    process.exitCode = failed === 0 ? 0 : 1;
    return;
  }

  console.log('LIVE_E2E: VERIFYING');
  const tag = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const draftV1 = printableFixture(1, tag);
  const draftV2 = printableFixture(2, tag);
  const draftV3ForStaleTab: SupplierOrderPayload = {
    ...draftV2,
    order: { ...draftV2.order, remarks: 'STALE TAB MUST NOT OVERWRITE' },
  };

  const draftCreate = await adminClient.from('commercial_supplier_order_drafts').insert({
    org_id: adminProfile.org_id,
    owner_profile_id: adminProfile.id,
    updated_by_profile_id: adminProfile.id,
    draft_json: draftV1,
    supplier_name: draftV1.order.supplier,
  }).select('id,revision').single();
  const draftId = draftCreate.data?.id as string | undefined;
  if (!check(!draftCreate.error && !!draftId && draftCreate.data?.revision === 1,
      'draft creation must create owner-owned revision 1')) {
    matrix.draft_create_and_revision_conflict = 'FAIL';
    matrix.cross_user_rls_contract = 'FAIL';
    printMatrix(matrix);
    process.exitCode = 1;
    return;
  }

  const draftUpdate = await adminClient.from('commercial_supplier_order_drafts').update({
    draft_json: draftV2,
    supplier_name: draftV2.order.supplier,
    updated_by_profile_id: adminProfile.id,
    revision: 2,
  }).eq('id', draftId).eq('org_id', adminProfile.org_id)
    .eq('owner_profile_id', adminProfile.id).eq('revision', 1).eq('status', 'active')
    .select('revision').maybeSingle();
  check(!draftUpdate.error && draftUpdate.data?.revision === 2,
    'current draft revision must advance from 1 to 2');

  const staleDraftUpdate = await adminClient.from('commercial_supplier_order_drafts').update({
    draft_json: draftV3ForStaleTab,
    supplier_name: draftV3ForStaleTab.order.supplier,
    updated_by_profile_id: adminProfile.id,
    revision: 3,
  }).eq('id', draftId).eq('org_id', adminProfile.org_id)
    .eq('owner_profile_id', adminProfile.id).eq('revision', 1).eq('status', 'active')
    .select('id');
  check(!staleDraftUpdate.error && Array.isArray(staleDraftUpdate.data) && staleDraftUpdate.data.length === 0,
    'stale draft compare-and-swap must not update revision 2');

  const draftAfterStale = await adminClient.from('commercial_supplier_order_drafts')
    .select('revision,draft_json')
    .eq('id', draftId).eq('status', 'active').maybeSingle();
  check(!draftAfterStale.error && draftAfterStale.data?.revision === 2 &&
    draftAfterStale.data?.draft_json?.order?.supplier === draftV2.order.supplier,
    'stale tab must leave the current draft content intact');

  const viewerDraftRead = await viewerClient.from('commercial_supplier_order_drafts')
    .select('id,draft_json')
    .eq('id', draftId).maybeSingle();
  check(!viewerDraftRead.error && viewerDraftRead.data === null,
    'cross-user viewer must not read the admin-owned draft');

  const viewerDraftWrite = await viewerClient.from('commercial_supplier_order_drafts').update({
    draft_json: draftV3ForStaleTab,
    updated_by_profile_id: viewerProfile.id,
    revision: 3,
  }).eq('id', draftId).select('id');
  check(Array.isArray(viewerDraftWrite.data) && viewerDraftWrite.data.length === 0,
    'cross-user viewer must not update the admin-owned draft');

  const viewerDraftInsert = await viewerClient.from('commercial_supplier_order_drafts').insert({
    org_id: viewerProfile.org_id,
    owner_profile_id: viewerProfile.id,
    updated_by_profile_id: viewerProfile.id,
    draft_json: draftV1,
    supplier_name: draftV1.order.supplier,
  }).select('id');
  check(!!viewerDraftInsert.error,
    'viewer role must not create supplier drafts');
  matrix.draft_create_and_revision_conflict = failed === 0 ? 'PASS' : 'FAIL';

  const liveV1 = printableFixture(1, tag);
  const liveV2 = printableFixture(2, tag);
  const checkedLiveV1 = validateSupplierOrder(liveV1);
  const checkedLiveV2 = validateSupplierOrder(liveV2);
  if (!checkedLiveV1.ok || !checkedLiveV2.ok) {
    check(false, 'live fixtures must pass shared snapshot validation');
    matrix.formal_immutable_v1_v2_history = 'FAIL';
    printMatrix(matrix);
    process.exitCode = 1;
    return;
  }

  const v1RequestId = crypto.randomUUID();
  const v1Save = await adminClient.rpc('save_supplier_order_version', {
    p_request_id: v1RequestId,
    p_order_id: null,
    p_expected_version: 0,
    p_snapshot: checkedLiveV1.snapshot,
    p_total_thousandths: checkedLiveV1.amountThousandths,
  });
  const v1Row = rpcRow(v1Save);
  const orderId = typeof v1Row?.order_id === 'string' ? v1Row.order_id : '';
  check(!v1Save.error && v1Row?.version === 1 && !!orderId,
    'formal order must create immutable V1');

  if (orderId) {
    const v2Save = await adminClient.rpc('save_supplier_order_version', {
      p_request_id: crypto.randomUUID(),
      p_order_id: orderId,
      p_expected_version: 1,
      p_snapshot: checkedLiveV2.snapshot,
      p_total_thousandths: checkedLiveV2.amountThousandths,
    });
    const v2Row = rpcRow(v2Save);
    check(!v2Save.error && v2Row?.version === 2 && v2Row?.order_id === orderId,
      'formal order must append immutable V2 at the expected version');
  }

  if (orderId) {
    const staleV3 = printableFixture(1, `${tag}-STALE`);
    const checkedStaleV3 = validateSupplierOrder(staleV3);
    if (!checkedStaleV3.ok) {
      check(false, 'stale V3 fixture must pass shared snapshot validation');
    } else {
      const staleSave = await adminClient.rpc('save_supplier_order_version', {
        p_request_id: crypto.randomUUID(),
        p_order_id: orderId,
        p_expected_version: 1,
        p_snapshot: checkedStaleV3.snapshot,
        p_total_thousandths: checkedStaleV3.amountThousandths,
      });
      check(rpcErrorIs(staleSave, 'VERSION_CONFLICT'),
        'formal stale write must return VERSION_CONFLICT');
    }
  }

  if (orderId) {
    const changedReplay = printableFixture(2, `${tag}-REPLAY`);
    const checkedReplay = validateSupplierOrder(changedReplay);
    if (!checkedReplay.ok) {
      check(false, 'changed replay fixture must pass shared snapshot validation');
    } else {
      const replay = await adminClient.rpc('save_supplier_order_version', {
        p_request_id: v1RequestId,
        p_order_id: orderId,
        p_expected_version: 0,
        p_snapshot: checkedReplay.snapshot,
        p_total_thousandths: checkedReplay.amountThousandths,
      });
      check(rpcErrorIs(replay, 'REQUEST_MISMATCH'),
        'reusing an idempotency request for changed content must fail');
    }
  }

  if (orderId) {
    const history = await adminClient.from('commercial_supplier_order_versions')
      .select('version,snapshot,total_thousandths')
      .eq('order_id', orderId)
      .order('version', { ascending: true });
    check(!history.error && history.data?.length === 2 &&
      history.data[0]?.version === 1 && history.data[1]?.version === 2,
      'formal history must contain exactly immutable V1 and V2');
    check(history.data?.[0]?.snapshot?.order?.supplier === liveV1.order.supplier &&
      history.data?.[0]?.snapshot?.lines?.[0]?.name === liveV1.lines[0].name &&
      history.data?.[0]?.total_thousandths === 5,
      'V1 history must retain its exact archived print snapshot and amount');
    check(history.data?.[1]?.snapshot?.order?.supplier === liveV2.order.supplier &&
      history.data?.[1]?.snapshot?.lines?.[0]?.name === liveV2.lines[0].name &&
      history.data?.[1]?.total_thousandths === 1006,
      'V2 history must retain its exact archived print snapshot and amount');
    const archivedV1 = history.data?.[0]?.snapshot as SupplierOrderPayload | undefined;
    const archivedV2 = history.data?.[1]?.snapshot as SupplierOrderPayload | undefined;
    check(!!archivedV1 && !!archivedV2 &&
      formatSupplierMoney(buildSupplierOrderPrintableSnapshot(archivedV1).totalThousandths) === '0.005' &&
      formatSupplierMoney(buildSupplierOrderPrintableSnapshot(archivedV2).totalThousandths) === '1.006',
      'archived V1/V2 snapshots must produce their own printable totals');

    const orderRead = await adminClient.from('commercial_supplier_orders')
      .select('latest_version')
      .eq('id', orderId).maybeSingle();
    check(!orderRead.error && orderRead.data?.latest_version === 2,
      'latest formal version must remain V2 after rejected stale/replay writes');

    const directVersionMutation = await adminClient.from('commercial_supplier_order_versions')
      .update({ supplier_name: 'FORGED' })
      .eq('order_id', orderId).eq('version', 1).select('version');
    check(!!directVersionMutation.error,
      'authenticated clients must not directly mutate archived versions');

    const viewerOrderRead = await viewerClient.from('commercial_supplier_orders')
      .select('id,latest_version')
      .eq('id', orderId).maybeSingle();
    check(!viewerOrderRead.error && viewerOrderRead.data === null,
      'cross-user viewer must not read the admin-owned formal order');

    const viewerHistoryRead = await viewerClient.from('commercial_supplier_order_versions')
      .select('version,snapshot')
      .eq('order_id', orderId);
    check(!viewerHistoryRead.error && Array.isArray(viewerHistoryRead.data) && viewerHistoryRead.data.length === 0,
      'cross-user viewer must not read admin-owned order versions');

    const viewerRpcWrite = await viewerClient.rpc('save_supplier_order_version', {
      p_request_id: crypto.randomUUID(),
      p_order_id: orderId,
      p_expected_version: 2,
      p_snapshot: checkedLiveV1.snapshot,
      p_total_thousandths: checkedLiveV1.amountThousandths,
    });
    check(rpcErrorIs(viewerRpcWrite, 'NOT_AUTHORIZED'),
      'cross-user viewer must not write a new formal version');
    matrix.formal_immutable_v1_v2_history =
      orderId && failed === 0 ? 'PASS' : 'FAIL';
    matrix.cross_user_rls_contract = failed === 0 ? 'PASS' : 'FAIL';
    matrix.printable_historical_snapshot_parity = failed === 0 ? 'PASS' : 'FAIL';
  } else {
    matrix.formal_immutable_v1_v2_history = 'FAIL';
    matrix.cross_user_rls_contract = 'FAIL';
  }

  const cleanup = await adminClient.from('commercial_supplier_order_drafts').update({
    status: 'deleted',
    revision: 3,
    updated_by_profile_id: adminProfile.id,
    updated_at: new Date().toISOString(),
  }).eq('id', draftId).eq('owner_profile_id', adminProfile.id)
    .eq('revision', 2).select('id');
  check(!cleanup.error && Array.isArray(cleanup.data) && cleanup.data.length === 1,
    'synthetic active draft must be soft-deleted after the run');
  if (cleanup.error || !cleanup.data?.length) {
    matrix.draft_create_and_revision_conflict = 'FAIL';
  }

  console.log(`LIVE_E2E: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log('Note: immutable synthetic formal versions remain by design in the disposable QA database.');
  printMatrix(matrix);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(() => {
  console.error('FAIL: live harness stopped on an unexpected sanitized error');
  console.log('LIVE_E2E: FAIL');
  process.exitCode = 1;
});
