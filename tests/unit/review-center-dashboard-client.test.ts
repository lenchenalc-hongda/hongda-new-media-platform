// ===== Review Center Dashboard Client Runtime Parser Tests =====
import {
  DashboardClientError,
  fetchDashboardSnapshot,
  parseDashboardSnapshot,
} from '../../src/lib/review-center/dashboard-client';

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

const REVIEW_ID = '00000000-0000-0000-0000-000000000001';

function validBody(range = 'THIS_MONTH'): Record<string, unknown> {
  return {
    ok: true,
    code: 'OK',
    message: 'success',
    data: {
      customer_name: 'SECRET_CUSTOMER',
      description: 'SECRET_DESCRIPTION',
      current: {
        openReviews: 1,
        highRiskReviews: 1,
        openActions: 2,
        overdueActions: 1,
        pendingVerificationActions: 1,
      },
      period: {
        range,
        reviewsCreated: 3,
        reviewsClosedUnique: 2,
        actionsVerified: 1,
      },
      distributions: {
        status: [
          { key: 'draft', count: 1 },
          { key: 'submitted', count: 1 },
          { key: 'in_review', count: 0 },
          { key: 'action_required', count: 0 },
          { key: 'verifying', count: 0 },
          { key: 'closed', count: 1 },
          { key: 'archived', count: 0 },
          { key: 'rejected', count: 0 },
          { key: 'cancelled', count: 0 },
          { key: 'UNKNOWN', count: 0 },
        ],
        risk: [
          { key: 'RED', count: 1 },
          { key: 'YELLOW', count: 1 },
          { key: 'GREEN', count: 0 },
          { key: 'UNSET', count: 1 },
          { key: 'UNKNOWN', count: 0 },
        ],
        type: [
          { key: 'A', count: 1 },
          { key: 'B', count: 1 },
          { key: 'C', count: 0 },
          { key: 'UNKNOWN', count: 0 },
        ],
      },
      attention: {
        total: 1,
        items: [{
          reviewId: REVIEW_ID,
          reviewNo: 'REV-2026-000001',
          title: '复盘标题',
          riskLevel: 'RED',
          status: 'draft',
          ownerDisplayName: '负责人',
          openActionCount: 1,
          overdueActionCount: 0,
          pendingVerificationActionCount: 0,
          attentionReasons: ['HIGH_RISK'],
          secret_field: 'SECRET_ITEM',
        }],
      },
    },
  };
}

function clone(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function expectInvalid(body: unknown, msg: string) {
  try {
    parseDashboardSnapshot(body);
    assert(false, 'expected invalid response: ' + msg);
  } catch (error) {
    assert(
      error instanceof DashboardClientError && error.code === 'INVALID_RESPONSE',
      'invalid response rejected: ' + msg,
    );
  }
}

console.log('\n=== Review Center Dashboard Client Runtime Validation ===');

const parsed = parseDashboardSnapshot(validBody());
assert(parsed.current.openReviews === 1 && parsed.period.reviewsClosedUnique === 2, 'valid response parsed');
assert(parsed.attention.items[0].attentionReasons[0] === 'HIGH_RISK', 'attention reasons preserved');
assert(parsed.distributions.status.length === 10, 'status distribution all buckets');
assert(parsed.distributions.risk.length === 5, 'risk distribution all buckets');
assert(parsed.distributions.type.length === 4, 'type distribution all buckets');
const parsedText = JSON.stringify(parsed);
for (const marker of ['SECRET_CUSTOMER', 'SECRET_DESCRIPTION', 'SECRET_ITEM']) {
  assert(!parsedText.includes(marker), 'parser drops sensitive extra field: ' + marker);
}

const negative = clone(validBody());
(negative.data as Record<string, any>).current.openReviews = -1;
expectInvalid(negative, 'negative count');

const float = clone(validBody());
(float.data as Record<string, any>).period.actionsVerified = 1.5;
expectInvalid(float, 'float count');

const nanBody = clone(validBody());
(nanBody.data as Record<string, any>).current.openReviews = Number.NaN;
expectInvalid(nanBody, 'NaN count');

const wrongRange = clone(validBody());
(wrongRange.data as Record<string, any>).period.range = 'YEAR';
expectInvalid(wrongRange, 'wrong range');

const unknownReason = clone(validBody());
(unknownReason.data as Record<string, any>).attention.items[0].attentionReasons = ['SOMETHING_NEW'];
expectInvalid(unknownReason, 'unknown attention reason');

const duplicateReason = clone(validBody());
(duplicateReason.data as Record<string, any>).attention.items[0].attentionReasons = ['HIGH_RISK', 'HIGH_RISK'];
expectInvalid(duplicateReason, 'duplicate attention reason');

const missingStatusBucket = clone(validBody());
(missingStatusBucket.data as Record<string, any>).distributions.status =
  (missingStatusBucket.data as Record<string, any>).distributions.status.slice(0, 9);
expectInvalid(missingStatusBucket, 'missing status bucket');

const unknownRiskBucket = clone(validBody());
(unknownRiskBucket.data as Record<string, any>).distributions.risk.push({ key: 'PURPLE', count: 1 });
expectInvalid(unknownRiskBucket, 'unknown risk bucket');

const duplicateTypeBucket = clone(validBody());
(duplicateTypeBucket.data as Record<string, any>).distributions.type.push({ key: 'A', count: 1 });
expectInvalid(duplicateTypeBucket, 'duplicate type bucket');

const missingPeriodField = clone(validBody());
delete (missingPeriodField.data as Record<string, any>).period.reviewsClosedUnique;
expectInvalid(missingPeriodField, 'missing period field');

const malformedReviewId = clone(validBody());
(malformedReviewId.data as Record<string, any>).attention.items[0].reviewId = 'not-a-uuid';
expectInvalid(malformedReviewId, 'malformed reviewId');

const objectOwner = clone(validBody());
(objectOwner.data as Record<string, any>).attention.items[0].ownerDisplayName = { name: 'x' };
expectInvalid(objectOwner, 'object ownerDisplayName');

const totalTooSmall = clone(validBody());
(totalTooSmall.data as Record<string, any>).attention.total = 0;
expectInvalid(totalTooSmall, 'attention total smaller than items');

const badEnvelope = clone(validBody());
badEnvelope.ok = false;
expectInvalid(badEnvelope, 'failed envelope');

let lastRequest: { url: string; init?: RequestInit } | null = null;
let handler: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch() {
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    lastRequest = { url: String(input), init };
    return handler(String(input), init);
  };
  return () => {
    (globalThis as any).fetch = original;
  };
}

