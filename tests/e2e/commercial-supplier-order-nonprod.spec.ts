// ===== Commercial Supplier Orders Isolated Nonproduction E2E =====
// Static checks always run. The live harness is unreachable unless every
// disposable-project, acknowledgement, identity and credential gate passes.
// Run: node --import tsx tests/e2e/commercial-supplier-order-nonprod.spec.ts

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildSupplierOrderPrintableSnapshot,
  formatSupplierMoney,
  UUID_PATTERN,
  validateSupplierOrder,
  type SupplierOrderPayload,
} from '../../src/lib/commercial-supplier-orders/validation';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const ISOLATED_SUPABASE_PROJECT_REF = 'xulmpqaknlwqqculbsek';
const HARNESS_FIXTURE_MODE_ENV = 'CSO_NONPROD_HARNESS_FIXTURE';
const HARNESS_FIXTURE_MODES = [
  'missing-credentials',
  'unexpected-static',
  'unexpected-after-write-checkpoint',
] as const;
const LIVE_MATRIX_ROWS = [
  'owner_two_session_auth',
  'draft_create_and_revision_conflict',
  'formal_concurrent_v2_to_v3',
  'idempotent_winner_replay',
  'formal_immutable_v1_v2_history',
  'cross_user_rls_contract',
  'exact_0_001_rmb_calculation',
  'printable_historical_snapshot_parity',
] as const;

type MatrixRow = typeof LIVE_MATRIX_ROWS[number];
type MatrixStatus = 'PASS' | 'FAIL' | 'NOT_VERIFIED';
type LiveMatrix = Record<MatrixRow, MatrixStatus>;
type LiveGateEnv = Record<string, string | undefined>;
type HarnessFixtureMode = typeof HARNESS_FIXTURE_MODES[number];

type LiveGateResult =
  | { allowed: true }
  | { allowed: false; reasons: string[] };

