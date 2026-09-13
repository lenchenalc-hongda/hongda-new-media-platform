import {
  ACTION_STATUSES,
  getShanghaiBusinessDate,
  isActionOverdue,
  isValidDateOnly,
  type ActionStatus,
} from './actions';

export type DashboardRange = 'THIS_MONTH' | 'LAST_30_DAYS' | 'ALL';

export const DASHBOARD_RANGES: readonly DashboardRange[] = [
  'THIS_MONTH',
  'LAST_30_DAYS',
  'ALL',
];

export const DASHBOARD_BATCH_SIZE = 500;

const REVIEW_STATUS_KEYS = [
  'draft',
  'submitted',
  'in_review',
  'action_required',
  'verifying',
  'closed',
  'archived',
  'rejected',
  'cancelled',
] as const;

const RISK_LEVEL_KEYS = ['RED', 'YELLOW', 'GREEN'] as const;
const REVIEW_TYPE_KEYS = ['A', 'B', 'C'] as const;

export type DashboardReviewStatus =
  | typeof REVIEW_STATUS_KEYS[number]
  | 'UNKNOWN';

export type DashboardRiskLevel =
  | typeof RISK_LEVEL_KEYS[number]
  | 'UNSET'
  | 'UNKNOWN';

export type DashboardReviewType =
  | typeof REVIEW_TYPE_KEYS[number]
  | 'UNKNOWN';

export type DashboardAttentionReason =
  | 'HIGH_RISK'
  | 'OVERDUE_ACTION'
  | 'PENDING_VERIFICATION'
  | 'SUBMITTED_WITH_OPEN_ACTION';

export interface DashboardReviewRow {
  id?: unknown;
  review_no?: unknown;
  title?: unknown;
  review_type?: unknown;
  status?: unknown;
  risk_level?: unknown;
  owner_id?: unknown;
  created_at?: unknown;
}

export interface DashboardActionRow {
  review_id?: unknown;
  status?: unknown;
  due_date?: unknown;
  verified_at?: unknown;
}

export interface DashboardClosedEventRow {
  review_id?: unknown;
  event_type?: unknown;
  created_at?: unknown;
}

export type DashboardOwnerMap = ReadonlyMap<string, string>;

export interface DashboardRangeBounds {
  start: string;
  end: string;
}

export interface DashboardFetchPageResult<T> {
  data: T[] | null;
  error: unknown;
}

export interface DashboardCurrentState {
  openReviews: number;
  highRiskReviews: number;
  openActions: number;
  overdueActions: number;
  pendingVerificationActions: number;
}

export interface DashboardPeriod {
  range: DashboardRange;
  reviewsCreated: number;
  reviewsClosedUnique: number;
  actionsVerified: number;
}

export interface DistributionBucket {
  key: string;
  count: number;
}

export interface DashboardDistributions {
  status: DistributionBucket[];
  risk: DistributionBucket[];
  type: DistributionBucket[];
}

export interface DashboardAttentionItem {
  reviewId: string;
  reviewNo: string;
  title: string;
  riskLevel: DashboardRiskLevel;
  status: DashboardReviewStatus;
  ownerDisplayName: string | null;
  openActionCount: number;
  overdueActionCount: number;
  pendingVerificationActionCount: number;
  attentionReasons: DashboardAttentionReason[];
}