async function run() {
  const restore = installFetch();
  try {
    handler = async () => jsonResponse(validBody('LAST_30_DAYS'));
    const controller = new AbortController();
    const fetched = await fetchDashboardSnapshot('LAST_30_DAYS', { signal: controller.signal });
    assert(lastRequest?.url === '/api/review-center/dashboard?range=last_30_days', 'fetch dashboard URL');
    assert(lastRequest?.init?.signal === controller.signal, 'fetch signal passed through');
    assert(fetched.period.range === 'LAST_30_DAYS', 'fetched range parsed');

    handler = async () => jsonResponse({ error: 'RAW FORBIDDEN' }, 403);
    try {
      await fetchDashboardSnapshot('THIS_MONTH');
      assert(false, '403 should throw');
    } catch (error) {
      const clientError = error instanceof DashboardClientError ? error : null;
      assert(clientError !== null && clientError.status === 403 && clientError.code === 'FORBIDDEN', '403 classified');
      assert(clientError !== null && !JSON.stringify(clientError.message).includes('RAW'), '403 raw hidden');
    }

    handler = async () => jsonResponse({ error: 'RAW UNAUTHORIZED' }, 401);
    try {
      await fetchDashboardSnapshot('THIS_MONTH');
      assert(false, '401 should throw');
    } catch (error) {
      const clientError = error instanceof DashboardClientError ? error : null;
      assert(clientError !== null && clientError.status === 401 && clientError.code === 'UNAUTHORIZED', '401 classified');
      assert(clientError !== null && !JSON.stringify(clientError.message).includes('RAW'), '401 raw hidden');
    }

    handler = async () => jsonResponse({ error: 'RAW SERVER' }, 500);
    try {
      await fetchDashboardSnapshot('THIS_MONTH');
      assert(false, '500 should throw');
    } catch (error) {
      const clientError = error instanceof DashboardClientError ? error : null;
      assert(clientError !== null && clientError.status === 500 && clientError.code === 'INTERNAL_ERROR', '500 classified');
      assert(clientError !== null && !JSON.stringify(clientError.message).includes('RAW'), '500 raw hidden');
    }

    handler = async () => { throw new Error('network down'); };
    try {
      await fetchDashboardSnapshot('THIS_MONTH');
      assert(false, 'network should throw');
    } catch (error) {
      assert(error instanceof DashboardClientError && error.status === 0 && error.code === 'NETWORK_ERROR', 'network classified');
    }

    handler = async () => jsonResponse({ ok: true, code: 'OK', data: { bad: true } });
    try {
      await fetchDashboardSnapshot('THIS_MONTH');
      assert(false, 'malformed response should throw');
    } catch (error) {
      assert(error instanceof DashboardClientError && error.code === 'INVALID_RESPONSE', 'malformed response rejected');
    }
  } finally {
    restore();
  }
}

await run();

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
