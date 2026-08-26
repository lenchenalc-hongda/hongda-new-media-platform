// ===== Review Center Dashboard Data Foundation Helper Tests =====
import {
  calculateDashboardSnapshot,
  fetchAllWithBatchPaging,
  getDashboardRangeBounds,
  getShanghaiDateOnlyFromTimestamp,
  isDateOnlyInDashboardRange,
  isTimestampInDashboardRange,
  parseDashboardRange,
} from '../../src/lib/review-center/dashboard';

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
    review_no: 'REV-2026-000001',
    title: '复盘标题',
    review_type: 'A',
    status: 'draft',
    risk_level: null,
    owner_id: '00000000-0000-0000-0000-000000000002',
    created_at: '2026-08-10T00:00:00+08:00',
    ...overrides,
  };
}

function action(overrides: Record<string, unknown> = {}): any {
  return {
    review_id: '00000000-0000-0000-0000-000000000001',
    status: 'OPEN',
    due_date: '2026-08-25',
    verified_at: null,
    ...overrides,
  };
}

function closedEvent(overrides: Record<string, unknown> = {}): any {
  return {
    review_id: '00000000-0000-0000-0000-000000000001',
    event_type: 'REVIEW_CLOSED',
    created_at: '2026-08-20T00:00:00+08:00',
    ...overrides,
  };
}

function snapshot(input: {
  reviews?: any[];
  actions?: any[];
  closedEvents?: any[];
  ownerMap?: Map<string, string>;
  range?: any;
  businessDate?: string;
  attentionLimit?: number;
}) {
  return calculateDashboardSnapshot({
    reviews: input.reviews ?? [],
    actions: input.actions ?? [],
    closedEvents: input.closedEvents ?? [],
    ownerMap: input.ownerMap,
    range: input.range ?? 'THIS_MONTH',
    businessDate: input.businessDate ?? '2026-08-26',
    attentionLimit: input.attentionLimit,
  });
}

console.log('\n=== Review Center Dashboard Data Foundation ===');

assert(parseDashboardRange(undefined) === 'THIS_MONTH', 'missing range defaults to THIS_MONTH');
assert(parseDashboardRange(null) === 'THIS_MONTH', 'null range defaults to THIS_MONTH');
assert(parseDashboardRange('this_month') === 'THIS_MONTH', 'lowercase this_month parsed');
assert(parseDashboardRange('THIS_MONTH') === 'THIS_MONTH', 'uppercase this_month parsed');
assert(parseDashboardRange('last_30_days') === 'LAST_30_DAYS', 'last_30_days parsed');
assert(parseDashboardRange('all') === 'ALL', 'all parsed');
assert(parseDashboardRange('') === null, 'empty range rejected');
assert(parseDashboardRange('year') === null, 'unknown range rejected');

const monthBounds = getDashboardRangeBounds('THIS_MONTH', '2026-08-26');
assert(
  monthBounds !== null && monthBounds.start === '2026-08-01' && monthBounds.end === '2026-08-31',
  'THIS_MONTH uses Shanghai calendar month',
);
const leapBounds = getDashboardRangeBounds('THIS_MONTH', '2028-02-10');
assert(
  leapBounds !== null && leapBounds.start === '2028-02-01' && leapBounds.end === '2028-02-29',
  'THIS_MONTH handles leap February',
);
const last30Bounds = getDashboardRangeBounds('LAST_30_DAYS', '2026-08-26');
assert(
  last30Bounds !== null
    && last30Bounds.start === '2026-07-28'
    && last30Bounds.end === '2026-08-26',
  'LAST_30_DAYS includes today and previous 29 days',
);
assert(getDashboardRangeBounds('ALL', '2026-08-26') === null, 'ALL has no date bounds');
assert(getDashboardRangeBounds('THIS_MONTH', '2026-02-30') === null, 'invalid business date rejected');

assert(getShanghaiDateOnlyFromTimestamp('2026-07-31T15:59:59Z') === '2026-07-31', 'UTC before Shanghai midnight stays previous date');
assert(getShanghaiDateOnlyFromTimestamp('2026-07-31T16:00:00Z') === '2026-08-01', 'UTC previous month maps to Shanghai new month');
assert(getShanghaiDateOnlyFromTimestamp('2026-08-31T23:59:59+08:00') === '2026-08-31', 'Shanghai end-of-month retained');
assert(getShanghaiDateOnlyFromTimestamp('not-a-date') === null, 'invalid timestamp returns null');