export interface DashboardSnapshot {
  current: DashboardCurrentState;
  period: DashboardPeriod;
  distributions: DashboardDistributions;
  attention: {
    items: DashboardAttentionItem[];
    total: number;
  };
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeReviewId(value: unknown): string {
  const text = safeString(value).trim();
  return text === '' ? '' : text;
}

function safeTitle(value: unknown): string {
  const text = safeString(value).trim();
  return text === '' ? '未命名复盘' : text;
}

function normalizeReviewStatus(value: unknown): DashboardReviewStatus {
  return typeof value === 'string'
    && (REVIEW_STATUS_KEYS as readonly string[]).includes(value)
    ? value as DashboardReviewStatus
    : 'UNKNOWN';
}

function normalizeRiskLevel(value: unknown): DashboardRiskLevel {
  if (value === null || value === undefined) return 'UNSET';
  return typeof value === 'string'
    && (RISK_LEVEL_KEYS as readonly string[]).includes(value)
    ? value as DashboardRiskLevel
    : 'UNKNOWN';
}

function normalizeReviewType(value: unknown): DashboardReviewType {
  return typeof value === 'string'
    && (REVIEW_TYPE_KEYS as readonly string[]).includes(value)
    ? value as DashboardReviewType
    : 'UNKNOWN';
}

function normalizeActionStatus(value: unknown): ActionStatus {
  return typeof value === 'string'
    && (ACTION_STATUSES as readonly string[]).includes(value)
    ? value as ActionStatus
    : 'UNKNOWN';
}

function isOpenActionStatus(status: ActionStatus): boolean {
  return status === 'OPEN'
    || status === 'IN_PROGRESS'
    || status === 'PENDING_VERIFICATION';
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

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value);
}

function addCalendarDays(value: string, amount: number): string {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new Error('Invalid date only value');
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDashboardRange(
  value: string | null | undefined,
): DashboardRange | null {
  if (value === null || value === undefined) return 'THIS_MONTH';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'this_month') return 'THIS_MONTH';
  if (normalized === 'last_30_days') return 'LAST_30_DAYS';
  if (normalized === 'all') return 'ALL';
  return null;
}

export function getDashboardRangeBounds(
  range: DashboardRange,
  businessDate: string,
): DashboardRangeBounds | null {
  if (!isValidDateOnly(businessDate)) return null;
  if (range === 'ALL') return null;
  if (range === 'LAST_30_DAYS') {
    return {
      start: addCalendarDays(businessDate, -29),
      end: businessDate,
    };
  }
  const parsed = parseDateOnly(businessDate);
  if (!parsed) return null;
  return {
    start: `${parsed.year}-${pad2(parsed.month)}-01`,
    end: `${parsed.year}-${pad2(parsed.month)}-${pad2(daysInMonth(parsed.year, parsed.month))}`,
  };
}

export function getShanghaiDateOnlyFromTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return getShanghaiBusinessDate(parsed);
  } catch {
    return null;
  }
}

export function isTimestampInDashboardRange(
  value: unknown,
  range: DashboardRange,
  bounds: DashboardRangeBounds | null,
): boolean {
  if (typeof value !== 'string') return false;
  if (!Number.isFinite(Date.parse(value))) return false;
  if (range === 'ALL') return true;
  if (!bounds) return false;
  const dateOnly = getShanghaiDateOnlyFromTimestamp(value);
  if (!dateOnly) return false;
  return dateOnly >= bounds.start && dateOnly <= bounds.end;
}

export function isDateOnlyInDashboardRange(
  value: unknown,
  range: DashboardRange,
  bounds: DashboardRangeBounds | null,
): boolean {
  if (typeof value !== 'string' || !isValidDateOnly(value)) return false;
  if (range === 'ALL') return true;
  if (!bounds) return false;
  return value >= bounds.start && value <= bounds.end;
}

