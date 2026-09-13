import {
  ACTION_STATUSES,
  getShanghaiBusinessDate,
  isValidDateOnly,
} from './actions';

export type AnalyticsRange = 'LAST_6_MONTHS' | 'LAST_12_MONTHS' | 'THIS_YEAR';

export const ANALYTICS_RANGE_OPTIONS: readonly AnalyticsRange[] = [
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
  'THIS_YEAR',
];

export const ANALYTICS_BATCH_SIZE = 500;

export interface AnalyticsReviewRow {
  id?: unknown;
  created_at?: unknown;
}

export interface AnalyticsActionRow {
  id?: unknown;
  created_at?: unknown;
  status?: unknown;
  verified_at?: unknown;
  cancelled_at?: unknown;
}

export interface AnalyticsTimelineRow {
  id?: unknown;
  review_id?: unknown;
  event_type?: unknown;
  created_at?: unknown;
}

export interface AnalyticsMonthBucket {
  period: string;
  reviewsCreated: number;
  reviewsClosedUnique: number;
  reviewsReopenedUnique: number;
  actionsCreated: number;
  actionsVerified: number;
  actionsCancelled: number;
  verificationCycleSampleCount: number;
  verificationMedianDays: number | null;
}

export interface AnalyticsSummary {
  reviewsCreatedTotal: number;
  reviewsClosedUniqueInRange: number;
  reviewsReopenedUniqueInRange: number;
  actionsCreatedTotal: number;
  actionsVerifiedTotal: number;
  actionsCancelledTotal: number;
  verificationCycleSampleCount: number;
  verificationMedianDays: number | null;
  invalidCycleRowsExcluded: number;
}

export interface AnalyticsSnapshot {
  range: AnalyticsRange;
  timezone: 'Asia/Shanghai';
  buckets: AnalyticsMonthBucket[];
  summary: AnalyticsSummary;
  dataCompleteness: {
    lifecycleHistory: 'PARTIAL_LEGACY';
  };
}

export interface AnalyticsFetchPageResult<T> {
  data: T[] | null;
  error: unknown;
}

export interface AnalyticsRangeBounds {
  start: string;
  end: string;
  months: string[];
}

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value);
}

function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function formatMonthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

function shanghaiDateTimeUtc(dateOnly: string, hour = 0, minute = 0): string {
  return new Date(
    `${dateOnly}T${pad2(hour)}:${pad2(minute)}:00+08:00`,
  ).toISOString();
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function parseAnalyticsRange(
  value: string | null | undefined,
): AnalyticsRange | null {
  if (value === null || value === undefined) return 'LAST_6_MONTHS';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'last_6_months') return 'LAST_6_MONTHS';
  if (normalized === 'last_12_months') return 'LAST_12_MONTHS';
  if (normalized === 'this_year') return 'THIS_YEAR';
  return null;
}

export function getAnalyticsRangeMonths(
  range: AnalyticsRange,
  businessDate: string,
): string[] {
  if (!isValidDateOnly(businessDate)) return [];
  const parsed = parseDateOnly(businessDate);
  if (!parsed) return [];
  const current = { year: parsed.year, month: parsed.month };
  let start: { year: number; month: number };
  let count: number;
  if (range === 'THIS_YEAR') {
    start = { year: current.year, month: 1 };
    count = current.month;
  } else if (range === 'LAST_6_MONTHS') {
    start = addMonths(current.year, current.month, -5);
    count = 6;
  } else {
    start = addMonths(current.year, current.month, -11);
    count = 12;
  }
  const months: string[] = [];
  for (let index = 0; index < count; index++) {
    const item = addMonths(start.year, start.month, index);
    months.push(formatMonthKey(item.year, item.month));
  }
  return months;
}

export function getAnalyticsRangeBounds(
  range: AnalyticsRange,
  businessDate: string,
): AnalyticsRangeBounds | null {
  if (!isValidDateOnly(businessDate)) return null;
  const months = getAnalyticsRangeMonths(range, businessDate);
  if (months.length === 0) return null;
  const first = months[0];
  const last = months[months.length - 1];
  const lastParsed = parseMonthKey(last);
  if (!lastParsed) return null;
  const next = addMonths(lastParsed.year, lastParsed.month, 1);
  return {
    start: shanghaiDateTimeUtc(`${first}-01`),
    end: shanghaiDateTimeUtc(`${formatMonthKey(next.year, next.month)}-01`),
    months,
  };
}

export function shanghaiMonthFromTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return getShanghaiBusinessDate(parsed).slice(0, 7);
  } catch {
    return null;
  }
}

export async function fetchAllWithBatchPaging<T>(
  fetchPage: (offset: number) => Promise<AnalyticsFetchPageResult<T>>,
  batchSize: number = ANALYTICS_BATCH_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Invalid analytics batch size');
  }
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(offset);
    if (page.error) throw page.error;
    const batch = Array.isArray(page.data) ? page.data : [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
  return rows;
}

function safeReviewId(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(raw * 10) / 10;
}

function verificationCycleDays(
  createdAt: unknown,
  verifiedAt: unknown,
): number | null {
  if (typeof createdAt !== 'string' || typeof verifiedAt !== 'string') return null;
  const created = Date.parse(createdAt);
  const verified = Date.parse(verifiedAt);
  if (!Number.isFinite(created) || !Number.isFinite(verified)) return null;
  if (verified < created) return null;
  return (verified - created) / 86400000;
}

