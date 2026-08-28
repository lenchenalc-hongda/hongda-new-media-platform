import fs from 'node:fs';
import {
  CaseApiError,
  buildCaseLibraryQueryString,
  fetchCaseLibrary,
  fetchCaseMetadataOptions,
  fetchCasePublicDetail,
  parseCaseLibraryResponse,
  parseCasePublicDetailResponse,
  parseMetadataOptionsResponse,
} from '../../src/lib/review-center/case-api-client';
import {
  buildCaseMetadataDisplay,
  caseDateToIsoDate,
  caseRiskBadgeClass,
  caseRiskLabel,
  caseReviewTypeLabel,
  formatCaseDate,
  formatCaseDateTime,
} from '../../src/lib/review-center/case-presentation';
import { parseCaseLibraryQuery } from '../../src/lib/review-center/case-schemas';
import type { CaseLibraryQuery, CasePublicDetail } from '../../src/lib/review-center/case-schemas';

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

const libraryItem = {
  caseNo: CASE_NO,
  title: 'case title',
  summary: 'summary',
  lessonSummary: 'lesson',
  preventionSummary: 'prevention',
  applicabilityNotes: 'notes',
  reviewType: 'A',
  risk: 'RED',
  occurredAt: '2026-08-01T00:00:00Z',
  publishedAt: '2026-08-27T00:00:00Z',
  metadata: {
    materials: [
      { code: 'ABS', label: 'ABS', isPrimary: false },
      { code: 'PP', label: 'PP', isPrimary: true },
    ],
    processes: [{ code: 'FILM_MAKING', label: '制膜' }],
    problemDomains: [{ code: 'PROCESS', label: '生产' }],
    problemSymptoms: [{ code: 'TRANSFER_INCOMPLETE', label: '转移不完整' }],
    materialOtherText: null,
    processOtherText: null,
    problemDomainOtherText: null,
    problemSymptomOtherText: null,
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).fetch = handler;
}

console.log('\n=== Case UI Slice 1 ===');

// Query serializer + server contract
const isoFrom = caseDateToIsoDate('2026-08-01', false);
const isoTo = caseDateToIsoDate('2026-08-31', true);
assert(isoFrom !== null && isoTo !== null, 'date iso generated');

const query: CaseLibraryQuery = {
  q: '100%_ABS 中文',
  materialCodes: ['PP', 'ABS'],
  processCodes: ['FILM_MAKING'],
  problemDomainCodes: ['PROCESS'],
  problemSymptomCodes: ['TRANSFER_INCOMPLETE'],
  reviewTypes: ['A'],
  riskLevels: ['RED'],
  publishedFrom: isoFrom,
  publishedTo: isoTo,
  limit: 30,
  offset: 60,
};

const queryString = buildCaseLibraryQueryString(query);
const params = new URLSearchParams(queryString);
assert(params.get('q') === '100%_ABS 中文', 'q literal with percent/underscore/space/chinese preserved');
assert(JSON.stringify(params.getAll('material')) === '["PP","ABS"]', 'material repeated params');
assert(!queryString.includes('PP,ABS'), 'material not comma list');
assert(JSON.stringify(params.getAll('process')) === '["FILM_MAKING"]', 'process repeated params');
assert(JSON.stringify(params.getAll('problemDomain')) === '["PROCESS"]', 'problemDomain repeated params');
assert(JSON.stringify(params.getAll('problemSymptom')) === '["TRANSFER_INCOMPLETE"]', 'problemSymptom repeated params');
assert(params.get('reviewType') === 'A' && params.get('risk') === 'RED', 'reviewType/risk single value');
assert(params.get('limit') === '30' && params.get('offset') === '60', 'limit/offset params');
assert(params.get('publishedFrom') === isoFrom && params.get('publishedTo') === isoTo, 'date params serialized');

const parsed = parseCaseLibraryQuery(params);
assert(parsed.ok, 'serialized query accepted by sealed parser');
assert(
  parsed.ok
    && parsed.data.q === '100%_ABS 中文'
    && JSON.stringify(parsed.data.materialCodes) === '["PP","ABS"]'
    && parsed.data.reviewTypes[0] === 'A'
    && parsed.data.riskLevels[0] === 'RED'
    && parsed.data.limit === 30
    && parsed.data.offset === 60,
  'parsed query values match original',
);

// API client: library success
stubFetch(async () => jsonResponse(200, {
  ok: true,
  data: { items: [libraryItem], limit: 30, offset: 0, hasMore: true },
}));
const libraryResult = await fetchCaseLibrary({ ...query, offset: 0 });
assert(libraryResult.items.length === 1 && libraryResult.items[0].caseNo === CASE_NO, 'library success parsed');
assert(libraryResult.hasMore === true && libraryResult.limit === 30 && libraryResult.offset === 0, 'library pagination fields parsed');

