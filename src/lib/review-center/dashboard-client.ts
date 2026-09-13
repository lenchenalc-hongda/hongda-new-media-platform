import type {
  DashboardAttentionItem,
  DashboardAttentionReason,
  DashboardRange,
  DashboardReviewStatus,
  DashboardRiskLevel,
  DashboardSnapshot,
  DistributionBucket,
} from './dashboard';

export class DashboardClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DashboardClientError';
    this.status = status;
    this.code = code;
  }
}

const DASHBOARD_RANGES = new Set(['THIS_MONTH', 'LAST_30_DAYS', 'ALL']);
const STATUS_KEYS = new Set([
  'draft',
  'submitted',
  'in_review',
  'action_required',
  'verifying',
  'closed',
  'archived',
  'rejected',
  'cancelled',
  'UNKNOWN',
]);
const RISK_KEYS = new Set(['RED', 'YELLOW', 'GREEN', 'UNSET', 'UNKNOWN']);
const TYPE_KEYS = new Set(['A', 'B', 'C', 'UNKNOWN']);
const ATTENTION_REASON_KEYS = new Set([
  'OVERDUE_ACTION',
  'HIGH_RISK',
  'PENDING_VERIFICATION',
  'SUBMITTED_WITH_OPEN_ACTION',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): DashboardClientError {
  return new DashboardClientError(200, 'INVALID_RESPONSE', '管理概览数据格式异常');
}

function parseNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidResponse();
  }
  return value;
}

function parseRange(value: unknown): DashboardRange {
  if (typeof value === 'string' && DASHBOARD_RANGES.has(value)) {
    return value as DashboardRange;
  }
  throw invalidResponse();
}

function parseStatus(value: unknown): DashboardReviewStatus {
  if (typeof value === 'string' && STATUS_KEYS.has(value)) {
    return value as DashboardReviewStatus;
  }
  throw invalidResponse();
}

function parseRisk(value: unknown): DashboardRiskLevel {
  if (typeof value === 'string' && RISK_KEYS.has(value)) {
    return value as DashboardRiskLevel;
  }
  throw invalidResponse();
}

function parseType(value: unknown): 'A' | 'B' | 'C' | 'UNKNOWN' {
  if (typeof value === 'string' && TYPE_KEYS.has(value)) {
    return value as 'A' | 'B' | 'C' | 'UNKNOWN';
  }
  throw invalidResponse();
}

function parseDistribution(
  value: unknown,
  allowed: Set<string>,
  field: string,
): DistributionBucket[] {
  if (!Array.isArray(value)) throw invalidResponse();
  const seen = new Set<string>();
  const buckets: DistributionBucket[] = [];
  for (const item of value) {
    if (!isObject(item)) throw invalidResponse();
    const key = typeof item.key === 'string' ? item.key : null;
    if (!key || !allowed.has(key) || seen.has(key)) throw invalidResponse();
    seen.add(key);
    buckets.push({
      key,
      count: parseNonNegativeInt(item.count, `${field}.${key}`),
    });
  }
  if (seen.size !== allowed.size) throw invalidResponse();
  return buckets;
}

function parseAttentionReasons(value: unknown): DashboardAttentionReason[] {
  if (!Array.isArray(value) || value.length < 1) throw invalidResponse();
  const seen = new Set<DashboardAttentionReason>();
  const reasons: DashboardAttentionReason[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !ATTENTION_REASON_KEYS.has(item)) {
      throw invalidResponse();
    }
    const reason = item as DashboardAttentionReason;
    if (seen.has(reason)) throw invalidResponse();
    seen.add(reason);
    reasons.push(reason);
  }
  return reasons;
}