type RpcResult = {
  data: unknown;
  error: unknown;
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

let staticPassed = 0;
let staticFailed = 0;
let livePassed = 0;
let liveFailed = 0;
let liveWritesStarted = false;
let unexpectedFailure = false;
let activeFixtureMode: HarnessFixtureMode | null = null;
let activeMatrix: LiveMatrix = emptyMatrix();

function present(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

function projectRefFromUrl(value: string | undefined): string | null {
  if (!value || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function evaluateCsoLiveGate(env: LiveGateEnv): LiveGateResult {
  const reasons: string[] = [];

  if (env.LIVE_TEST !== 'true') reasons.push('LIVE_TEST != true');
  if (env.LIVE_TEST_ACKNOWLEDGE_IMMUTABLE_TEST_VERSIONS !== 'true') {
    reasons.push('immutable disposable-test-version acknowledgement missing');
  }
  if (projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) !== ISOLATED_SUPABASE_PROJECT_REF) {
    reasons.push('Supabase URL is not the exact isolated QA project');
  }
  if (!present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    reasons.push('NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
  }

  const expectedOrgId = env.LIVE_TEST_EXPECTED_ORG_ID || '';
  if (!UUID_PATTERN.test(expectedOrgId)) {
    reasons.push('LIVE_TEST_EXPECTED_ORG_ID missing or invalid');
  }
  if (!present(env.LIVE_TEST_ADMIN_EMAIL) || !present(env.LIVE_TEST_ADMIN_PASSWORD)) {
    reasons.push('LIVE_TEST_ADMIN_* credentials missing');
  }
  if (!present(env.LIVE_TEST_VIEWER_EMAIL) || !present(env.LIVE_TEST_VIEWER_PASSWORD)) {
    reasons.push('LIVE_TEST_VIEWER_* credentials missing');
  }

  return reasons.length === 0 ? { allowed: true } : { allowed: false, reasons };
}

function emptyMatrix(): LiveMatrix {
  return Object.fromEntries(
    LIVE_MATRIX_ROWS.map(row => [row, 'NOT_VERIFIED']),
  ) as LiveMatrix;
}

function checkStatic(condition: boolean, label: string): boolean {
  if (condition) {
    staticPassed++;
    return true;
  }
  staticFailed++;
  console.error(`FAIL: ${label}`);
  return false;
}

function checkLive(condition: boolean, label: string): boolean {
  if (condition) {
    livePassed++;
    return true;
  }
  liveFailed++;
  console.error(`FAIL: ${label}`);
  return false;
}

function finishExpectedPreflightUnavailable(
  reason: 'AUTHENTICATION_UNAVAILABLE' | 'PREFLIGHT_IDENTITY_UNAVAILABLE' |
    'PREFLIGHT_PROFILE_UNAVAILABLE',
  matrix: LiveMatrix,
): void {
  console.log(`LIVE_E2E_REASON: ${reason}`);
  finish('NOT_VERIFIED', matrix);
}

function rpcRow(result: RpcResult): Record<string, unknown> | null {
  return Array.isArray(result.data) && result.data[0] && typeof result.data[0] === 'object'
    ? result.data[0] as Record<string, unknown>
    : null;
}

function rpcErrorIs(result: RpcResult, token: string): boolean {
  if (!result.error || typeof result.error !== 'object') return false;
  const message = (result.error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes(token);
}

function rowData(result: QueryResult): Record<string, unknown> | null {
  return result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : null;
}

function rowsData(result: QueryResult): Record<string, unknown>[] {
  return Array.isArray(result.data)
    ? result.data.filter((row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row))
    : [];
}

function noRowsAndNoError(result: QueryResult): boolean {
  return !result.error && Array.isArray(result.data) && result.data.length === 0;
}

function nullRowAndNoError(result: QueryResult): boolean {
  return !result.error && result.data === null;
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
      quantity: isV1 ? '0.001' : '1.005',
      price: isV1 ? '1.000' : '1.001',
      note: `Line snapshot V${version}`,
    }],
  };
}

function versionRow(
  history: Record<string, unknown>[],
  version: number,
): Record<string, unknown> | undefined {
  return history.find(row => row.version === version);
}

function rowMatchesFixture(
  row: Record<string, unknown> | undefined,
  fixture: SupplierOrderPayload,
  expectedAmount: number,
): boolean {
  return !!row && isDeepStrictEqual(row.snapshot, fixture) &&
    row.total_thousandths === expectedAmount;
}

function finish(liveStatus: 'PASS' | 'FAIL' | 'NOT_VERIFIED', matrix: LiveMatrix): void {
  const effectiveStatus = unexpectedFailure ? 'FAIL' : liveStatus;
  const result = {
    event: 'CSO_NONPROD_E2E_RESULT',
    project_ref: ISOLATED_SUPABASE_PROJECT_REF,
    live_e2e: effectiveStatus,
    mode: liveWritesStarted ? 'LIVE_WRITES_ATTEMPTED' : 'SAFE_DRY_RUN',
    fixture_mode: activeFixtureMode,
    matrix: Object.fromEntries(LIVE_MATRIX_ROWS.map(row => [row, matrix[row]])),
    static_checks: { passed: staticPassed, failed: staticFailed },
    live_checks: { passed: livePassed, failed: liveFailed },
  };
  console.log(`CSO_NONPROD_E2E_RESULT=${JSON.stringify(result)}`);
  console.log(`LIVE_E2E: ${effectiveStatus}`);
  console.log(`MATRIX: ${LIVE_MATRIX_ROWS.map(row => `${row}=${matrix[row]}`).join(',')}`);
  process.exitCode =
    !unexpectedFailure && staticFailed === 0 && effectiveStatus !== 'FAIL' ? 0 : 1;
}

function recordUnexpectedFailure(matrix: LiveMatrix = activeMatrix): void {
  unexpectedFailure = true;
  console.error('FAIL: sanitized unexpected harness exception');
  finish('FAIL', matrix);
}

async function runWithUnexpectedFailureGuard(
  run: () => Promise<void>,
  matrix: LiveMatrix,
): Promise<void> {
  try {
    await run();
  } catch {
    recordUnexpectedFailure(matrix);
  }
}

async function profileFor(
  client: SupabaseClient<any, any, any, any, any>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const result = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', userId)
    .maybeSingle();
  return result.error ? null : rowData(result);
}

async function runLive(
  env: NodeJS.ProcessEnv,
  matrix: LiveMatrix,
  expectedOrgId: string,
): Promise<void> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const ownerAClient = createClient(url, anonKey, clientOptions);
  const ownerBClient = createClient(url, anonKey, clientOptions);
  const viewerClient = createClient(url, anonKey, clientOptions);

  const [ownerALogin, ownerBLogin, viewerLogin] = await Promise.all([
    ownerAClient.auth.signInWithPassword({
      email: env.LIVE_TEST_ADMIN_EMAIL!,
      password: env.LIVE_TEST_ADMIN_PASSWORD!,
    }),
    ownerBClient.auth.signInWithPassword({
      email: env.LIVE_TEST_ADMIN_EMAIL!,
      password: env.LIVE_TEST_ADMIN_PASSWORD!,
    }),
    viewerClient.auth.signInWithPassword({
      email: env.LIVE_TEST_VIEWER_EMAIL!,
      password: env.LIVE_TEST_VIEWER_PASSWORD!,
    }),
  ]);

  if (ownerALogin.error || ownerBLogin.error || viewerLogin.error ||
      !ownerALogin.data.user || !ownerBLogin.data.user || !viewerLogin.data.user ||
      !ownerALogin.data.session?.access_token || !ownerBLogin.data.session?.access_token ||
      !viewerLogin.data.session?.access_token) {
    finishExpectedPreflightUnavailable('AUTHENTICATION_UNAVAILABLE', matrix);
    return;
  }

  const ownerAUserId = ownerALogin.data.user.id;
  const ownerBUserId = ownerBLogin.data.user.id;
  const viewerUserId = viewerLogin.data.user.id;
  const ownerAToken = ownerALogin.data.session.access_token;
  const ownerBToken = ownerBLogin.data.session.access_token;
  const viewerToken = viewerLogin.data.session.access_token;
  const realDistinctSessions = ownerAToken !== ownerBToken &&
    ownerAToken !== viewerToken && ownerBToken !== viewerToken;

  if (ownerAUserId !== ownerBUserId || viewerUserId === ownerAUserId ||
      !realDistinctSessions) {
    finishExpectedPreflightUnavailable('PREFLIGHT_IDENTITY_UNAVAILABLE', matrix);
    return;
  }

  const [ownerAProfile, ownerBProfile, viewerProfile] = await Promise.all([
    profileFor(ownerAClient, ownerAUserId),
    profileFor(ownerBClient, ownerBUserId),
    profileFor(viewerClient, viewerUserId),
  ]);
  if (!ownerAProfile || !ownerBProfile || !viewerProfile) {
    finishExpectedPreflightUnavailable('PREFLIGHT_PROFILE_UNAVAILABLE', matrix);
    return;
  }
  const profilesReady =
    typeof ownerAProfile.id === 'string' && typeof ownerBProfile.id === 'string' &&
    typeof viewerProfile.id === 'string' &&
    ownerAProfile.id !== viewerProfile.id &&
    ownerAProfile.user_id === ownerAUserId && ownerBProfile.user_id === ownerBUserId &&
    viewerProfile.user_id === viewerUserId &&
    ownerAProfile.is_active === true && ownerBProfile.is_active === true &&
    viewerProfile.is_active === true &&
    ownerAProfile.role === 'admin' && ownerBProfile.role === 'admin' &&
    viewerProfile.role === 'viewer' &&
    ownerAProfile.org_id === expectedOrgId &&
    ownerBProfile.org_id === expectedOrgId &&
    viewerProfile.org_id === expectedOrgId &&
    isDeepStrictEqual(ownerAProfile, ownerBProfile);
  if (!profilesReady) {
    finishExpectedPreflightUnavailable('PREFLIGHT_PROFILE_UNAVAILABLE', matrix);
    return;
  }

  matrix.owner_two_session_auth = 'PASS';

  const ownerProfileId = ownerAProfile.id as string;
  const viewerProfileId = viewerProfile.id as string;
  const tag = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const draftV1 = printableFixture(1, tag);
  const draftV2 = printableFixture(2, tag);
  const staleDraftV3: SupplierOrderPayload = {
    ...draftV2,
    order: { ...draftV2.order, remarks: 'STALE TAB MUST NOT OVERWRITE' },
  };

  liveWritesStarted = true;
  const draftSectionStart = liveFailed;
  const draftCreate = await ownerAClient.from('commercial_supplier_order_drafts').insert({
    org_id: expectedOrgId,
    owner_profile_id: ownerProfileId,
    updated_by_profile_id: ownerProfileId,
    draft_json: draftV1,
    supplier_name: draftV1.order.supplier,
  }).select('id,revision').single();
  const draftId = (rowData(draftCreate)?.id as string | undefined) || '';
  if (!checkLive(!draftCreate.error && !!draftId && rowData(draftCreate)?.revision === 1,
      'draft creation must create owner-owned revision 1')) {
    matrix.draft_create_and_revision_conflict = 'FAIL';
    finish('FAIL', matrix);
    return;
  }

  const ownerBDraftRead = await ownerBClient.from('commercial_supplier_order_drafts')
    .select('id,revision')
    .eq('id', draftId)
    .maybeSingle();
  checkLive(!ownerBDraftRead.error && rowData(ownerBDraftRead)?.id === draftId,
    'the second independent owner sign-in must read the same owner-owned draft');

  const draftUpdate = await ownerAClient.from('commercial_supplier_order_drafts').update({
    draft_json: draftV2,
    supplier_name: draftV2.order.supplier,
    updated_by_profile_id: ownerProfileId,
    revision: 2,
  }).eq('id', draftId)
    .eq('org_id', expectedOrgId)
    .eq('owner_profile_id', ownerProfileId)
    .eq('revision', 1)
    .eq('status', 'active')
    .select('revision')
    .maybeSingle();
  checkLive(!draftUpdate.error && rowData(draftUpdate)?.revision === 2,
    'current draft revision must advance from 1 to 2');

  const staleDraftUpdate = await ownerAClient.from('commercial_supplier_order_drafts').update({
    draft_json: staleDraftV3,
    supplier_name: staleDraftV3.order.supplier,
    updated_by_profile_id: ownerProfileId,
    revision: 3,
  }).eq('id', draftId)
    .eq('org_id', expectedOrgId)
    .eq('owner_profile_id', ownerProfileId)
    .eq('revision', 1)
    .eq('status', 'active')
    .select('id');
  checkLive(noRowsAndNoError(staleDraftUpdate),
    'stale draft compare-and-swap must not update revision 2');

  const draftAfterStale = await ownerAClient.from('commercial_supplier_order_drafts')
    .select('revision,draft_json')
    .eq('id', draftId)
    .eq('status', 'active')
    .maybeSingle();
  checkLive(!draftAfterStale.error && rowData(draftAfterStale)?.revision === 2 &&
    isDeepStrictEqual(rowData(draftAfterStale)?.draft_json, draftV2),
    'stale tab must leave revision 2 content intact');

  const viewerDraftRead = await viewerClient.from('commercial_supplier_order_drafts')
    .select('id,draft_json')
    .eq('id', draftId)
    .maybeSingle();
  checkLive(nullRowAndNoError(viewerDraftRead),
    'same-org viewer RLS must hide the owner draft');

  const viewerDraftWrite = await viewerClient.from('commercial_supplier_order_drafts').update({
    draft_json: staleDraftV3,
    updated_by_profile_id: viewerProfileId,
    revision: 3,
  }).eq('id', draftId).select('id');
  checkLive(Array.isArray(viewerDraftWrite.data) && viewerDraftWrite.data.length === 0,
    'same-org viewer RLS must not update the owner draft');

  const viewerDraftInsert = await viewerClient.from('commercial_supplier_order_drafts').insert({
    org_id: expectedOrgId,
    owner_profile_id: viewerProfileId,
    updated_by_profile_id: viewerProfileId,
    draft_json: draftV1,
    supplier_name: draftV1.order.supplier,
  }).select('id');
  checkLive(!!viewerDraftInsert.error,
    'viewer role must not create supplier drafts under the actual RLS policy');
  matrix.draft_create_and_revision_conflict =
    liveFailed === draftSectionStart ? 'PASS' : 'FAIL';

  const liveV1 = printableFixture(1, tag);
  const liveV2 = printableFixture(2, tag);
  const checkedLiveV1 = validateSupplierOrder(liveV1);
  const checkedLiveV2 = validateSupplierOrder(liveV2);
  if (!checkedLiveV1.ok || !checkedLiveV2.ok ||
      checkedLiveV1.amountThousandths !== 1 ||
      checkedLiveV2.amountThousandths !== 1006) {
    matrix.exact_0_001_rmb_calculation = 'FAIL';
    finish('FAIL', matrix);
    return;
  }

  const v1RequestId = crypto.randomUUID();
  const v1Save = await ownerAClient.rpc('save_supplier_order_version', {
    p_request_id: v1RequestId,
    p_order_id: null,
    p_expected_version: 0,
    p_snapshot: checkedLiveV1.snapshot,
    p_total_thousandths: checkedLiveV1.amountThousandths,
  });
  const v1Row = rpcRow(v1Save);
  const orderId = typeof v1Row?.order_id === 'string' ? v1Row.order_id : '';
  if (!checkLive(!v1Save.error && v1Row?.version === 1 && !!orderId,
      'formal order must create immutable V1')) {
    matrix.formal_immutable_v1_v2_history = 'FAIL';
    finish('FAIL', matrix);
    return;
  }

  const v2RequestId = crypto.randomUUID();
  const v2Save = await ownerAClient.rpc('save_supplier_order_version', {
    p_request_id: v2RequestId,
    p_order_id: orderId,
    p_expected_version: 1,
    p_snapshot: checkedLiveV2.snapshot,
    p_total_thousandths: checkedLiveV2.amountThousandths,
  });
  const v2Row = rpcRow(v2Save);
  if (!checkLive(!v2Save.error && v2Row?.version === 2 && v2Row?.order_id === orderId,
      'formal order must append immutable V2 at expected version 1')) {
    matrix.formal_immutable_v1_v2_history = 'FAIL';
    finish('FAIL', matrix);
    return;
  }

  const fixtureHistory = await ownerAClient.from('commercial_supplier_order_versions')
    .select('id,version,snapshot,total_thousandths')
    .eq('order_id', orderId)
    .order('version', { ascending: true });
  const fixtureRows = rowsData(fixtureHistory);
  if (!checkLive(!fixtureHistory.error && fixtureRows.length === 2 &&
      rowMatchesFixture(versionRow(fixtureRows, 1), liveV1, 1) &&
      rowMatchesFixture(versionRow(fixtureRows, 2), liveV2, 1006),
      'the disposable fixture must be verified at immutable V1 and V2 before concurrency')) {
    matrix.formal_immutable_v1_v2_history = 'FAIL';
    finish('FAIL', matrix);
    return;
  }

  const concurrentSectionStart = liveFailed;
  const candidateA = printableFixture(2, `${tag}-CONCURRENT-A`);
  const candidateB = printableFixture(2, `${tag}-CONCURRENT-B`);
  const checkedCandidateA = validateSupplierOrder(candidateA);
  const checkedCandidateB = validateSupplierOrder(candidateB);
  if (!checkedCandidateA.ok || !checkedCandidateB.ok) {
    checkLive(false, 'concurrent V3 fixtures must pass shared snapshot validation');
    matrix.formal_concurrent_v2_to_v3 = 'FAIL';
    finish('FAIL', matrix);
    return;
  }

  const requestA = crypto.randomUUID();
  const requestB = crypto.randomUUID();
  const [concurrentAResult, concurrentBResult] = await Promise.all([
    ownerAClient.rpc('save_supplier_order_version', {
      p_request_id: requestA,
      p_order_id: orderId,
      p_expected_version: 2,
      p_snapshot: checkedCandidateA.snapshot,
      p_total_thousandths: checkedCandidateA.amountThousandths,
    }),
    ownerBClient.rpc('save_supplier_order_version', {
      p_request_id: requestB,
      p_order_id: orderId,
      p_expected_version: 2,
      p_snapshot: checkedCandidateB.snapshot,
      p_total_thousandths: checkedCandidateB.amountThousandths,
    }),
  ]);
  const candidates = [
    {
      requestId: requestA,
      payload: checkedCandidateA,
      result: concurrentAResult,
    },
    {
      requestId: requestB,
      payload: checkedCandidateB,
      result: concurrentBResult,
    },
  ];
  const winners = candidates.filter(candidate => {
    const row = rpcRow(candidate.result);
    return !candidate.result.error && row?.version === 3 && row?.order_id === orderId;
  });
  const conflicts = candidates.filter(candidate =>
    rpcErrorIs(candidate.result, 'VERSION_CONFLICT'));
  checkLive(requestA !== requestB,
    'the simultaneous writes must use distinct request UUIDs');
  checkLive(winners.length === 1 && conflicts.length === 1,
    'simultaneous expectedVersion=2 writes must produce exactly one V3 and one VERSION_CONFLICT');
  matrix.formal_concurrent_v2_to_v3 =
    liveFailed === concurrentSectionStart ? 'PASS' : 'FAIL';
  if (winners.length !== 1) {
    finish('FAIL', matrix);
    return;
  }

  const winner = winners[0];
  const winnerRow = rpcRow(winner.result)!;
  const replayStart = liveFailed;
  const replay = await ownerBClient.rpc('save_supplier_order_version', {
    p_request_id: winner.requestId,
    p_order_id: orderId,
    p_expected_version: 2,
    p_snapshot: winner.payload.snapshot,
    p_total_thousandths: winner.payload.amountThousandths,
  });
  const replayRow = rpcRow(replay);
  checkLive(!replay.error && replayRow?.version === 3 &&
    replayRow?.order_id === winnerRow.order_id &&
    replayRow?.saved_at === winnerRow.saved_at,
    'replaying the winning request UUID and payload must return the same V3');

  const historyRead = await ownerAClient.from('commercial_supplier_order_versions')
    .select('id,version,snapshot,total_thousandths,saved_at')
    .eq('order_id', orderId)
    .order('version', { ascending: true });
  const history = rowsData(historyRead);
  const historyV1 = versionRow(history, 1);
  const historyV2 = versionRow(history, 2);
  const historyV3 = versionRow(history, 3);
  checkLive(!historyRead.error && history.length === 3 &&
    historyV1?.id === v1RequestId && historyV2?.id === v2RequestId &&
    historyV3?.id === winner.requestId,
    'history after concurrency and replay must contain exactly V1, V2 and the winning V3');
  checkLive(rowMatchesFixture(historyV1, liveV1, 1) &&
    rowMatchesFixture(historyV2, liveV2, 1006),
    'V1 and V2 immutable snapshots and amounts must remain unchanged');
  checkLive(historyV3?.total_thousandths === winner.payload.amountThousandths &&
    isDeepStrictEqual(historyV3.snapshot, winner.payload.snapshot),
    'winning V3 must persist its exact payload');
  matrix.idempotent_winner_replay =
    liveFailed === replayStart && history.length === 3 ? 'PASS' : 'FAIL';
  matrix.formal_immutable_v1_v2_history =
    liveFailed === concurrentSectionStart ? 'PASS' : 'FAIL';

  const orderRead = await ownerAClient.from('commercial_supplier_orders')
    .select('latest_version')
    .eq('id', orderId)
    .maybeSingle();
  checkLive(!orderRead.error && rowData(orderRead)?.latest_version === 3,
    'latest version must remain V3 after the concurrent conflict and UUID replay');

  const directVersionMutation = await ownerAClient.from('commercial_supplier_order_versions')
    .update({ supplier_name: 'FORGED' })
    .eq('order_id', orderId)
    .eq('version', 1)
    .select('version');
  checkLive(!!directVersionMutation.error,
    'authenticated clients must not directly mutate archived versions');

  const viewerOrderRead = await viewerClient.from('commercial_supplier_orders')
    .select('id,latest_version')
    .eq('id', orderId)
    .maybeSingle();
  checkLive(nullRowAndNoError(viewerOrderRead),
    'same-org viewer RLS must hide the admin-owned formal order');

  const viewerHistoryRead = await viewerClient.from('commercial_supplier_order_versions')
    .select('version,snapshot')
    .eq('order_id', orderId);
  checkLive(noRowsAndNoError(viewerHistoryRead),
    'same-org viewer RLS must hide the admin-owned version history');

  const viewerRpcWrite = await viewerClient.rpc('save_supplier_order_version', {
    p_request_id: crypto.randomUUID(),
    p_order_id: orderId,
    p_expected_version: 3,
    p_snapshot: checkedLiveV1.snapshot,
    p_total_thousandths: checkedLiveV1.amountThousandths,
  });
  checkLive(rpcErrorIs(viewerRpcWrite, 'NOT_AUTHORIZED'),
    'viewer must not invoke the formal-order writer');
  matrix.cross_user_rls_contract =
    liveFailed === concurrentSectionStart ? 'PASS' : 'FAIL';

  const finalHistory = await ownerAClient.from('commercial_supplier_order_versions')
    .select('version,snapshot,total_thousandths')
    .eq('order_id', orderId)
    .order('version', { ascending: true });
  const finalRows = rowsData(finalHistory);
  checkLive(!finalHistory.error && finalRows.length === 3 &&
    finalRows.map(row => row.version).join(',') === '1,2,3',
    'denied viewer writes must leave history at exactly V1, V2 and V3');

  const archivedV1 = historyV1?.snapshot as SupplierOrderPayload | undefined;
  const archivedV2 = historyV2?.snapshot as SupplierOrderPayload | undefined;
  const archivedPrintV1 = archivedV1 ? buildSupplierOrderPrintableSnapshot(archivedV1) : null;
  const archivedPrintV2 = archivedV2 ? buildSupplierOrderPrintableSnapshot(archivedV2) : null;
  const moneySectionStart = liveFailed;
  checkLive(historyV1?.total_thousandths === 1 && formatSupplierMoney(1) === '0.001' &&
    !!archivedPrintV1 && archivedPrintV1.totalThousandths === BigInt(1) &&
    formatSupplierMoney(archivedPrintV1.totalThousandths) === '0.001',
    'archived V1 must retain the exact 0.001 RMB amount');
  checkLive(historyV2?.total_thousandths === 1006 &&
    !!archivedPrintV2 && archivedPrintV2.totalThousandths === BigInt(1006) &&
    formatSupplierMoney(archivedPrintV2.totalThousandths) === '1.006',
    'archived V2 must retain its exact independently calculated amount');
  matrix.exact_0_001_rmb_calculation =
    liveFailed === moneySectionStart ? 'PASS' : 'FAIL';

  const printSectionStart = liveFailed;
  checkLive(!!archivedPrintV1 && isDeepStrictEqual(archivedPrintV1.order, liveV1.order) &&
    isDeepStrictEqual(archivedPrintV1.lines.map(line => line.line), liveV1.lines),
    'V1 archived print output must preserve every frozen order and line field');
  checkLive(!!archivedPrintV2 && isDeepStrictEqual(archivedPrintV2.order, liveV2.order) &&
    isDeepStrictEqual(archivedPrintV2.lines.map(line => line.line), liveV2.lines),
    'V2 archived print output must preserve its own frozen order and line fields');
  checkLive(!isDeepStrictEqual(archivedPrintV1, archivedPrintV2),
    'V1 and V2 printable output must not collapse to the same snapshot');
  matrix.printable_historical_snapshot_parity =
    liveFailed === printSectionStart ? 'PASS' : 'FAIL';

  const cleanup = await ownerAClient.from('commercial_supplier_order_drafts').update({
    status: 'deleted',
    revision: 3,
    updated_by_profile_id: ownerProfileId,
    updated_at: new Date().toISOString(),
  }).eq('id', draftId)
    .eq('owner_profile_id', ownerProfileId)
    .eq('revision', 2)
    .select('id');
  if (!checkLive(!cleanup.error && Array.isArray(cleanup.data) && cleanup.data.length === 1,
      'synthetic active draft must be soft-deleted after the run')) {
    matrix.draft_create_and_revision_conflict = 'FAIL';
  }

  if (liveFailed === 0 && LIVE_MATRIX_ROWS.every(row => matrix[row] === 'PASS')) {
    console.log('LIVE_E2E_NOTE: immutable synthetic formal versions remain by design in the disposable QA database');
    finish('PASS', matrix);
  } else {
    finish('FAIL', matrix);
  }
}

function fixtureEnvironment(mode: HarnessFixtureMode): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    [HARNESS_FIXTURE_MODE_ENV]: mode,
  };
  for (const key of ['PATH', 'TMPDIR', 'TMP', 'TEMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function fixtureResult(stdout: string): Record<string, unknown> | null {
  const prefix = 'CSO_NONPROD_E2E_RESULT=';
  const line = stdout.split('\n').find(candidate => candidate.startsWith(prefix));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(prefix.length)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runHarnessFixture(mode: HarnessFixtureMode) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(import.meta.url)],
    {
      cwd: process.cwd(),
      env: fixtureEnvironment(mode),
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
}

function runDeterministicExceptionFixtures(): void {
  const missingCredentials = runHarnessFixture('missing-credentials');
  const missingCredentialsResult = fixtureResult(missingCredentials.stdout);
  const missingMatrix = missingCredentialsResult?.matrix as Record<string, unknown> | undefined;
  checkStatic(
    !missingCredentials.error && missingCredentials.status === 0 &&
      missingCredentialsResult?.live_e2e === 'NOT_VERIFIED' &&
      missingCredentialsResult.mode === 'SAFE_DRY_RUN' &&
      missingCredentialsResult.fixture_mode === 'missing-credentials' &&
      LIVE_MATRIX_ROWS.every(row => missingMatrix?.[row] === 'NOT_VERIFIED'),
    'fixture: missing credentials must take the zero-write NOT_VERIFIED path',
  );

  const unexpectedStatic = runHarnessFixture('unexpected-static');
  const unexpectedStaticResult = fixtureResult(unexpectedStatic.stdout);
  checkStatic(
    !unexpectedStatic.error && unexpectedStatic.status === 1 &&
      unexpectedStaticResult?.live_e2e === 'FAIL' &&
      unexpectedStaticResult.fixture_mode === 'unexpected-static',
    'fixture: an unexpected static exception must emit sanitized FAIL and exit 1',
  );

  const unexpectedAfterWrite = runHarnessFixture('unexpected-after-write-checkpoint');
  const unexpectedAfterWriteResult = fixtureResult(unexpectedAfterWrite.stdout);
  checkStatic(
    !unexpectedAfterWrite.error && unexpectedAfterWrite.status === 1 &&
      unexpectedAfterWriteResult?.live_e2e === 'FAIL' &&
      unexpectedAfterWriteResult.mode === 'LIVE_WRITES_ATTEMPTED' &&
      unexpectedAfterWriteResult.fixture_mode === 'unexpected-after-write-checkpoint',
    'fixture: an unexpected post-write checkpoint exception must emit FAIL and exit 1',
  );
}

async function main(): Promise<void> {
  console.log('\n=== Commercial Supplier Orders Isolated Nonproduction E2E ===');
  const matrix = emptyMatrix();
  activeMatrix = matrix;
  const requestedFixtureMode = process.env[HARNESS_FIXTURE_MODE_ENV];
  activeFixtureMode = HARNESS_FIXTURE_MODES.includes(
    requestedFixtureMode as HarnessFixtureMode,
  ) ? requestedFixtureMode as HarnessFixtureMode : null;

  if (activeFixtureMode === 'unexpected-static') {
    throw new Error('synthetic static exception fixture');
  }
  if (activeFixtureMode === 'unexpected-after-write-checkpoint') {
    liveWritesStarted = true;
    await runWithUnexpectedFailureGuard(async () => {
      throw new Error('synthetic post-write exception fixture');
    }, matrix);
    return;
  }
  if (activeFixtureMode === 'missing-credentials') {
    const gate = evaluateCsoLiveGate({});
    if (gate.allowed) {
      checkStatic(false, 'fixture: an empty credential gate must remain closed');
      finish('NOT_VERIFIED', matrix);
      return;
    }
    console.log(`LIVE_E2E_GATE: CLOSED (${gate.reasons.join('; ')})`);
    finish('NOT_VERIFIED', matrix);
    return;
  }

  const v1 = printableFixture(1, 'DETERMINISTIC');
  const v2 = printableFixture(2, 'DETERMINISTIC');
  const checkedV1 = validateSupplierOrder(v1);
  const checkedV2 = validateSupplierOrder(v2);
  checkStatic(checkedV1.ok && checkedV1.amountThousandths === 1,
    'deterministic V1 total must be exactly 0.001 RMB');
  checkStatic(checkedV2.ok && checkedV2.amountThousandths === 1006,
    'deterministic V2 total must calculate exactly as 1.006 RMB');
  const printableV1 = buildSupplierOrderPrintableSnapshot(v1);
  const printableV2 = buildSupplierOrderPrintableSnapshot(v2);
  checkStatic(printableV1.order.supplier === v1.order.supplier &&
    printableV1.lines[0].line.name === v1.lines[0].name &&
    formatSupplierMoney(printableV1.totalThousandths) === '0.001',
    'V1 print model must preserve its immutable snapshot and 0.001 RMB amount');
  checkStatic(printableV2.order.supplier === v2.order.supplier &&
    printableV2.lines[0].line.name === v2.lines[0].name &&
    formatSupplierMoney(printableV2.totalThousandths) === '1.006',
    'V2 print model must preserve its own snapshot rather than V1');

  runDeterministicExceptionFixtures();

  if (staticFailed > 0) {
    finish('NOT_VERIFIED', matrix);
    return;
  }

  const gate = evaluateCsoLiveGate(process.env);
  if (!gate.allowed) {
    console.log(`LIVE_E2E_GATE: CLOSED (${gate.reasons.join('; ')})`);
    finish('NOT_VERIFIED', matrix);
    return;
  }

  const expectedOrgId = process.env.LIVE_TEST_EXPECTED_ORG_ID!.trim();
  await runWithUnexpectedFailureGuard(
    () => runLive(process.env, matrix, expectedOrgId),
    matrix,
  );
}

main().catch(() => {
  recordUnexpectedFailure();
});