const parsedLibrary = parseCaseLibraryResponse({
  ok: true,
  data: { items: [libraryItem], limit: 30, offset: 0, hasMore: false },
});
assert(parsedLibrary.items[0].title === 'case title' && parsedLibrary.hasMore === false, 'library response parser');

// API client: detail success
stubFetch(async () => jsonResponse(200, { ok: true, data: libraryItem }));
const detailResult: CasePublicDetail = await fetchCasePublicDetail(CASE_NO);
assert(detailResult.caseNo === CASE_NO && detailResult.title === 'case title', 'detail success parsed');

const parsedDetail = parseCasePublicDetailResponse({ ok: true, data: libraryItem });
assert(parsedDetail.lessonSummary === 'lesson' && parsedDetail.metadata.materials.length === 2, 'detail response parser');

// API client: malformed responses
stubFetch(async () => jsonResponse(200, { ok: true, data: { items: 'bad' } }));
try {
  await fetchCaseLibrary({ ...query, offset: 0 });
  assert(false, 'malformed library should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed library safe error');
  assert(error instanceof CaseApiError && error.message === '案例数据格式异常', 'malformed library local message');
}

stubFetch(async () => jsonResponse(200, { ok: true, data: { caseNo: 'x' } }));
try {
  await fetchCasePublicDetail(CASE_NO);
  assert(false, 'malformed detail should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed detail safe error');
}

// API client: HTTP error normalization
for (const status of [401, 403, 404, 500]) {
  stubFetch(async () => jsonResponse(status, {
    ok: false,
    code: 'X',
    message: 'RAW_SECRET_DB_MESSAGE',
    data: { secret: 'DO_NOT_LEAK' },
  }));
  try {
    await fetchCaseLibrary({ ...query, offset: 0 });
    assert(false, 'http error should throw: ' + status);
  } catch (error) {
    assert(error instanceof CaseApiError && error.status === status, 'http error status ' + status);
    assert(error instanceof CaseApiError && error.code === 'X', 'http error code ' + status);
    assert(error instanceof CaseApiError && (error.safeData as { secret: string }).secret === 'DO_NOT_LEAK', 'http error safeData preserved ' + status);
    assert(error instanceof CaseApiError && !error.message.includes('RAW_SECRET_DB_MESSAGE'), 'raw db message not in UI message ' + status);
    assert(error instanceof CaseApiError && !error.message.includes('DO_NOT_LEAK'), 'raw error data not in UI message ' + status);
  }
}