function parseAttentionItem(value: unknown): DashboardAttentionItem {
  if (!isObject(value)) throw invalidResponse();
  if (typeof value.reviewId !== 'string' || !UUID_PATTERN.test(value.reviewId)) {
    throw invalidResponse();
  }
  if (typeof value.reviewNo !== 'string') throw invalidResponse();
  if (typeof value.title !== 'string') throw invalidResponse();
  if (value.ownerDisplayName !== null && typeof value.ownerDisplayName !== 'string') {
    throw invalidResponse();
  }
  return {
    reviewId: value.reviewId,
    reviewNo: value.reviewNo,
    title: value.title,
    riskLevel: parseRisk(value.riskLevel),
    status: parseStatus(value.status),
    ownerDisplayName: value.ownerDisplayName,
    openActionCount: parseNonNegativeInt(value.openActionCount, 'attention.openActionCount'),
    overdueActionCount: parseNonNegativeInt(value.overdueActionCount, 'attention.overdueActionCount'),
    pendingVerificationActionCount: parseNonNegativeInt(
      value.pendingVerificationActionCount,
      'attention.pendingVerificationActionCount',
    ),
    attentionReasons: parseAttentionReasons(value.attentionReasons),
  };
}

export function parseDashboardSnapshot(body: unknown): DashboardSnapshot {
  if (!isObject(body) || body.ok !== true || body.code !== 'OK' || !isObject(body.data)) {
    throw invalidResponse();
  }
  const data = body.data;
  if (!isObject(data.current) || !isObject(data.period) || !isObject(data.distributions)) {
    throw invalidResponse();
  }
  const current = data.current;
  const period = data.period;
  const distributions = data.distributions;
  if (!isObject(data.attention)) throw invalidResponse();
  const attention = data.attention;
  if (!Array.isArray(attention.items)) throw invalidResponse();
  if (attention.items.length > 10) throw invalidResponse();

  const snapshot: DashboardSnapshot = {
    current: {
      openReviews: parseNonNegativeInt(current.openReviews, 'current.openReviews'),
      highRiskReviews: parseNonNegativeInt(current.highRiskReviews, 'current.highRiskReviews'),
      openActions: parseNonNegativeInt(current.openActions, 'current.openActions'),
      overdueActions: parseNonNegativeInt(current.overdueActions, 'current.overdueActions'),
      pendingVerificationActions: parseNonNegativeInt(
        current.pendingVerificationActions,
        'current.pendingVerificationActions',
      ),
    },
    period: {
      range: parseRange(period.range),
      reviewsCreated: parseNonNegativeInt(period.reviewsCreated, 'period.reviewsCreated'),
      reviewsClosedUnique: parseNonNegativeInt(
        period.reviewsClosedUnique,
        'period.reviewsClosedUnique',
      ),
      actionsVerified: parseNonNegativeInt(period.actionsVerified, 'period.actionsVerified'),
    },
    distributions: {
      status: parseDistribution(distributions.status, STATUS_KEYS, 'distributions.status'),
      risk: parseDistribution(distributions.risk, RISK_KEYS, 'distributions.risk'),
      type: parseDistribution(distributions.type, TYPE_KEYS, 'distributions.type'),
    },
    attention: {
      items: attention.items.map(parseAttentionItem),
      total: parseNonNegativeInt(attention.total, 'attention.total'),
    },
  };
  if (snapshot.attention.total < snapshot.attention.items.length) {
    throw invalidResponse();
  }
  return snapshot;
}

export async function fetchDashboardSnapshot(
  range: DashboardRange,
  options?: { signal?: AbortSignal },
): Promise<DashboardSnapshot> {
  const url = `/api/review-center/dashboard?range=${encodeURIComponent(range.toLowerCase())}`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: options?.signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new DashboardClientError(0, 'NETWORK_ERROR', '管理概览加载失败，请重试');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new DashboardClientError(401, 'UNAUTHORIZED', '登录状态已失效，请重新登录。');
    }
    if (response.status === 403) {
      throw new DashboardClientError(403, 'FORBIDDEN', '无权查看管理概览');
    }
    throw new DashboardClientError(response.status, 'INTERNAL_ERROR', '管理概览加载失败，请重试');
  }

  return parseDashboardSnapshot(payload);
}
