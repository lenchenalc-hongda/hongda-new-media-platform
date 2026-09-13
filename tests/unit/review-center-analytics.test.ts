// ===== Review Center Analytics Data Foundation Helper Tests =====
import {
  buildAnalyticsBuckets,
  calculateAnalyticsSnapshot,
  fetchAllWithBatchPaging,
  getAnalyticsRangeBounds,
  getAnalyticsRangeMonths,
  parseAnalyticsRange,
  shanghaiMonthFromTimestamp,
} from '../../src/lib/review-center/analytics';

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

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function review(overrides: Record<string, unknown> = {}): any {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    created_at: '2026-03-01T00:00:00+08:00',
    ...overrides,
  };
}

function action(overrides: Record<string, unknown> = {}): any {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    created_at: '2026-03-01T00:00:00+08:00',
    status: 'OPEN',
    verified_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function timeline(overrides: Record<string, unknown> = {}): any {
  return {
    id: '00000000-0000-0000-0000-000000000003',
    review_id: '00000000-0000-0000-0000-000000000001',
    event_type: 'REVIEW_CLOSED',
    created_at: '2026-03-01T00:00:00+08:00',
    ...overrides,
  };
}

function snapshot(input: {
  reviews?: any[];
  timelineEvents?: any[];
  actionsCreated?: any[];
  actionsVerified?: any[];
  actionsCancelled?: any[];
  range?: any;
  businessDate?: string;
}) {
  return calculateAnalyticsSnapshot({
    range: input.range ?? 'LAST_6_MONTHS',
    businessDate: input.businessDate ?? '2026-08-26',
    reviews: input.reviews ?? [],
    timelineEvents: input.timelineEvents ?? [],
    actionsCreated: input.actionsCreated ?? [],
    actionsVerified: input.actionsVerified ?? [],
    actionsCancelled: input.actionsCancelled ?? [],
  });
}

function bucketMap(snap: any): Record<string, any> {
  return Object.fromEntries(snap.buckets.map((bucket: any) => [bucket.period, bucket]));
}

console.log('\n=== Review Center Analytics Data Foundation ===');

assert(parseAnalyticsRange(undefined) === 'LAST_6_MONTHS', 'missing range defaults LAST_6_MONTHS');
assert(parseAnalyticsRange(null) === 'LAST_6_MONTHS', 'null range defaults LAST_6_MONTHS');
assert(parseAnalyticsRange('last_6_months') === 'LAST_6_MONTHS', 'last_6_months parsed');
assert(parseAnalyticsRange('LAST_12_MONTHS') === 'LAST_12_MONTHS', 'LAST_12_MONTHS parsed');
assert(parseAnalyticsRange('this_year') === 'THIS_YEAR', 'this_year parsed');
assert(parseAnalyticsRange('') === null, 'empty range rejected');
assert(parseAnalyticsRange('all') === null, 'ALL rejected');

assert(
  deepEqual(getAnalyticsRangeMonths('LAST_6_MONTHS', '2026-08-26'), [
    '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
  ]),
  'LAST_6_MONTHS includes current month plus previous 5',
);
assert(
  deepEqual(getAnalyticsRangeMonths('LAST_12_MONTHS', '2026-02-10'), [
    '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08',
    '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
  ]),
  'LAST_12_MONTHS crosses calendar year',
);
assert(
  deepEqual(getAnalyticsRangeMonths('THIS_YEAR', '2026-08-26'), [
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    '2026-07', '2026-08',
  ]),
  'THIS_YEAR starts January and ends current month',
);
assert(getAnalyticsRangeMonths('THIS_YEAR', '2026-02-30').length === 0, 'invalid business date returns empty');

const last6Bounds = getAnalyticsRangeBounds('LAST_6_MONTHS', '2026-08-26');
assert(
  last6Bounds?.start === '2026-02-28T16:00:00.000Z'
  && last6Bounds?.end === '2026-08-31T16:00:00.000Z',
  'LAST_6_MONTHS range start inclusive and end exclusive in UTC',
);
assert(
  shanghaiMonthFromTimestamp('2026-07-31T15:59:59Z') === '2026-07',
  'UTC still previous Shanghai month',
);
assert(
  shanghaiMonthFromTimestamp('2026-07-31T16:00:00Z') === '2026-08',
  'UTC previous date maps to next Shanghai month',
);
assert(shanghaiMonthFromTimestamp('bad-date') === null, 'invalid timestamp returns null');

const empty = snapshot({});
assert(empty.buckets.length === 6, 'LAST_6_MONTHS zero fill has 6 buckets');
assert(
  empty.buckets.every(bucket =>
    bucket.reviewsCreated === 0
    && bucket.reviewsClosedUnique === 0
    && bucket.reviewsReopenedUnique === 0
    && bucket.actionsCreated === 0
    && bucket.actionsVerified === 0
    && bucket.actionsCancelled === 0
    && bucket.verificationCycleSampleCount === 0
    && bucket.verificationMedianDays === null
  ),
  'empty snapshot zero-filled',
);
assert(
  deepEqual(empty.summary, {
    reviewsCreatedTotal: 0,
    reviewsClosedUniqueInRange: 0,
    reviewsReopenedUniqueInRange: 0,
    actionsCreatedTotal: 0,
    actionsVerifiedTotal: 0,
    actionsCancelledTotal: 0,
    verificationCycleSampleCount: 0,
    verificationMedianDays: null,
    invalidCycleRowsExcluded: 0,
  }),
  'empty summary',
);
assert(empty.dataCompleteness.lifecycleHistory === 'PARTIAL_LEGACY', 'legacy completeness disclosure');

const created = snapshot({
  reviews: [
    review({ created_at: '2026-03-01T00:00:00+08:00' }),
    review({ id: '00000000-0000-0000-0000-000000000011', created_at: '2026-08-15T12:00:00+08:00' }),
    review({ id: '00000000-0000-0000-0000-000000000012', created_at: '2026-09-01T00:00:00+08:00' }),
  ],
});
const createdBuckets = bucketMap(created);
assert(createdBuckets['2026-03'].reviewsCreated === 1, 'March review created');
assert(createdBuckets['2026-08'].reviewsCreated === 1, 'August review created');
assert(created.summary.reviewsCreatedTotal === 2, 'range created total');

const sameBucketClosed = snapshot({
  timelineEvents: [
    timeline({ review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-03-05T00:00:00+08:00' }),
    timeline({ id: '00000000-0000-0000-0000-000000000021', review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-03-20T00:00:00+08:00' }),
  ],
});
assert(bucketMap(sameBucketClosed)['2026-03'].reviewsClosedUnique === 1, 'same-bucket close dedupe');
assert(sameBucketClosed.summary.reviewsClosedUniqueInRange === 1, 'same-bucket close range unique');

const crossBucketClosed = snapshot({
  timelineEvents: [
    timeline({ review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-03-05T00:00:00+08:00' }),
    timeline({ id: '00000000-0000-0000-0000-000000000022', review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-05-20T00:00:00+08:00' }),
  ],
});
const crossClosedBuckets = bucketMap(crossBucketClosed);
assert(crossClosedBuckets['2026-03'].reviewsClosedUnique === 1, 'cross-bucket March close');
assert(crossClosedBuckets['2026-05'].reviewsClosedUnique === 1, 'cross-bucket May close');
assert(crossBucketClosed.summary.reviewsClosedUniqueInRange === 1, 'cross-bucket range unique is 1');

const reopened = snapshot({
  timelineEvents: [
    timeline({ event_type: 'REVIEW_REOPENED', review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-04-05T00:00:00+08:00' }),
    timeline({ id: '00000000-0000-0000-0000-000000000023', event_type: 'REVIEW_REOPENED', review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-04-20T00:00:00+08:00' }),
  ],
});
assert(bucketMap(reopened)['2026-04'].reviewsReopenedUnique === 1, 'reopen same-bucket dedupe');
assert(reopened.summary.reviewsReopenedUniqueInRange === 1, 'reopen range unique');

const reopenedCross = snapshot({
  timelineEvents: [
    timeline({ event_type: 'REVIEW_REOPENED', review_id: '00000000-0000-0000-0000-000000000030', created_at: '2026-03-05T00:00:00+08:00' }),
    timeline({ id: '00000000-0000-0000-0000-000000000024', event_type: 'REVIEW_REOPENED', review_id: '00000000-0000-0000-0000-000000000030', created_at: '2026-05-20T00:00:00+08:00' }),
  ],
});
const reopenedCrossBuckets = bucketMap(reopenedCross);
assert(reopenedCrossBuckets['2026-03'].reviewsReopenedUnique === 1, 'reopen cross-bucket March');
assert(reopenedCrossBuckets['2026-05'].reviewsReopenedUnique === 1, 'reopen cross-bucket May');
assert(reopenedCross.summary.reviewsReopenedUniqueInRange === 1, 'reopen cross-bucket range unique');

const actionsCreated = snapshot({
  actionsCreated: [
    action({ status: 'OPEN' }),
    action({ id: '00000000-0000-0000-0000-000000000012', status: 'VERIFIED', verified_at: '2026-03-02T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000013', status: 'CANCELLED', cancelled_at: '2026-03-03T00:00:00+08:00' }),
  ],
});
assert(bucketMap(actionsCreated)['2026-03'].actionsCreated === 3, 'all action statuses count as created');
assert(actionsCreated.summary.actionsCreatedTotal === 3, 'actions created total');

const verifiedGate = snapshot({
  actionsVerified: [
    action({ status: 'VERIFIED', verified_at: '2026-03-02T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000012', status: 'VERIFIED', verified_at: null }),
    action({ id: '00000000-0000-0000-0000-000000000013', status: 'IN_PROGRESS', verified_at: '2026-03-03T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000014', status: 'CANCELLED', verified_at: '2026-03-04T00:00:00+08:00' }),
  ],
});
assert(bucketMap(verifiedGate)['2026-03'].actionsVerified === 1, 'verified status gate');
assert(verifiedGate.summary.actionsVerifiedTotal === 1, 'verified total gate');
assert(verifiedGate.summary.invalidCycleRowsExcluded === 1, 'null verified_at excluded from cycle');

const cancelledGate = snapshot({
  actionsCancelled: [
    action({ status: 'CANCELLED', cancelled_at: '2026-03-02T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000012', status: 'CANCELLED', cancelled_at: null }),
    action({ id: '00000000-0000-0000-0000-000000000013', status: 'VERIFIED', cancelled_at: '2026-03-03T00:00:00+08:00' }),
  ],
});
assert(bucketMap(cancelledGate)['2026-03'].actionsCancelled === 1, 'cancelled status gate');
assert(cancelledGate.summary.actionsCancelledTotal === 1, 'cancelled total gate');

const cycleOdd = snapshot({
  actionsVerified: [
    action({ status: 'VERIFIED', created_at: '2026-03-01T00:00:00+08:00', verified_at: '2026-03-02T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000012', status: 'VERIFIED', created_at: '2026-03-01T00:00:00+08:00', verified_at: '2026-03-04T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000013', status: 'VERIFIED', created_at: '2026-03-01T00:00:00+08:00', verified_at: '2026-03-06T00:00:00+08:00' }),
  ],
});
assert(bucketMap(cycleOdd)['2026-03'].verificationMedianDays === 3.0, 'odd median 3.0');
assert(bucketMap(cycleOdd)['2026-03'].verificationCycleSampleCount === 3, 'cycle sample count 3');

const cycleEven = snapshot({
  actionsVerified: [
    action({ status: 'VERIFIED', created_at: '2026-03-01T00:00:00+08:00', verified_at: '2026-03-02T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000012', status: 'VERIFIED', created_at: '2026-03-01T00:00:00+08:00', verified_at: '2026-03-04T00:00:00+08:00' }),
  ],
});
assert(bucketMap(cycleEven)['2026-03'].verificationMedianDays === 2.0, 'even median 2.0');

const cycleHours = snapshot({
  actionsVerified: [
    action({
      status: 'VERIFIED',
      created_at: '2026-03-01T23:00:00+08:00',
      verified_at: '2026-03-02T01:00:00+08:00',
    }),
  ],
});
assert(bucketMap(cycleHours)['2026-03'].verificationMedianDays === 0.1, '2 hours becomes 0.1 day');

const cycleNegative = snapshot({
  actionsVerified: [
    action({
      status: 'VERIFIED',
      created_at: '2026-03-02T00:00:00+08:00',
      verified_at: '2026-03-01T00:00:00+08:00',
    }),
  ],
});
assert(bucketMap(cycleNegative)['2026-03'].actionsVerified === 1, 'negative cycle still verified throughput');
assert(bucketMap(cycleNegative)['2026-03'].verificationCycleSampleCount === 0, 'negative cycle not sampled');
assert(cycleNegative.summary.invalidCycleRowsExcluded === 1, 'negative cycle excluded');

const cycleBucket = snapshot({
  range: 'THIS_YEAR',
  actionsVerified: [
    action({
      status: 'VERIFIED',
      created_at: '2026-01-10T00:00:00+08:00',
      verified_at: '2026-03-05T00:00:00+08:00',
    }),
  ],
});
assert(bucketMap(cycleBucket)['2026-03'].verificationCycleSampleCount === 1, 'cycle bucketed by verified month');
assert(bucketMap(cycleBucket)['2026-01'].verificationCycleSampleCount === 0, 'created month not cycle bucket');

const overallMedian = snapshot({
  range: 'THIS_YEAR',
  actionsVerified: [
    action({ status: 'VERIFIED', created_at: '2026-03-01T00:00:00+08:00', verified_at: '2026-03-02T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000012', status: 'VERIFIED', created_at: '2026-04-01T00:00:00+08:00', verified_at: '2026-07-10T00:00:00+08:00' }),
    action({ id: '00000000-0000-0000-0000-000000000013', status: 'VERIFIED', created_at: '2026-05-01T00:00:00+08:00', verified_at: '2026-05-03T00:00:00+08:00' }),
  ],
});
assert(overallMedian.summary.verificationMedianDays === 2.0, 'overall median uses raw range samples');

const privacy = snapshot({
  reviews: [review({
    customer_name: 'SECRET_CUSTOMER',
    title: 'SECRET_TITLE',
    description: 'SECRET_DESCRIPTION',
    email: 'SECRET_EMAIL',
    user_id: 'SECRET_UUID',
  })],
  timelineEvents: [timeline({
    payload: { secret: 'SECRET_PAYLOAD' },
    actor_profile_id: 'SECRET_ACTOR',
  })],
  actionsCreated: [action({
    title: 'SECRET_ACTION_TITLE',
    description: 'SECRET_ACTION_NOTE',
    owner_profile_id: 'SECRET_OWNER',
  })],
  actionsVerified: [action({
    status: 'VERIFIED',
    verified_at: '2026-03-02T00:00:00+08:00',
    verification_note: 'SECRET_VERIFY',
  })],
});
const privacyText = JSON.stringify(privacy);
for (const marker of [
  'SECRET_CUSTOMER',
  'SECRET_TITLE',
  'SECRET_DESCRIPTION',
  'SECRET_EMAIL',
  'SECRET_UUID',
  'SECRET_PAYLOAD',
  'SECRET_ACTOR',
  'SECRET_ACTION_TITLE',
  'SECRET_ACTION_NOTE',
  'SECRET_OWNER',
  'SECRET_VERIFY',
]) {
  assert(!privacyText.includes(marker), 'analytics DTO hides marker: ' + marker);
}

const batchOffsets: number[] = [];
const batchRows = Array.from({ length: 1200 }, (_, index) => ({ id: String(index) }));
const batched = await fetchAllWithBatchPaging(async (offset) => {
  batchOffsets.push(offset);
  return { data: batchRows.slice(offset, offset + 500), error: null };
}, 500);
assert(batched.length === 1200, 'analytics batch paging fetches all rows');
assert(deepEqual(batchOffsets, [0, 500, 1000]), 'analytics batch paging stable offsets');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