assert(
  isTimestampInDashboardRange('2026-07-31T15:59:59Z', 'THIS_MONTH', monthBounds) === false,
  'UTC still previous Shanghai month excluded',
);
assert(
  isTimestampInDashboardRange('2026-07-31T16:00:00Z', 'THIS_MONTH', monthBounds) === true,
  'Shanghai new month boundary included',
);
assert(
  isTimestampInDashboardRange('2026-08-31T23:59:59+08:00', 'THIS_MONTH', monthBounds) === true,
  'Shanghai month end included',
);
assert(
  isTimestampInDashboardRange('2026-09-01T00:00:00+08:00', 'THIS_MONTH', monthBounds) === false,
  'next Shanghai month excluded',
);
assert(
  isTimestampInDashboardRange('2026-07-27T23:59:59+08:00', 'LAST_30_DAYS', last30Bounds) === false,
  '30-day window excludes day 30',
);
assert(
  isTimestampInDashboardRange('2026-07-28T00:00:00+08:00', 'LAST_30_DAYS', last30Bounds) === true,
  '30-day window includes day 29',
);
assert(
  isTimestampInDashboardRange('2026-08-26T23:59:59+08:00', 'LAST_30_DAYS', last30Bounds) === true,
  '30-day window includes today',
);
assert(
  isTimestampInDashboardRange('invalid', 'ALL', null) === false,
  'ALL rejects invalid timestamps',
);
assert(
  isTimestampInDashboardRange('2026-01-01T00:00:00Z', 'ALL', null) === true,
  'ALL includes valid timestamps',
);
assert(
  isDateOnlyInDashboardRange('2026-07-28', 'LAST_30_DAYS', last30Bounds) === true,
  'date-only 30-day start included',
);
assert(
  isDateOnlyInDashboardRange('2026-07-27', 'LAST_30_DAYS', last30Bounds) === false,
  'date-only 30-day outside excluded',
);

const overdue = snapshot({
  actions: [
    action({ status: 'OPEN', due_date: '2026-08-25' }),
    action({ status: 'OPEN', due_date: '2026-08-26' }),
    action({ status: 'OPEN', due_date: '2026-08-27' }),
    action({ status: 'VERIFIED', due_date: '2026-08-25', verified_at: '2026-08-26T00:00:00+08:00' }),
    action({ status: 'CANCELLED', due_date: '2026-08-25' }),
  ],
});
assert(overdue.current.overdueActions === 1, 'overdue boundary matches Action Read canonical logic');
assert(overdue.current.openActions === 3, 'openActions excludes terminal statuses');
assert(overdue.current.pendingVerificationActions === 0, 'pendingVerificationActions zero without pending rows');

const currentFixtures = [
  review({ status: 'draft', risk_level: 'RED', created_at: '2026-08-01T00:00:00+08:00' }),
  review({ id: '00000000-0000-0000-0000-000000000003', status: 'submitted', risk_level: 'RED', created_at: '2026-07-01T00:00:00+08:00' }),
  review({ id: '00000000-0000-0000-0000-000000000004', status: 'closed', risk_level: 'RED', created_at: '2026-06-01T00:00:00+08:00' }),
];
const currentMonth = snapshot({
  reviews: currentFixtures,
  actions: [action({ status: 'IN_PROGRESS' }), action({ status: 'PENDING_VERIFICATION' })],
  range: 'THIS_MONTH',
});
const currentLast30 = snapshot({
  reviews: currentFixtures,
  actions: [action({ status: 'IN_PROGRESS' }), action({ status: 'PENDING_VERIFICATION' })],
  range: 'LAST_30_DAYS',
});
const currentAll = snapshot({
  reviews: currentFixtures,
  actions: [action({ status: 'IN_PROGRESS' }), action({ status: 'PENDING_VERIFICATION' })],
  range: 'ALL',
});
assert(
  deepEqual(currentMonth.current, currentLast30.current)
    && deepEqual(currentMonth.current, currentAll.current),
  'current KPIs are range independent',
);
assert(currentMonth.current.openReviews === 2, 'openReviews counts draft and submitted only');
assert(currentMonth.current.highRiskReviews === 2, 'highRiskReviews counts open RED only');
assert(currentMonth.current.openActions === 2, 'openActions counts non-terminal statuses');
assert(currentMonth.current.pendingVerificationActions === 1, 'pendingVerificationActions counts pending only');
assert(currentMonth.period.range === 'THIS_MONTH', 'period range preserved');
assert(currentAll.period.range === 'ALL', 'ALL range preserved');

