import fs from 'node:fs';
import {
  CaseApiError,
  fetchCaseAudit,
  parseCaseAuditResponse,
} from '../../src/lib/review-center/case-api-client';
import {
  appendAuditItems,
  canCommitAuditResponse,
  canReleaseAuditRequest,
  nextAuditOffset,
  planAuditRequest,
  shouldRefetchAuditPage1,
} from '../../src/lib/review-center/case-audit';
import type { CaseAuditItem } from '../../src/lib/review-center/case-schemas';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

const CASE_NO = 'CASE-2026-000001';
const AUDIT_URL = '/api/review-center/cases/CASE-2026-000001/audit';

function auditItem(overrides: Partial<CaseAuditItem> = {}): CaseAuditItem {
  return {
    action: 'CASE_UPDATED',
    versionBefore: 7,
    versionAfter: 8,
    actorDisplayName: '测试用户',
    createdAt: '2026-08-27T10:00:00+08:00',
    safeChangeSummary: {
      changedFields: ['summary'],
      fromStatus: 'DRAFT',
      toStatus: 'DRAFT',
      sourceReviewVersion: 11,
      publishKind: null,
      status: null,
    },
    ...overrides,
  };
}

function auditEnvelope(
  items: CaseAuditItem[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    data: {
      items,
      limit: 30,
      offset: 0,
      hasMore: false,
      ...overrides,
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).fetch = handler;
}

console.log('\n=== Case UI Slice 3C ===');

// ---- Client: method/url/page size/signal ----
{
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  let capturedSignal: AbortSignal | null | undefined;
  stubFetch(async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    capturedSignal = init?.signal;
    return jsonResponse(200, auditEnvelope([], { limit: 30, offset: 0, hasMore: false }));
  });
  const controller = new AbortController();
  const result = await fetchCaseAudit(CASE_NO, { limit: 30, offset: 0 }, { signal: controller.signal });
  assert(capturedUrl === `${AUDIT_URL}?limit=30&offset=0`, 'audit client builds limit/offset URL');
  assert((capturedInit?.method ?? 'GET') === 'GET', 'audit client uses GET');
  assert(capturedSignal === controller.signal, 'audit client forwards AbortSignal');
  assert(result.items.length === 0 && result.hasMore === false && result.limit === 30 && result.offset === 0, 'audit client parses valid envelope');
  assert(typeof (globalThis as any).fetch === 'function', 'fetch stub installed');
}