export async function fetchAllWithBatchPaging<T>(
  fetchPage: (offset: number) => Promise<DashboardFetchPageResult<T>>,
  batchSize: number = DASHBOARD_BATCH_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Invalid dashboard batch size');
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

function emptyDistributions(): DashboardDistributions {
  return {
    status: REVIEW_STATUS_KEYS.map(key => ({ key, count: 0 })),
    risk: ['RED', 'YELLOW', 'GREEN', 'UNSET', 'UNKNOWN'].map(key => ({ key, count: 0 })),
    type: ['A', 'B', 'C', 'UNKNOWN'].map(key => ({ key, count: 0 })),
  };
}

function buildStatusDistributions(reviews: Array<{ status: DashboardReviewStatus }>): DistributionBucket[] {
  const counts = new Map<string, number>(REVIEW_STATUS_KEYS.map(key => [key, 0]));
  counts.set('UNKNOWN', 0);
  for (const review of reviews) {
    counts.set(review.status, (counts.get(review.status) ?? 0) + 1);
  }
  return [...REVIEW_STATUS_KEYS, 'UNKNOWN'].map(key => ({ key, count: counts.get(key) ?? 0 }));
}

function buildRiskDistributions(reviews: Array<{ risk: DashboardRiskLevel }>): DistributionBucket[] {
  const keys: DashboardRiskLevel[] = ['RED', 'YELLOW', 'GREEN', 'UNSET', 'UNKNOWN'];
  const counts = new Map<string, number>(keys.map(key => [key, 0]));
  for (const review of reviews) {
    counts.set(review.risk, (counts.get(review.risk) ?? 0) + 1);
  }
  return keys.map(key => ({ key, count: counts.get(key) ?? 0 }));
}

function buildTypeDistributions(reviews: Array<{ reviewType: DashboardReviewType }>): DistributionBucket[] {
  const keys: DashboardReviewType[] = ['A', 'B', 'C', 'UNKNOWN'];
  const counts = new Map<string, number>(keys.map(key => [key, 0]));
  for (const review of reviews) {
    counts.set(review.reviewType, (counts.get(review.reviewType) ?? 0) + 1);
  }
  return keys.map(key => ({ key, count: counts.get(key) ?? 0 }));
}

interface NormalizedReview {
  id: string;
  reviewNo: string;
  title: string;
  status: DashboardReviewStatus;
  risk: DashboardRiskLevel;
  reviewType: DashboardReviewType;
  createdAt: unknown;
  ownerId: string | null;
}

interface ActionAggregate {
  open: number;
  overdue: number;
  pendingVerification: number;
}

function attentionSortScore(reasons: DashboardAttentionReason[]): number {
  let score = 0;
  if (reasons.includes('OVERDUE_ACTION')) score += 3;
  if (reasons.includes('HIGH_RISK')) score += 2;
  if (reasons.includes('PENDING_VERIFICATION')) score += 1;
  return score;
}

export function calculateDashboardSnapshot(input: {
  reviews: DashboardReviewRow[];
  actions: DashboardActionRow[];
  closedEvents: DashboardClosedEventRow[];
  ownerMap?: DashboardOwnerMap;
  range: DashboardRange;
  businessDate: string;
  attentionLimit?: number;
}): DashboardSnapshot {
  const ownerMap = input.ownerMap ?? new Map<string, string>();
  const attentionLimit = Number.isInteger(input.attentionLimit) && (input.attentionLimit ?? 0) > 0
    ? input.attentionLimit as number
    : 10;
  const bounds = getDashboardRangeBounds(input.range, input.businessDate);
  const now = new Date(`${input.businessDate}T12:00:00+08:00`);

  const normalizedReviews: NormalizedReview[] = input.reviews.map(row => ({
    id: safeReviewId(row.id),
    reviewNo: safeString(row.review_no).trim(),
    title: safeTitle(row.title),
    status: normalizeReviewStatus(row.status),
    risk: normalizeRiskLevel(row.risk_level),
    reviewType: normalizeReviewType(row.review_type),
    createdAt: row.created_at,
    ownerId: typeof row.owner_id === 'string' ? row.owner_id : null,
  }));

  let openReviews = 0;
  let highRiskReviews = 0;
  for (const review of normalizedReviews) {
    if (review.status === 'draft' || review.status === 'submitted') {
      openReviews++;
      if (review.risk === 'RED') highRiskReviews++;
    }
  }

  const actionAggregates = new Map<string, ActionAggregate>();
  let openActions = 0;
  let overdueActions = 0;
  let pendingVerificationActions = 0;
  let actionsVerified = 0;

  for (const row of input.actions) {
    const status = normalizeActionStatus(row.status);
    const dueDate = safeString(row.due_date);
    const isOpen = isOpenActionStatus(status);
    const isOverdue = isActionOverdue({ dueDate, status, now });
    const isPending = status === 'PENDING_VERIFICATION';
    if (isOpen) openActions++;
    if (isOverdue) overdueActions++;
    if (isPending) pendingVerificationActions++;
    if (status === 'VERIFIED' && isTimestampInDashboardRange(row.verified_at, input.range, bounds)) {
      actionsVerified++;
    }

    const reviewId = typeof row.review_id === 'string' ? row.review_id : null;
    if (reviewId) {
      const aggregate = actionAggregates.get(reviewId) ?? { open: 0, overdue: 0, pendingVerification: 0 };
      if (isOpen) aggregate.open++;
      if (isOverdue) aggregate.overdue++;
      if (isPending) aggregate.pendingVerification++;
      actionAggregates.set(reviewId, aggregate);
    }
  }

  const reviewsCreated = normalizedReviews.filter(review =>
    isTimestampInDashboardRange(review.createdAt, input.range, bounds)
  ).length;

  const closedReviewIds = new Set<string>();
  let reviewsClosedUnique = 0;
  for (const event of input.closedEvents) {
    if (safeString(event.event_type) !== 'REVIEW_CLOSED') continue;
    if (!isTimestampInDashboardRange(event.created_at, input.range, bounds)) continue;
    const reviewId = safeReviewId(event.review_id);
    if (!reviewId || closedReviewIds.has(reviewId)) continue;
    closedReviewIds.add(reviewId);
    reviewsClosedUnique++;
  }

  const candidates: DashboardAttentionItem[] = [];
  for (const review of normalizedReviews) {
    if (!review.id) continue;
    const aggregate = actionAggregates.get(review.id) ?? { open: 0, overdue: 0, pendingVerification: 0 };
    const reasons: DashboardAttentionReason[] = [];
    if (aggregate.overdue > 0) reasons.push('OVERDUE_ACTION');
    if ((review.status === 'draft' || review.status === 'submitted') && review.risk === 'RED') {
      reasons.push('HIGH_RISK');
    }
    if (aggregate.pendingVerification > 0) reasons.push('PENDING_VERIFICATION');
    if (review.status === 'submitted' && aggregate.open > 0) {
      reasons.push('SUBMITTED_WITH_OPEN_ACTION');
    }
    if (reasons.length === 0) continue;

    const ownerDisplayName = review.ownerId ? ownerMap.get(review.ownerId) ?? null : null;
    candidates.push({
      reviewId: review.id,
      reviewNo: review.reviewNo,
      title: review.title,
      riskLevel: review.risk,
      status: review.status,
      ownerDisplayName,
      openActionCount: aggregate.open,
      overdueActionCount: aggregate.overdue,
      pendingVerificationActionCount: aggregate.pendingVerification,
      attentionReasons: reasons,
    });
  }

  candidates.sort((a, b) => {
    const scoreA = attentionSortScore(a.attentionReasons);
    const scoreB = attentionSortScore(b.attentionReasons);
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (a.overdueActionCount !== b.overdueActionCount) {
      return b.overdueActionCount - a.overdueActionCount;
    }
    if (a.pendingVerificationActionCount !== b.pendingVerificationActionCount) {
      return b.pendingVerificationActionCount - a.pendingVerificationActionCount;
    }
    if (a.openActionCount !== b.openActionCount) {
      return b.openActionCount - a.openActionCount;
    }
    const reviewNoCompare = a.reviewNo.localeCompare(b.reviewNo, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (reviewNoCompare !== 0) return reviewNoCompare;
    return a.reviewId.localeCompare(b.reviewId);
  });

  const distributions = emptyDistributions();
  distributions.status = buildStatusDistributions(normalizedReviews);
  distributions.risk = buildRiskDistributions(normalizedReviews);
  distributions.type = buildTypeDistributions(normalizedReviews);

  return {
    current: {
      openReviews,
      highRiskReviews,
      openActions,
      overdueActions,
      pendingVerificationActions,
    },
    period: {
      range: input.range,
      reviewsCreated,
      reviewsClosedUnique,
      actionsVerified,
    },
    distributions,
    attention: {
      items: candidates.slice(0, attentionLimit),
      total: candidates.length,
    },
  };
}