const periodReviews = [
  review({ id: '00000000-0000-0000-0000-000000000010', created_at: '2026-08-01T00:00:00+08:00' }),
  review({ id: '00000000-0000-0000-0000-000000000011', created_at: '2026-07-31T16:00:00Z' }),
  review({ id: '00000000-0000-0000-0000-000000000012', created_at: '2026-07-31T15:59:59Z' }),
];
const period = snapshot({ reviews: periodReviews, range: 'THIS_MONTH' });
assert(period.period.reviewsCreated === 2, 'reviewsCreated uses Shanghai month boundary');

const closed = snapshot({
  closedEvents: [
    closedEvent({ review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-08-02T00:00:00+08:00' }),
    closedEvent({ review_id: '00000000-0000-0000-0000-000000000020', created_at: '2026-08-03T00:00:00+08:00' }),
    closedEvent({ review_id: '00000000-0000-0000-0000-000000000021', created_at: '2026-08-04T00:00:00+08:00' }),
    closedEvent({ review_id: '00000000-0000-0000-0000-000000000022', created_at: '2026-07-31T15:59:59Z' }),
  ],
  range: 'THIS_MONTH',
});
assert(closed.period.reviewsClosedUnique === 2, 'closed review events dedupe by review_id within period');

const verified = snapshot({
  actions: [
    action({ status: 'VERIFIED', verified_at: '2026-08-10T00:00:00+08:00' }),
    action({ status: 'VERIFIED', verified_at: '2026-07-10T00:00:00+08:00' }),
    action({ status: 'VERIFIED', verified_at: null }),
    action({ status: 'CANCELLED', verified_at: '2026-08-11T00:00:00+08:00' }),
    action({ status: 'VERIFIED', completed_at: '2026-08-12T00:00:00+08:00', verified_at: '2026-07-20T00:00:00+08:00' }),
    action({ status: 'IN_PROGRESS', verified_at: '2026-08-13T00:00:00+08:00' }),
  ],
  range: 'THIS_MONTH',
});
assert(verified.period.actionsVerified === 1, 'actionsVerified uses status VERIFIED and verified_at only');
assert(verified.period.actionsVerified !== 2, 'IN_PROGRESS with verified_at anomaly is not counted');

const distributionReviews = [
  review({ status: 'draft', risk_level: 'RED', review_type: 'A' }),
  review({ id: '00000000-0000-0000-0000-000000000101', status: 'submitted', risk_level: 'YELLOW', review_type: 'B' }),
  review({ id: '00000000-0000-0000-0000-000000000102', status: 'in_review', risk_level: 'GREEN', review_type: 'C' }),
  review({ id: '00000000-0000-0000-0000-000000000103', status: 'action_required', risk_level: null, review_type: 'C' }),
  review({ id: '00000000-0000-0000-0000-000000000104', status: 'verifying', risk_level: 'UNKNOWN_LEGACY', review_type: 'X' }),
  review({ id: '00000000-0000-0000-0000-000000000105', status: 'closed', risk_level: 'RED' }),
  review({ id: '00000000-0000-0000-0000-000000000106', status: 'archived', risk_level: 'YELLOW' }),
  review({ id: '00000000-0000-0000-0000-000000000107', status: 'rejected', risk_level: 'GREEN' }),
  review({ id: '00000000-0000-0000-0000-000000000108', status: 'cancelled', risk_level: 'RED' }),
  review({ id: '00000000-0000-0000-0000-000000000109', status: 'FUTURE_STATUS', risk_level: 'RED' }),
];
const distributions = snapshot({ reviews: distributionReviews, range: 'ALL' });
assert(
  deepEqual(distributions.distributions.status, [
    { key: 'draft', count: 1 },
    { key: 'submitted', count: 1 },
    { key: 'in_review', count: 1 },
    { key: 'action_required', count: 1 },
    { key: 'verifying', count: 1 },
    { key: 'closed', count: 1 },
    { key: 'archived', count: 1 },
    { key: 'rejected', count: 1 },
    { key: 'cancelled', count: 1 },
    { key: 'UNKNOWN', count: 1 },
  ]),
  'status distribution returns all fixed buckets with unknown safety',
);
assert(
  deepEqual(distributions.distributions.risk, [
    { key: 'RED', count: 4 },
    { key: 'YELLOW', count: 2 },
    { key: 'GREEN', count: 2 },
    { key: 'UNSET', count: 1 },
    { key: 'UNKNOWN', count: 1 },
  ]),
  'risk distribution keeps null as UNSET and unknown as UNKNOWN',
);
assert(
  deepEqual(distributions.distributions.type, [
    { key: 'A', count: 6 },
    { key: 'B', count: 1 },
    { key: 'C', count: 2 },
    { key: 'UNKNOWN', count: 1 },
  ]),
  'type distribution keeps A/B/C buckets and unknown safely',
);

const redDraft = snapshot({
  reviews: [review({ risk_level: 'RED' })],
  range: 'ALL',
});
assert(redDraft.attention.total === 1, 'RED draft enters attention');
assert(
  deepEqual(redDraft.attention.items[0].attentionReasons, ['HIGH_RISK']),
  'RED draft reason is HIGH_RISK',
);

const redClosed = snapshot({
  reviews: [review({ status: 'closed', risk_level: 'RED' })],
  range: 'ALL',
});
assert(redClosed.attention.total === 0, 'RED closed without action issue does not enter attention');

const overdueAttention = snapshot({
  reviews: [review({ status: 'closed', risk_level: 'GREEN' })],
  actions: [action({ status: 'OPEN', due_date: '2026-08-25' })],
  range: 'ALL',
});
assert(overdueAttention.attention.total === 1, 'closed review with overdue action enters attention');
assert(
  deepEqual(overdueAttention.attention.items[0].attentionReasons, ['OVERDUE_ACTION']),
  'overdue action reason is OVERDUE_ACTION',
);

const pendingAttention = snapshot({
  reviews: [review({ status: 'draft', risk_level: 'GREEN' })],
  actions: [action({ status: 'PENDING_VERIFICATION', due_date: '2026-08-30' })],
  range: 'ALL',
});
assert(pendingAttention.attention.total === 1, 'pending verification action enters attention');
assert(
  deepEqual(pendingAttention.attention.items[0].attentionReasons, ['PENDING_VERIFICATION']),
  'pending reason is PENDING_VERIFICATION',
);

const submittedOpen = snapshot({
  reviews: [review({ status: 'submitted', risk_level: 'GREEN' })],
  actions: [action({ status: 'IN_PROGRESS', due_date: '2026-08-30' })],
  range: 'ALL',
});
assert(submittedOpen.attention.total === 1, 'submitted review with open action enters attention');
assert(
  deepEqual(submittedOpen.attention.items[0].attentionReasons, ['SUBMITTED_WITH_OPEN_ACTION']),
  'submitted-open reason is SUBMITTED_WITH_OPEN_ACTION',
);

const greenDraft = snapshot({
  reviews: [review({ status: 'draft', risk_level: 'GREEN' })],
  range: 'ALL',
});
assert(greenDraft.attention.total === 0, 'normal green draft without action does not enter attention');

const allReasons = snapshot({
  reviews: [review({ status: 'submitted', risk_level: 'RED' })],
  actions: [
    action({ status: 'OPEN', due_date: '2026-08-25' }),
    action({ status: 'PENDING_VERIFICATION', due_date: '2026-08-30' }),
  ],
  range: 'ALL',
});
assert(
  deepEqual(allReasons.attention.items[0].attentionReasons, [
    'OVERDUE_ACTION',
    'HIGH_RISK',
    'PENDING_VERIFICATION',
    'SUBMITTED_WITH_OPEN_ACTION',
  ]),
  'attention reasons fixed order and deduped',
);
const allReasonsItem = allReasons.attention.items[0];
assert(
  allReasonsItem.openActionCount === 2
    && allReasonsItem.overdueActionCount === 1
    && allReasonsItem.pendingVerificationActionCount === 1,
  'attention aggregate counts correct across multiple actions',
);

const attentionSort = snapshot({
  reviews: [
    review({ id: '00000000-0000-0000-0000-000000000201', review_no: 'REV-2026-000001', status: 'submitted', risk_level: 'GREEN' }),
    review({ id: '00000000-0000-0000-0000-000000000202', review_no: 'REV-2026-000002', status: 'draft', risk_level: 'GREEN' }),
    review({ id: '00000000-0000-0000-0000-000000000203', review_no: 'REV-2026-000003', status: 'draft', risk_level: 'RED' }),
    review({ id: '00000000-0000-0000-0000-000000000204', review_no: 'REV-2026-000004', status: 'draft', risk_level: 'GREEN' }),
  ],
  actions: [
    action({ review_id: '00000000-0000-0000-0000-000000000201', status: 'OPEN', due_date: '2026-08-30' }),
    action({ review_id: '00000000-0000-0000-0000-000000000202', status: 'PENDING_VERIFICATION', due_date: '2026-08-30' }),
    action({ review_id: '00000000-0000-0000-0000-000000000204', status: 'OPEN', due_date: '2026-08-25' }),
  ],
  range: 'ALL',
});
assert(
  deepEqual(
    attentionSort.attention.items.map(item => item.reviewId),
    [
      '00000000-0000-0000-0000-000000000204',
      '00000000-0000-0000-0000-000000000203',
      '00000000-0000-0000-0000-000000000202',
      '00000000-0000-0000-0000-000000000201',
    ],
  ),
  'attention sorts overdue, high risk, pending, submitted-open',
);

const tieBreak = snapshot({
  reviews: [
    review({ id: '00000000-0000-0000-0000-000000000301', review_no: 'REV-2026-000002', status: 'draft', risk_level: 'GREEN' }),
    review({ id: '00000000-0000-0000-0000-000000000302', review_no: 'REV-2026-000001', status: 'draft', risk_level: 'GREEN' }),
  ],
  actions: [
    action({ review_id: '00000000-0000-0000-0000-000000000301', status: 'OPEN', due_date: '2026-08-25' }),
    action({ review_id: '00000000-0000-0000-0000-000000000302', status: 'OPEN', due_date: '2026-08-25' }),
  ],
  range: 'ALL',
});
assert(
  tieBreak.attention.items[0].reviewId === '00000000-0000-0000-0000-000000000302',
  'attention tie-break uses reviewNo ascending',
);

const limitedReviews = Array.from({ length: 12 }, (_, index) => review({
  id: '00000000-0000-0000-0000-00000000' + String(400 + index).padStart(4, '0'),
  review_no: 'REV-2026-' + String(400 + index).padStart(6, '0'),
  risk_level: 'RED',
}));
const limited = snapshot({ reviews: limitedReviews, range: 'ALL' });
assert(limited.attention.items.length === 10, 'attention items capped at 10');
assert(limited.attention.total === 12, 'attention total includes all candidates');

const privacySnapshot = snapshot({
  reviews: [review({
    customer_name: 'SECRET_CUSTOMER',
    description: 'SECRET_DESCRIPTION',
    risk_reason: 'SECRET_RISK_REASON',
    impact_summary: 'SECRET_IMPACT',
    email: 'SECRET_EMAIL',
    user_id: 'SECRET_USER',
    org_id: 'SECRET_ORG',
    owner_id: 'SECRET_OWNER_UUID',
  })],
  actions: [action({
    description: 'SECRET_ACTION_DESCRIPTION',
    completion_note: 'SECRET_COMPLETION',
    verification_note: 'SECRET_VERIFY',
    cancel_reason: 'SECRET_CANCEL',
    email: 'SECRET_ACTION_EMAIL',
    org_id: 'SECRET_ACTION_ORG',
  })],
  closedEvents: [closedEvent({
    payload: { secret: 'SECRET_PAYLOAD' },
    org_id: 'SECRET_EVENT_ORG',
  })],
  range: 'ALL',
});
const privacyText = JSON.stringify(privacySnapshot);
for (const marker of [
  'SECRET_CUSTOMER',
  'SECRET_DESCRIPTION',
  'SECRET_RISK_REASON',
  'SECRET_IMPACT',
  'SECRET_EMAIL',
  'SECRET_USER',
  'SECRET_ORG',
  'SECRET_OWNER_UUID',
  'SECRET_ACTION_DESCRIPTION',
  'SECRET_COMPLETION',
  'SECRET_VERIFY',
  'SECRET_CANCEL',
  'SECRET_ACTION_EMAIL',
  'SECRET_ACTION_ORG',
  'SECRET_PAYLOAD',
  'SECRET_EVENT_ORG',
]) {
  assert(!privacyText.includes(marker), 'dashboard DTO hides marker: ' + marker);
}

const eventCounting = snapshot({
  reviews: [review({ status: 'draft', risk_level: 'GREEN' })],
  actions: [action({ status: 'VERIFIED', verified_at: '2026-08-01T00:00:00+08:00' })],
  closedEvents: [
    closedEvent({ event_type: 'ACTION_STARTED' }),
    closedEvent({ event_type: 'ACTION_VERIFIED' }),
    closedEvent({ event_type: 'ACTION_STARTED' }),
  ],
  range: 'ALL',
});
assert(eventCounting.current.openActions === 0, 'current state ignores timeline event counts');
assert(eventCounting.current.overdueActions === 0, 'current state ignores action event counts');

const batchOffsets: number[] = [];
const batchRows = Array.from({ length: 1200 }, (_, index) => ({ id: String(index) }));
const batched = await fetchAllWithBatchPaging(async (offset) => {
  batchOffsets.push(offset);
  return { data: batchRows.slice(offset, offset + 500), error: null };
}, 500);
assert(batched.length === 1200, 'batch paging fetches all rows past 1000');
assert(deepEqual(batchOffsets, [0, 500, 1000]), 'batch paging uses stable offsets');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