// ---- Client: valid parse / wrong envelopes ----
{
  const parsed = parseCaseAuditResponse(auditEnvelope([auditItem()]));
  assert(parsed.items.length === 1 && parsed.items[0].action === 'CASE_UPDATED', 'audit parser accepts valid item');

  const wrongEnvelopes: Array<[Record<string, unknown>, string]> = [
    [{ ok: false, data: auditEnvelope([]) }, 'ok false rejected'],
    [{ data: auditEnvelope([]) }, 'missing ok rejected'],
    [{ ok: true }, 'missing data rejected'],
    [{ ok: true, data: { items: 'x', limit: 30, offset: 0, hasMore: false } }, 'non-array items rejected'],
    [{ ok: true, data: { items: [], limit: 0, offset: 0, hasMore: false } }, 'limit below 1 rejected'],
    [{ ok: true, data: { items: [], limit: 51, offset: 0, hasMore: false } }, 'limit above 50 rejected'],
    [{ ok: true, data: { items: [], limit: 30, offset: 100001, hasMore: false } }, 'offset above 100000 rejected'],
    [{ ok: true, data: { items: [], limit: 30, offset: 0, hasMore: 'yes' } }, 'hasMore non-boolean rejected'],
  ];
  for (const [body, label] of wrongEnvelopes) {
    let threw = false;
    try {
      parseCaseAuditResponse(body);
    } catch (error) {
      threw = error instanceof CaseApiError && error.code === 'INVALID_RESPONSE';
    }
    assert(threw, 'wrong envelope: ' + label);
  }

  const malformedItems: Array<[CaseAuditItem | Record<string, unknown>, string]> = [
    [{ ...auditItem(), action: 'CASE_DELETED' }, 'unknown action rejected'],
    [{ ...auditItem(), versionBefore: 0 }, 'versionBefore zero rejected'],
    [{ ...auditItem(), versionAfter: 0 }, 'versionAfter zero rejected'],
    [{ ...auditItem(), actorDisplayName: 42 }, 'actor non-string rejected'],
    [{ ...auditItem(), createdAt: 'not-a-date' }, 'createdAt invalid rejected'],
    [{ ...auditItem(), safeChangeSummary: { ...auditItem().safeChangeSummary, changedFields: 'x' } }, 'changedFields non-array rejected'],
    [{ ...auditItem(), safeChangeSummary: { ...auditItem().safeChangeSummary, sourceReviewVersion: -1 } }, 'sourceReviewVersion invalid rejected'],
    [{ ...auditItem(), safeChangeSummary: { ...auditItem().safeChangeSummary, status: 1 } }, 'status non-string rejected'],
  ];
  for (const [item, label] of malformedItems) {
    let threw = false;
    try {
      parseCaseAuditResponse(auditEnvelope([item as CaseAuditItem]));
    } catch (error) {
      threw = error instanceof CaseApiError && error.code === 'INVALID_RESPONSE';
    }
    assert(threw, 'malformed item: ' + label);
  }

  const baseData = { items: [], limit: 30, offset: 0, hasMore: false };
  const baseItem = auditItem();
  const unknownFieldEnvelopes: Array<[Record<string, unknown>, string]> = [
    [{ ok: true, data: baseData, unexpected: 'SENSITIVE_UNKNOWN_ROOT' }, 'root extra field rejected'],
    [{ ok: true, data: { ...baseData, unexpected: 'SENSITIVE_UNKNOWN_DATA' } }, 'data extra field rejected'],
    [{ ok: true, data: { ...baseData, items: [{ ...baseItem, unexpected: 'SENSITIVE_UNKNOWN_ITEM' }] } }, 'item extra field rejected'],
    [{
      ok: true,
      data: {
        ...baseData,
        items: [{ ...baseItem, safeChangeSummary: { ...baseItem.safeChangeSummary, unexpected: 'SENSITIVE_UNKNOWN_SUMMARY' } }],
      },
    }, 'safeChangeSummary extra field rejected'],
  ];
  for (const [body, label] of unknownFieldEnvelopes) {
    let threw = false;
    try {
      parseCaseAuditResponse(body);
    } catch (error) {
      threw = error instanceof CaseApiError && error.code === 'INVALID_RESPONSE';
    }
    assert(threw, 'unknown field: ' + label);
  }

  const missingSummaryKeys: Array<[string, unknown]> = [
    ['changedFields', { ...auditItem(), safeChangeSummary: { fromStatus: null, toStatus: null, sourceReviewVersion: null, publishKind: null, status: null } }],
    ['fromStatus', { ...auditItem(), safeChangeSummary: { changedFields: null, toStatus: null, sourceReviewVersion: null, publishKind: null, status: null } }],
    ['toStatus', { ...auditItem(), safeChangeSummary: { changedFields: null, fromStatus: null, sourceReviewVersion: null, publishKind: null, status: null } }],
    ['sourceReviewVersion', { ...auditItem(), safeChangeSummary: { changedFields: null, fromStatus: null, toStatus: null, publishKind: null, status: null } }],
    ['publishKind', { ...auditItem(), safeChangeSummary: { changedFields: null, fromStatus: null, toStatus: null, sourceReviewVersion: null, status: null } }],
    ['status', { ...auditItem(), safeChangeSummary: { changedFields: null, fromStatus: null, toStatus: null, sourceReviewVersion: null, publishKind: null } }],
  ];
  for (const [key, item] of missingSummaryKeys) {
    let threw = false;
    try {
      parseCaseAuditResponse(auditEnvelope([item as CaseAuditItem]));
    } catch (error) {
      threw = error instanceof CaseApiError && error.code === 'INVALID_RESPONSE';
    }
    assert(threw, 'missing safeChangeSummary key: ' + key);
  }

  let privacyThrew = false;
  try {
    parseCaseAuditResponse({ ok: true, data: baseData, unexpected: 'SENSITIVE_UNKNOWN_ROOT' });
  } catch (error) {
    privacyThrew = error instanceof CaseApiError
      && error.code === 'INVALID_RESPONSE'
      && !error.message.includes('SENSITIVE_UNKNOWN_ROOT');
  }
  assert(privacyThrew, 'INVALID_RESPONSE message hides unknown field value');
}

