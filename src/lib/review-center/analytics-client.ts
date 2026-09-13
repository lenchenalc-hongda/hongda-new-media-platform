import type {
  AnalyticsMonthBucket,
  AnalyticsRange,
  AnalyticsSnapshot,
  AnalyticsSummary,
} from './analytics';

export class AnalyticsClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AnalyticsClientError';
    this.status = status;
    this.code = code;
  }
}

const ANALYTICS_RANGES = new Set(['LAST_6_MONTHS', 'LAST_12_MONTHS', 'THIS_YEAR']);
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): AnalyticsClientError {
  return new AnalyticsClientError(200, 'INVALID_RESPONSE', '分析数据格式异常');
}

function parseNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidResponse();
  }
  return value;
}

function parseNullableNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
  ) {
    throw invalidResponse();
  }
  return value;
}

function parseRange(value: unknown): AnalyticsRange {
  if (typeof value === 'string' && ANALYTICS_RANGES.has(value)) {
    return value as AnalyticsRange;
  }
  throw invalidResponse();
}

function parsePeriod(value: unknown): string {
  if (typeof value !== 'string' || !PERIOD_PATTERN.test(value)) {
    throw invalidResponse();
  }
  return value;
}

function parseBucket(value: unknown): AnalyticsMonthBucket {
  if (!isObject(value)) throw invalidResponse();
  const period = parsePeriod(value.period);
  const bucket: AnalyticsMonthBucket = {
    period,
    reviewsCreated: parseNonNegativeInt(value.reviewsCreated, 'bucket.reviewsCreated'),
    reviewsClosedUnique: parseNonNegativeInt(value.reviewsClosedUnique, 'bucket.reviewsClosedUnique'),
    reviewsReopenedUnique: parseNonNegativeInt(value.reviewsReopenedUnique, 'bucket.reviewsReopenedUnique'),
    actionsCreated: parseNonNegativeInt(value.actionsCreated, 'bucket.actionsCreated'),
    actionsVerified: parseNonNegativeInt(value.actionsVerified, 'bucket.actionsVerified'),
    actionsCancelled: parseNonNegativeInt(value.actionsCancelled, 'bucket.actionsCancelled'),
    verificationCycleSampleCount: parseNonNegativeInt(
      value.verificationCycleSampleCount,
      'bucket.verificationCycleSampleCount',
    ),
    verificationMedianDays: parseNullableNonNegativeNumber(
      value.verificationMedianDays,
      'bucket.verificationMedianDays',
    ),
  };
  if (bucket.verificationCycleSampleCount > bucket.actionsVerified) {
    throw invalidResponse();
  }
  return bucket;
}

function parseSummary(value: unknown): AnalyticsSummary {
  if (!isObject(value)) throw invalidResponse();
  return {
    reviewsCreatedTotal: parseNonNegativeInt(value.reviewsCreatedTotal, 'summary.reviewsCreatedTotal'),
    reviewsClosedUniqueInRange: parseNonNegativeInt(
      value.reviewsClosedUniqueInRange,
      'summary.reviewsClosedUniqueInRange',
    ),
    reviewsReopenedUniqueInRange: parseNonNegativeInt(
      value.reviewsReopenedUniqueInRange,
      'summary.reviewsReopenedUniqueInRange',
    ),
    actionsCreatedTotal: parseNonNegativeInt(value.actionsCreatedTotal, 'summary.actionsCreatedTotal'),
    actionsVerifiedTotal: parseNonNegativeInt(value.actionsVerifiedTotal, 'summary.actionsVerifiedTotal'),
    actionsCancelledTotal: parseNonNegativeInt(value.actionsCancelledTotal, 'summary.actionsCancelledTotal'),
    verificationCycleSampleCount: parseNonNegativeInt(
      value.verificationCycleSampleCount,
      'summary.verificationCycleSampleCount',
    ),
    verificationMedianDays: parseNullableNonNegativeNumber(
      value.verificationMedianDays,
      'summary.verificationMedianDays',
    ),
    invalidCycleRowsExcluded: parseNonNegativeInt(
      value.invalidCycleRowsExcluded,
      'summary.invalidCycleRowsExcluded',
    ),
  };
}

export function parseAnalyticsSnapshot(body: unknown): AnalyticsSnapshot {
  if (!isObject(body) || body.ok !== true || body.code !== 'OK' || !isObject(body.data)) {
    throw invalidResponse();
  }
  const data = body.data;
  if (!isObject(data.buckets) && !Array.isArray(data.buckets)) {
    throw invalidResponse();
  }
  if (!Array.isArray(data.buckets) || data.buckets.length < 1) {
    throw invalidResponse();
  }
  if (!isObject(data.summary)) throw invalidResponse();
  if (!isObject(data.dataCompleteness) || data.dataCompleteness.lifecycleHistory !== 'PARTIAL_LEGACY') {
    throw invalidResponse();
  }
  if (data.timezone !== 'Asia/Shanghai') throw invalidResponse();

  const buckets = data.buckets.map(parseBucket);
  const periods = new Set(buckets.map(bucket => bucket.period));
  if (periods.size !== buckets.length) throw invalidResponse();

  return {
    range: parseRange(data.range),
    timezone: 'Asia/Shanghai',
    buckets,
    summary: parseSummary(data.summary),
    dataCompleteness: {
      lifecycleHistory: 'PARTIAL_LEGACY',
    },
  };
}

export async function fetchAnalyticsSnapshot(
  range: AnalyticsRange,
  options?: { signal?: AbortSignal },
): Promise<AnalyticsSnapshot> {
  const url = `/api/review-center/analytics?range=${encodeURIComponent(range.toLowerCase())}`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: options?.signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new AnalyticsClientError(0, 'NETWORK_ERROR', '分析数据加载失败，请重试');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new AnalyticsClientError(401, 'UNAUTHORIZED', '登录状态已失效，请重新登录。');
    }
    if (response.status === 403) {
      throw new AnalyticsClientError(403, 'FORBIDDEN', '无权查看分析数据');
    }
    throw new AnalyticsClientError(response.status, 'INTERNAL_ERROR', '分析数据加载失败，请重试');
  }

  return parseAnalyticsSnapshot(payload);
}
