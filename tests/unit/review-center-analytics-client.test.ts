// ===== Review Center Analytics Client Runtime Validation Tests =====
import {
  AnalyticsClientError,
  fetchAnalyticsSnapshot,
  parseAnalyticsSnapshot,
} from '../../src/lib/review-center/analytics-client';

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

function validBody(range = 'LAST_6_MONTHS'): Record<string, unknown> {
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  return {
    ok: true,
    code: 'OK',
    message: 'success',
    data: {
      review_ids: ['SECRET_REVIEW_ID'],
      raw_rows: ['SECRET_RAW'],
      range,
      timezone: 'Asia/Shanghai',
      buckets: months.map(period => ({
        period,
        reviewsCreated: 1,
        reviewsClosedUnique: 1,
        reviewsReopenedUnique: 0,
        actionsCreated: 1,
        actionsVerified: 1,
        actionsCancelled: 0,
        verificationCycleSampleCount: 1,
        verificationMedianDays: period === '2026-03' ? 2.5 : null,
      })),
      summary: {
        reviewsCreatedTotal: 6,
        reviewsClosedUniqueInRange: 4,
        reviewsReopenedUniqueInRange: 0,
        actionsCreatedTotal: 6,
        actionsVerifiedTotal: 6,
        actionsCancelledTotal: 0,
        verificationCycleSampleCount: 5,
        verificationMedianDays: 2.5,
        invalidCycleRowsExcluded: 1,
      },
      dataCompleteness: {
        lifecycleHistory: 'PARTIAL_LEGACY',
      },
      customer_name: 'SECRET_CUSTOMER',
      description: 'SECRET_DESCRIPTION',
      email: 'SECRET_EMAIL',
      org_id: 'SECRET_ORG',
      profile_id: 'SECRET_PROFILE',
    },
  };
}

function clone(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function expectInvalid(body: unknown, msg: string) {
  try {
    parseAnalyticsSnapshot(body);
    assert(false, 'expected invalid response: ' + msg);
  } catch (error) {
    assert(
      error instanceof AnalyticsClientError && error.code === 'INVALID_RESPONSE',
      'invalid response rejected: ' + msg,
    );
  }
}

console.log('\n=== Review Center Analytics Client Runtime Validation ===');

const parsed = parseAnalyticsSnapshot(validBody());
assert(parsed.range === 'LAST_6_MONTHS' && parsed.buckets.length === 6, 'valid analytics parsed');
assert(parsed.summary.reviewsCreatedTotal === 6 && parsed.summary.verificationMedianDays === 2.5, 'summary parsed');
assert(parsed.dataCompleteness.lifecycleHistory === 'PARTIAL_LEGACY', 'data completeness parsed');
const parsedText = JSON.stringify(parsed);
for (const marker of [
  'SECRET_REVIEW_ID',
  'SECRET_RAW',
  'SECRET_CUSTOMER',
  'SECRET_DESCRIPTION',
  'SECRET_EMAIL',
  'SECRET_ORG',
  'SECRET_PROFILE',
]) {
  assert(!parsedText.includes(marker), 'sensitive extra field stripped: ' + marker);
}

const negative = clone(validBody());
(negative.data as Record<string, any>).summary.reviewsCreatedTotal = -1;
expectInvalid(negative, 'negative count');

const float = clone(validBody());
(float.data as Record<string, any>).buckets[0].actionsCreated = 1.5;
expectInvalid(float, 'float count');

const wrongRange = clone(validBody());
(wrongRange.data as Record<string, any>).range = 'LAST_90_DAYS';
expectInvalid(wrongRange, 'invalid range');

const wrongTimezone = clone(validBody());
(wrongTimezone.data as Record<string, any>).timezone = 'UTC';
expectInvalid(wrongTimezone, 'invalid timezone');

const badPeriod = clone(validBody());
(badPeriod.data as Record<string, any>).buckets[0].period = '2026-13';
expectInvalid(badPeriod, 'invalid period');

const badMonth = clone(validBody());
(badMonth.data as Record<string, any>).buckets[0].period = '2026-00';
expectInvalid(badMonth, 'invalid month');

const missingBucketField = clone(validBody());
delete (missingBucketField.data as Record<string, any>).buckets[0].reviewsCreated;
expectInvalid(missingBucketField, 'missing bucket field');

const negativeMedian = clone(validBody());
(negativeMedian.data as Record<string, any>).summary.verificationMedianDays = -1;
expectInvalid(negativeMedian, 'negative median');

const invalidCompleteness = clone(validBody());
(invalidCompleteness.data as Record<string, any>).dataCompleteness.lifecycleHistory = 'FULL';
expectInvalid(invalidCompleteness, 'invalid data completeness');

const malformedSummary = clone(validBody());
delete (malformedSummary.data as Record<string, any>).summary.actionsVerifiedTotal;
expectInvalid(malformedSummary, 'malformed summary');

const sampleTooLarge = clone(validBody());
(sampleTooLarge.data as Record<string, any>).buckets[0].verificationCycleSampleCount = 5;
expectInvalid(sampleTooLarge, 'bucket sample count exceeds verified count');

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
    handler = async () => jsonResponse(validBody('THIS_YEAR'));
    const controller = new AbortController();
    const fetched = await fetchAnalyticsSnapshot('THIS_YEAR', { signal: controller.signal });
    assert(lastRequest?.url === '/api/review-center/analytics?range=this_year', 'fetch analytics URL');
    assert(lastRequest?.init?.signal === controller.signal, 'fetch signal passed through');
    assert(fetched.range === 'THIS_YEAR', 'fetched range parsed');

    handler = async () => jsonResponse({ error: 'RAW FORBIDDEN' }, 403);
    try {
      await fetchAnalyticsSnapshot('LAST_6_MONTHS');
      assert(false, '403 should throw');
    } catch (error) {
      const clientError = error instanceof AnalyticsClientError ? error : null;
      assert(clientError !== null && clientError.status === 403 && clientError.code === 'FORBIDDEN', '403 classified');
      assert(clientError !== null && !JSON.stringify(clientError.message).includes('RAW'), '403 raw hidden');
    }

    handler = async () => { throw new Error('network down'); };
    try {
      await fetchAnalyticsSnapshot('LAST_6_MONTHS');
      assert(false, 'network should throw');
    } catch (error) {
      const clientError = error instanceof AnalyticsClientError ? error : null;
      assert(clientError !== null && clientError.status === 0 && clientError.code === 'NETWORK_ERROR', 'network classified');
    }
  } finally {
    restore();
  }
}

await run();

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