// ---- Client: http error privacy ----
{
  for (const status of [403, 404, 500]) {
    stubFetch(async () => jsonResponse(status, {
      ok: false,
      code: 'X',
      message: 'RAW_SERVER_SECRET',
      data: { secret: 'DO_NOT_LEAK' },
    }));
    let caught: CaseApiError | null = null;
    try {
      await fetchCaseAudit(CASE_NO, { limit: 30, offset: 0 });
    } catch (error) {
      caught = error as CaseApiError;
    }
    assert(caught !== null && caught.status === status, 'http error status ' + status);
    assert(caught !== null && !caught.message.includes('RAW_SERVER_SECRET') && !caught.message.includes('DO_NOT_LEAK'), 'raw server message hidden ' + status);
  }
}

// ---- Single-flight request planning ----
{
  assert(planAuditRequest(null, 'PAGE_1') === 'START', 'empty authority starts page1');
  assert(planAuditRequest('PAGE_1', 'PAGE_1') === 'BLOCK', 'double page1 blocked');
  assert(planAuditRequest('REFRESH', 'REFRESH') === 'BLOCK', 'double refresh blocked');
  assert(planAuditRequest('LOAD_MORE', 'LOAD_MORE') === 'BLOCK', 'double load more blocked');
  assert(planAuditRequest('PAGE_1', 'REFRESH') === 'BLOCK', 'refresh while page1 pending blocked');
  assert(planAuditRequest('REFRESH', 'PAGE_1') === 'BLOCK', 'page1 while refresh pending blocked');
  assert(planAuditRequest('PAGE_1', 'LOAD_MORE') === 'BLOCK', 'load more while page1 pending blocked');
  assert(planAuditRequest('REFRESH', 'LOAD_MORE') === 'BLOCK', 'load more while refresh pending blocked');
  assert(planAuditRequest('LOAD_MORE', 'REFRESH') === 'SUPERSEDE', 'refresh supersedes load more');
}

// ---- Supersede ownership runtime oracle ----
{
  interface SimRequest {
    requestId: number;
    kind: 'PAGE_1' | 'REFRESH' | 'LOAD_MORE';
  }
  const state: { current: SimRequest | null } = { current: null };
  const start = (kind: SimRequest['kind']) => {
    const plan = planAuditRequest(state.current?.kind ?? null, kind);
    if (plan === 'BLOCK') return false;
    const requestId = Math.floor(Math.random() * 1_000_000) + 1;
    state.current = { requestId, kind };
    return state.current;
  };

  const loadMore = start('LOAD_MORE');
  assert(loadMore !== false && loadMore.kind === 'LOAD_MORE', 'A load more starts');
  const loadMoreId = loadMore === false ? -1 : loadMore.requestId;
  const refresh = start('REFRESH');
  assert(refresh !== false && refresh.kind === 'REFRESH', 'B refresh supersedes A');
  const refreshId = refresh === false ? -1 : refresh.requestId;
  assert(loadMoreId !== refreshId, 'B gets new request identity');
  assert(canReleaseAuditRequest(state.current?.requestId ?? null, loadMoreId) === false, 'A finally cannot release B authority');
  assert(canReleaseAuditRequest(state.current?.requestId ?? null, refreshId) === true, 'B owns current authority');
  assert(start('REFRESH') === false, 'C refresh while B pending blocked');
}

// ---- Version commit guard ----
{
  assert(canCommitAuditResponse(7, 8, 1, 1, 2, 2) === false, 'captured v7 latest v8 cannot commit');
  assert(canCommitAuditResponse(7, 7, 1, 2, 2, 2) === false, 'generation changed cannot commit');
  assert(canCommitAuditResponse(7, 7, 1, 1, 2, 3) === false, 'ownership changed cannot commit');
  assert(canCommitAuditResponse(7, 7, 1, 1, 2, 2) === true, 'aligned authorities commit');
}