stubFetch(async () => jsonResponse(404, { ok: false, code: 'NOT_FOUND', message: 'raw', data: null }));
try {
  await fetchCasePublicDetail(CASE_NO);
  assert(false, 'detail 404 should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.status === 404 && error.message === '案例不存在或当前不可查看', 'detail 404 privacy message');
}

// API client: network error
stubFetch(async () => {
  throw new Error('network down');
});
try {
  await fetchCaseLibrary({ ...query, offset: 0 });
  assert(false, 'network error should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.status === 0 && error.code === 'NETWORK_ERROR', 'network error normalized');
}

// Metadata options client
stubFetch(async () => jsonResponse(200, {
  ok: true,
  code: 'OK',
  message: 'success',
  data: {
    materials: [{ code: 'PP', label: 'PP', description: null, sortOrder: 1 }],
    processes: [],
    problemDomains: [],
    problemSymptoms: [],
  },
}));
const options = await fetchCaseMetadataOptions();
assert(options.materials[0].code === 'PP' && options.materials[0].label === 'PP', 'metadata options parsed');

const parsedOptions = parseMetadataOptionsResponse({
  ok: true,
  data: {
    materials: [],
    processes: [{ code: 'X', label: 'X', description: 'd', sortOrder: 2 }],
    problemDomains: [],
    problemSymptoms: [],
  },
});
assert(parsedOptions.processes[0].description === 'd' && parsedOptions.processes[0].sortOrder === 2, 'metadata options parser');

try {
  parseMetadataOptionsResponse({ ok: true, data: { materials: 'bad' } });
  assert(false, 'malformed options should throw');
} catch (error) {
  assert(error instanceof CaseApiError && error.code === 'INVALID_RESPONSE', 'malformed options safe error');
}

// Presentation helpers
assert(caseRiskLabel('RED') === '高' && caseRiskLabel('YELLOW') === '中' && caseRiskLabel('GREEN') === '低', 'risk labels');
assert(caseRiskLabel(null) === '未评级' && caseRiskLabel('FUTURE') === 'FUTURE', 'risk unknown safe fallback');
assert(caseRiskBadgeClass('RED') === 'badge-red' && caseRiskBadgeClass('FUTURE') === 'badge-gray', 'risk badge classes');
assert(caseReviewTypeLabel('A') === 'A 类' && caseReviewTypeLabel('C') === 'C 类', 'review type labels');
assert(caseReviewTypeLabel('FUTURE') === 'FUTURE' && caseReviewTypeLabel(null) === '未知类型', 'review type unknown safe fallback');
assert(formatCaseDate(null) === '-' && formatCaseDate('not-a-date') === '-', 'date safe formatting');
assert(formatCaseDateTime(libraryItem.publishedAt).includes('2026-08-27'), 'datetime formatting');

const display = buildCaseMetadataDisplay(libraryItem.metadata);
assert(display.materials[0].code === 'PP' && display.materials[0].primary === true, 'primary material first');

const otherMetadata = {
  materials: [{ code: 'OTHER', label: 'OTHER', isPrimary: true }],
  processes: [],
  problemDomains: [],
  problemSymptoms: [],
  materialOtherText: '特殊材质',
  processOtherText: null,
  problemDomainOtherText: null,
  problemSymptomOtherText: null,
};
const otherDisplay = buildCaseMetadataDisplay(otherMetadata);
assert(otherDisplay.materials[0].label === '其他：特殊材质', 'OTHER material label uses other text');

// Static contract: public pages
const libraryPageSource = fs.readFileSync('src/app/review-center/cases/page.tsx', 'utf8');
const detailPageSource = fs.readFileSync('src/app/review-center/cases/[caseNo]/page.tsx', 'utf8');
const clientSource = fs.readFileSync('src/lib/review-center/case-api-client.ts', 'utf8');
const presentationSource = fs.readFileSync('src/lib/review-center/case-presentation.ts', 'utf8');

assert(libraryPageSource.includes('fetchCaseLibrary'), 'library page uses library client');
assert(libraryPageSource.includes('fetchCaseMetadataOptions'), 'library page uses metadata options client');
assert(libraryPageSource.includes('还没有已发布的案例') && libraryPageSource.includes('没有符合条件的案例'), 'library distinct empty states');
assert(libraryPageSource.includes('/review-center/cases/') && libraryPageSource.includes('上一页') && libraryPageSource.includes('下一页'), 'library row links and pagination');

assert(detailPageSource.includes('fetchCasePublicDetail'), 'detail page uses public detail client');
assert(detailPageSource.includes('案例不存在或当前不可查看'), 'detail unified privacy copy');
assert(detailPageSource.includes('分类快照') && detailPageSource.includes('核心教训') && detailPageSource.includes('预防措施') && detailPageSource.includes('适用说明'), 'detail content sections');
assert(detailPageSource.includes('返回案例中心'), 'detail back navigation link');

for (const source of [libraryPageSource, detailPageSource, presentationSource]) {
  for (const endpoint of ['/case-candidates', '/admin', '/audit', '/publish', '/hide', '/reopen']) {
    assert(!source.includes(endpoint), 'no management endpoint reference');
  }
  for (const method of ["method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'"]) {
    assert(!source.includes(method), 'no case mutation method reference');
  }
}

for (const source of [libraryPageSource, detailPageSource, clientSource, presentationSource]) {
  for (const token of ['@supabase', 'createClient', 'supabase.from(', '.rpc(']) {
    assert(!source.includes(token), 'no direct supabase reference');
  }
  for (const token of ['as any', 'as unknown as', '@ts-ignore', '@ts-expect-error']) {
    assert(!source.includes(token), 'no unsafe type escape');
  }
}

assert(clientSource.includes('fetchCaseLibrary'), 'client preserves library read');
assert(clientSource.includes('fetchCasePublicDetail'), 'client preserves public detail read');
assert(!libraryPageSource.includes('fetchCaseCandidates'), 'library page no candidate fetch');
assert(!detailPageSource.includes('fetchCaseAdminDetail'), 'detail page no admin fetch');
assert(!clientSource.includes("method: 'PATCH'"), 'client no patch');
assert(!clientSource.includes("method: 'PUT'"), 'client no put');
assert(!clientSource.includes("method: 'DELETE'"), 'client no delete');
assert(clientSource.includes('createCase'), 'client slice2 create extension');
assert(clientSource.includes('fetchCaseAdminDetail'), 'client slice2 admin extension');
assert(!clientSource.includes('fetchCaseAudit'), 'client no audit helper');

assert(!libraryPageSource.includes('sourceReviewId') && !libraryPageSource.includes('orgId') && !libraryPageSource.includes('actorId'), 'library no internal identifiers');
assert(!detailPageSource.includes('sourceReviewId') && !detailPageSource.includes('orgId') && !detailPageSource.includes('actorId'), 'detail no internal identifiers');
assert(!libraryPageSource.includes('item.id') && !detailPageSource.includes('detail.id'), 'public UI no case uuid render');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