export function buildAnalyticsBuckets(months: string[]): AnalyticsMonthBucket[] {
  return months.map(period => ({
    period,
    reviewsCreated: 0,
    reviewsClosedUnique: 0,
    reviewsReopenedUnique: 0,
    actionsCreated: 0,
    actionsVerified: 0,
    actionsCancelled: 0,
    verificationCycleSampleCount: 0,
    verificationMedianDays: null,
  }));
}

export function calculateAnalyticsSnapshot(input: {
  range: AnalyticsRange;
  businessDate: string;
  reviews: AnalyticsReviewRow[];
  timelineEvents: AnalyticsTimelineRow[];
  actionsCreated: AnalyticsActionRow[];
  actionsVerified: AnalyticsActionRow[];
  actionsCancelled: AnalyticsActionRow[];
}): AnalyticsSnapshot {
  const bounds = getAnalyticsRangeBounds(input.range, input.businessDate);
  if (!bounds) {
    throw new Error('Invalid analytics range bounds');
  }
  const monthSet = new Set(bounds.months);
  const buckets = buildAnalyticsBuckets(bounds.months);
  const bucketByMonth = new Map(buckets.map(bucket => [bucket.period, bucket]));

  let reviewsCreatedTotal = 0;
  for (const review of input.reviews) {
    const month = shanghaiMonthFromTimestamp(review.created_at);
    if (!month || !monthSet.has(month)) continue;
    bucketByMonth.get(month)!.reviewsCreated++;
    reviewsCreatedTotal++;
  }

  const closedByMonth = new Map<string, Set<string>>();
  const reopenedByMonth = new Map<string, Set<string>>();
  const closedInRange = new Set<string>();
  const reopenedInRange = new Set<string>();

  for (const event of input.timelineEvents) {
    const month = shanghaiMonthFromTimestamp(event.created_at);
    if (!month || !monthSet.has(month)) continue;
    const reviewId = safeReviewId(event.review_id);
    if (!reviewId) continue;
    if (event.event_type === 'REVIEW_CLOSED') {
      let seen = closedByMonth.get(month);
      if (!seen) {
        seen = new Set();
        closedByMonth.set(month, seen);
      }
      if (!seen.has(reviewId)) {
        seen.add(reviewId);
        bucketByMonth.get(month)!.reviewsClosedUnique++;
      }
      closedInRange.add(reviewId);
    } else if (event.event_type === 'REVIEW_REOPENED') {
      let seen = reopenedByMonth.get(month);
      if (!seen) {
        seen = new Set();
        reopenedByMonth.set(month, seen);
      }
      if (!seen.has(reviewId)) {
        seen.add(reviewId);
        bucketByMonth.get(month)!.reviewsReopenedUnique++;
      }
      reopenedInRange.add(reviewId);
    }
  }

  let actionsCreatedTotal = 0;
  for (const action of input.actionsCreated) {
    const month = shanghaiMonthFromTimestamp(action.created_at);
    if (!month || !monthSet.has(month)) continue;
    bucketByMonth.get(month)!.actionsCreated++;
    actionsCreatedTotal++;
  }

  let actionsVerifiedTotal = 0;
  let actionsCancelledTotal = 0;
  let verificationCycleSampleCount = 0;
  let invalidCycleRowsExcluded = 0;
  const rangeCycleSamples: number[] = [];
  const cycleSamplesByMonth = new Map<string, number[]>();

  for (const action of input.actionsVerified) {
    if (action.status !== 'VERIFIED') continue;
    const verifiedAt = action.verified_at;
    if (typeof verifiedAt !== 'string' || !Number.isFinite(Date.parse(verifiedAt))) {
      invalidCycleRowsExcluded++;
      continue;
    }
    const verifiedMonth = shanghaiMonthFromTimestamp(verifiedAt);
    if (!verifiedMonth || !monthSet.has(verifiedMonth)) continue;
    actionsVerifiedTotal++;
    const bucket = bucketByMonth.get(verifiedMonth)!;
    bucket.actionsVerified++;
    const duration = verificationCycleDays(action.created_at, action.verified_at);
    if (duration === null) {
      invalidCycleRowsExcluded++;
      continue;
    }
    bucket.verificationCycleSampleCount++;
    const samples = cycleSamplesByMonth.get(verifiedMonth) ?? [];
    samples.push(duration);
    cycleSamplesByMonth.set(verifiedMonth, samples);
    rangeCycleSamples.push(duration);
    verificationCycleSampleCount++;
  }

  for (const [month, samples] of cycleSamplesByMonth) {
    const bucket = bucketByMonth.get(month);
    if (bucket) bucket.verificationMedianDays = median(samples);
  }

  for (const action of input.actionsCancelled) {
    if (action.status !== 'CANCELLED') continue;
    const month = shanghaiMonthFromTimestamp(action.cancelled_at);
    if (!month || !monthSet.has(month)) continue;
    bucketByMonth.get(month)!.actionsCancelled++;
    actionsCancelledTotal++;
  }

  return {
    range: input.range,
    timezone: 'Asia/Shanghai',
    buckets,
    summary: {
      reviewsCreatedTotal,
      reviewsClosedUniqueInRange: closedInRange.size,
      reviewsReopenedUniqueInRange: reopenedInRange.size,
      actionsCreatedTotal,
      actionsVerifiedTotal,
      actionsCancelledTotal,
      verificationCycleSampleCount,
      verificationMedianDays: median(rangeCycleSamples),
      invalidCycleRowsExcluded,
    },
    dataCompleteness: {
      lifecycleHistory: 'PARTIAL_LEGACY',
    },
  };
}

export const ANALYTICS_ACTION_STATUSES = ACTION_STATUSES;