// ---- Version race: cache preserved, no new request ----
{
  const versionRace = canCommitAuditResponse(7, 8, 1, 1, 2, 2);
  assert(versionRace === false, 'v7 response cannot commit to v8');
  assert(shouldRefetchAuditPage1(7, 8, [auditItem()]) === true, 'stale cache requires page1 on reopen');
  assert(shouldRefetchAuditPage1(8, 8, [auditItem()]) === false, 'fresh same-version cache reuses');
  assert(shouldRefetchAuditPage1(null, 8, []) === true, 'never loaded requires fetch');
}

// ---- Offset oracle + no dedupe ----
{
  assert(nextAuditOffset(0, 30) === 30, 'offset oracle 0+30=30');
  assert(nextAuditOffset(30, 12) === 42, 'offset oracle 30+12=42');
  const first = [auditItem()];
  const second = [auditItem()];
  const appended = appendAuditItems(first, second);
  assert(appended.length === 2, 'duplicate-looking rows both preserved');
}

// ---- Load more failure / pagination race ----
{
  assert(canCommitAuditResponse(7, 7, 5, 6, 2, 2) === false, 'load more epoch A invalid after refresh epoch B');
  assert(canCommitAuditResponse(7, 7, 5, 5, 2, 2) === true, 'load more epoch A valid before refresh');
  assert(nextAuditOffset(30, 0) === 30, 'failed load more keeps next offset');
}

// ---- Source wiring guards ----
{
  const panelSource = fs.readFileSync('src/components/review-center/case/CaseAuditPanel.tsx', 'utf8');
  const auditHelperSource = fs.readFileSync('src/lib/review-center/case-audit.ts', 'utf8');
  const manageSource = fs.readFileSync('src/app/review-center/cases/[caseNo]/manage/page.tsx', 'utf8');
  const clientSource = fs.readFileSync('src/lib/review-center/case-api-client.ts', 'utf8');

  assert(panelSource.includes("planAuditRequest(") && panelSource.includes("canReleaseAuditRequest("), 'panel uses production planning helpers');
  assert(panelSource.includes('shouldRefetchAuditPage1('), 'panel uses lazy freshness helper');
  assert(panelSource.includes('mutationInFlight') && !panelSource.includes('mutationLockRef'), 'panel receives mutation flag without mutation lock');
  assert(panelSource.includes('latestCaseVersionRef.current = currentCaseVersion'), 'panel syncs latest version ref in render');
  assert(panelSource.includes('操作记录') && panelSource.includes('刷新记录') && panelSource.includes('加载更多'), 'panel user-facing labels');
  assert(panelSource.includes('role="alert"') && panelSource.includes('aria-expanded') && panelSource.includes('aria-busy'), 'panel accessibility hooks');
  assert(!panelSource.includes('JSON.stringify'), 'panel no raw JSON render');
  assert(!panelSource.includes('actorProfileId') && !panelSource.includes('sourceReviewId') && !panelSource.includes('caseId'), 'panel no internal UUID render');
  assert(!panelSource.includes('fetchCaseAdminDetail') && !panelSource.includes('updateCase(') && !panelSource.includes('publishCase('), 'panel no admin/mutation coupling');

  for (const token of ['mutationLockRef', 'runExclusiveOnce']) {
    assert(!auditHelperSource.includes(token), 'audit helper no mutation lock: ' + token);
  }
  assert(!auditHelperSource.includes('fetch(') && !auditHelperSource.includes('useState') && !auditHelperSource.includes('useEffect'), 'audit helper pure only');

  assert(manageSource.includes('<CaseAuditPanel'), 'manage page renders audit panel');
  assert(manageSource.indexOf('<CaseAuditPanel') > manageSource.indexOf('fetchCaseAdminDetail'), 'audit panel is additive after admin shell');

  assert(panelSource.includes('fetchCaseAudit('), 'panel calls audit client');
  const auditClientStart = clientSource.indexOf('export async function fetchCaseAudit(');
  const auditClientEnd = clientSource.indexOf('function parseOptionArray');
  const auditClientBlock = clientSource.slice(auditClientStart, auditClientEnd);
  assert(!auditClientBlock.includes('method: '), 'audit client block read-only');

  const initialRenderRange = manageSource.slice(0, manageSource.indexOf('function handleManualRefresh()'));
  assert(!initialRenderRange.includes('fetchCaseAudit'), 'manage initial render does not fetch audit');
  assert(panelSource.includes("if (next && shouldRefetchAuditPage1"), 'lazy fetch only on explicit open');
}

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
