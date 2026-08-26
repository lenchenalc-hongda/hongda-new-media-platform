import { MEMBER_ROLE_OPTIONS } from './members-editor';
import type { TimelineItemDTO, TimelinePageInfo } from './timeline';

export const AUTH_ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  manager: '管理人员',
  operator: '操作人员',
  sales: '业务人员',
  viewer: '查看人员',
};

export const MEMBER_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  MEMBER_ROLE_OPTIONS.map(option => [option.value, option.label]),
);

export const REVIEW_TYPE_LABELS: Record<string, string> = {
  A: 'A类 · 生产前 / 订单与信任风险',
  B: 'B类 · 生产 / 品质与交付异常',
  C: 'C类 · 前端问题最终在生产爆发',
};

export const BASIC_FIELD_LABELS: Record<string, string> = {
  title: '复盘标题',
  review_type: '复盘类型',
  occurred_at: '发生时间',
  customer_name: '客户名称',
  order_no: '订单编号',
  project_name: '项目名称',
  product_name: '产品名称',
  process_name: '工艺名称',
  description: '问题描述',
  impact_summary: '影响说明',
  risk_level: '风险等级',
  risk_reason: '风险原因',
};

export const TYPE_DETAIL_FIELD_LABELS: Record<string, string> = {
  additional_notes: '补充说明',
  pre_production_stage: '生产前阶段',
  problem_found_stage: '问题发现阶段',
  order_loss_reason: '丢单原因',
  customer_trust_impact: '客户信任影响',
  customer_notified: '是否通知客户',
  abnormal_phase: '异常阶段',
  abnormal_phenomenon: '异常现象',
  defect_rate: '不良率',
  defect_items: '不良项目',
  delivery_impact: '交付影响',
  onsite_records: '现场记录',
  frontend_stage: '前端阶段',
  production_stage: '生产阶段',
  root_cause_summary: '根因总结',
  responsibility: '责任归属',
  improvement_advice: '改善建议',
};

const ACTION_TIMELINE_EVENT_TYPES = new Set([
  'ACTION_CREATED',
  'ACTION_UPDATED',
  'ACTION_STARTED',
  'ACTION_SUBMITTED_FOR_VERIFICATION',
  'ACTION_VERIFIED',
  'ACTION_RETURNED',
  'ACTION_CANCELLED',
]);

const ACTION_CHANGED_FIELD_LABELS: Record<string, string> = {
  title: '标题',
  description: '描述',
  action_type: '行动类型',
  owner_profile_id: '负责人',
  due_date: '截止日期',
};

const ACTION_EVENT_PRESENTATION: Record<string, { full: string; generic: string }> = {
  ACTION_CREATED: { full: '创建了改善行动', generic: '创建了一项改善行动' },
  ACTION_UPDATED: { full: '更新了改善行动', generic: '更新了一项改善行动' },
  ACTION_STARTED: { full: '开始执行改善行动', generic: '开始执行了一项改善行动' },
  ACTION_SUBMITTED_FOR_VERIFICATION: {
    full: '提交改善行动',
    generic: '提交了一项改善行动等待验证',
  },
  ACTION_VERIFIED: { full: '验证通过改善行动', generic: '验证通过了一项改善行动' },
  ACTION_RETURNED: { full: '退回了改善行动', generic: '退回了一项改善行动' },
  ACTION_CANCELLED: { full: '取消了改善行动', generic: '取消了一项改善行动' },
};

export interface TimelineEventPresentation {
  title: string;
  summaryItems: string[];
  actorLabel: string;
  actorRoleLabel: string | null;
  actorStateLabel: string | null;
}

export function formatAuthRoleLabel(role: string | null | undefined): string | null {
  return role ? AUTH_ROLE_LABELS[role] ?? null : null;
}

export function formatMemberRoleLabel(role: string | null | undefined): string | null {
  return role ? MEMBER_ROLE_LABELS[role] ?? null : null;
}

export function formatReviewTypeLabel(reviewType: string | null | undefined): string | null {
  return reviewType ? REVIEW_TYPE_LABELS[reviewType] ?? null : null;
}

export function reviewTypeClassName(reviewType: unknown): string | null {
  return reviewType === 'A' || reviewType === 'B' || reviewType === 'C'
    ? `${reviewType}类`
    : null;
}

export function formatTimelineTimestamp(
  value: string,
  options?: { timeZone?: string },
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map(part => [part.type, part.value]));
  const year = map.get('year') ?? '';
  const month = map.get('month') ?? '';
  const day = map.get('day') ?? '';
  const hour = map.get('hour') ?? '';
  const minute = map.get('minute') ?? '';
  if (!year || !month || !day || !hour || !minute) return '时间未知';
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatTimelineFieldLabels(
  fields: unknown,
  labels: Record<string, string>,
): string[] {
  if (!Array.isArray(fields)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    if (typeof field !== 'string') continue;
    const label = labels[field];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
}

function getActionTimelineSequence(details: Record<string, unknown>): number | undefined {
  const value = details.sequence;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : undefined;
}

function getActionTimelineTitle(details: Record<string, unknown>): string | undefined {
  const value = details.title;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return undefined;
  return trimmed;
}

function getActionTimelineChangedFields(details: Record<string, unknown>): string[] {
  const value = details.changedFields;
  return Array.isArray(value) ? value.slice(0, 5) : [];
}

function formatActionTimelineEvent(item: TimelineItemDTO): TimelineEventPresentation {
  const base = {
    actorLabel: formatTimelineActorLabel(item.actor.displayName),
    actorRoleLabel: formatAuthRoleLabel(item.actor.role),
    actorStateLabel: item.actor.isActive === false ? '已停用' : null,
  };
  const spec = ACTION_EVENT_PRESENTATION[item.eventType];
  if (!spec) {
    return { ...base, title: '记录了一项项目动态', summaryItems: [] };
  }

  const sequence = getActionTimelineSequence(item.details);
  const title = getActionTimelineTitle(item.details);
  const hasIdentity = sequence !== undefined && title !== undefined;
  let primary: string;
  if (hasIdentity) {
    primary = item.eventType === 'ACTION_SUBMITTED_FOR_VERIFICATION'
      ? `提交改善行动 #${sequence} 等待验证：${title}`
      : `${spec.full} #${sequence}：${title}`;
  } else {
    primary = spec.generic;
  }

  const summaryItems: string[] = [];
  if (item.eventType === 'ACTION_UPDATED') {
    const labels = formatTimelineFieldLabels(
      getActionTimelineChangedFields(item.details),
      ACTION_CHANGED_FIELD_LABELS,
    );
    if (labels.length > 0) summaryItems.push(`变更内容：${labels.join('、')}`);
  }

  return { ...base, title: primary, summaryItems };
}

export function formatTimelineActorLabel(displayName: unknown): string {
  return typeof displayName === 'string' && displayName.trim() ? displayName : '系统操作';
}

export function formatTimelineEvent(item: TimelineItemDTO): TimelineEventPresentation {
  const base = {
    actorLabel: formatTimelineActorLabel(item.actor.displayName),
    actorRoleLabel: formatAuthRoleLabel(item.actor.role),
    actorStateLabel: item.actor.isActive === false ? '已停用' : null,
  };

  if (item.eventType === 'REVIEW_CREATED') {
    const summaryItems: string[] = [];
    const reviewType = formatReviewTypeLabel(
      typeof item.details.reviewType === 'string' ? item.details.reviewType : null,
    );
    if (reviewType) summaryItems.push(`复盘类型：${reviewType}`);
    return { ...base, title: '创建了复盘', summaryItems };
  }

  if (item.eventType === 'REVIEW_UPDATED') {
    const labels = formatTimelineFieldLabels(item.details.changedFields, BASIC_FIELD_LABELS);
    const summaryItems = labels.length > 0 ? [`修改了：${labels.join('、')}`] : [];
    return { ...base, title: '更新了复盘基本信息', summaryItems };
  }

  if (item.eventType === 'TYPE_DETAILS_SAVED') {
    const summaryItems: string[] = [];
    const reviewType = reviewTypeClassName(item.details.reviewType);
    if (reviewType) summaryItems.push(`${reviewType}专项复盘`);
    const labels = formatTimelineFieldLabels(item.details.changedFields, TYPE_DETAIL_FIELD_LABELS);
    if (labels.length > 0) summaryItems.push(`修改了：${labels.join('、')}`);
    return {
      ...base,
      title: item.details.created === true ? '填写了专项复盘内容' : '更新了专项复盘内容',
      summaryItems,
    };
  }

  if (item.eventType === 'ASSIGNMENT_UPDATED') {
    const ownerChanged = item.details.ownerChanged === true;
    const pmoChanged = item.details.pmoChanged === true;
    let title: string;
    if (ownerChanged && pmoChanged) {
      title = '调整了项目负责人和 PMO';
    } else if (ownerChanged) {
      title = '调整了项目负责人';
    } else if (pmoChanged) {
      title = '调整了项目 PMO';
    } else {
      title = '更新了项目分工';
    }
    return { ...base, title, summaryItems: [] };
  }

  if (item.eventType === 'MEMBER_ADDED') {
    const summaryItems: string[] = [];
    const role = formatMemberRoleLabel(
      typeof item.details.memberRole === 'string' ? item.details.memberRole : null,
    );
    if (role) {
      summaryItems.push(`角色：${role}${item.details.isPrimary === true ? ' · 主负责人' : ''}`);
    }
    return { ...base, title: '添加了项目成员', summaryItems };
  }

  if (item.eventType === 'MEMBER_REMOVED') {
    const summaryItems: string[] = [];
    const role = formatMemberRoleLabel(
      typeof item.details.memberRole === 'string' ? item.details.memberRole : null,
    );
    if (role) {
      summaryItems.push(`角色：${role}${item.details.wasPrimary === true ? ' · 原主负责人' : ''}`);
    }
    return { ...base, title: '移除了项目成员', summaryItems };
  }

  if (item.eventType === 'MEMBER_PRIMARY_SET') {
    const summaryItems: string[] = [];
    const role = formatMemberRoleLabel(
      typeof item.details.memberRole === 'string' ? item.details.memberRole : null,
    );
    if (role) {
      summaryItems.push(
        `${role}${item.details.hadPreviousPrimary === true ? ' · 更换主负责人' : ' · 设置主负责人'}`,
      );
    }
    return { ...base, title: '设置了角色主负责人', summaryItems };
  }

  if (item.eventType === 'REVIEW_SUBMITTED') {
    return { ...base, title: '提交了复盘', summaryItems: [] };
  }

  if (item.eventType === 'REVIEW_CLOSED') {
    return { ...base, title: '关闭了复盘', summaryItems: [] };
  }

  if (item.eventType === 'REVIEW_REOPENED') {
    if (item.details.fromStatus === 'submitted') {
      return { ...base, title: '退回了复盘修改', summaryItems: [] };
    }
    if (item.details.fromStatus === 'closed') {
      const reason = typeof item.details.reason === 'string'
        ? item.details.reason.trim()
        : '';
      const summaryItems = reason ? [`重新打开原因：${reason}`] : [];
      return { ...base, title: '重新打开了复盘', summaryItems };
    }
    return { ...base, title: '更新了复盘状态', summaryItems: [] };
  }

  if (ACTION_TIMELINE_EVENT_TYPES.has(item.eventType)) {
    return formatActionTimelineEvent(item);
  }

  return { ...base, title: '记录了一项项目动态', summaryItems: [] };
}

export function timelineErrorMessage(status: number): string {
  if (status === 401) return '登录状态已失效，请刷新页面后重试。';
  if (status === 403) return '暂无权限查看项目动态。';
  if (status === 404) return '项目动态暂不可用，请刷新页面确认复盘状态。';
  if (status === 400) return '项目动态请求参数异常。';
  return '项目动态加载失败，请稍后重试。';
}

export interface TimelineRequestGuard {
  next(): number;
  isCurrent(requestId: number): boolean;
  invalidate(): void;
}

export function createTimelineRequestGuard(): TimelineRequestGuard {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isCurrent(requestId) {
      return requestId === current;
    },
    invalidate() {
      current += 1;
    },
  };
}

export function appendTimelinePage(
  existing: TimelineItemDTO[],
  next: TimelineItemDTO[],
): TimelineItemDTO[] {
  const seen = new Set(existing.map(item => item.id));
  return [...existing, ...next.filter(item => !seen.has(item.id))];
}

export type TimelineSectionStatus = 'loading' | 'ready' | 'error';

export interface TimelineSectionState {
  items: TimelineItemDTO[];
  pageInfo: TimelinePageInfo | null;
  status: TimelineSectionStatus;
  initialErrorStatus: number | null;
  loadMoreInFlight: boolean;
  loadMoreError: boolean;
}

export const INITIAL_TIMELINE_SECTION_STATE: TimelineSectionState = {
  items: [],
  pageInfo: null,
  status: 'loading',
  initialErrorStatus: null,
  loadMoreInFlight: false,
  loadMoreError: false,
};

export interface TimelinePageFetchResult {
  status: number;
  ok: boolean;
  items?: TimelineItemDTO[];
  pageInfo?: TimelinePageInfo;
}

export interface TimelineSectionControllerOptions {
  fetchPage(input: {
    reviewId: string;
    limit: number;
    offset: number;
  }): Promise<TimelinePageFetchResult>;
  onStateChange(state: TimelineSectionState): void;
}

export class TimelineSectionController {
  private readonly options: TimelineSectionControllerOptions;
  private readonly guard = createTimelineRequestGuard();
  private state: TimelineSectionState = { ...INITIAL_TIMELINE_SECTION_STATE };
  private activeRequest: 'initial' | 'load-more' | null = null;
  private reviewId = '';

  constructor(options: TimelineSectionControllerOptions) {
    this.options = options;
  }

  getState(): TimelineSectionState {
    return this.state;
  }

  start(reviewId: string): void {
    this.guard.invalidate();
    this.activeRequest = null;
    this.reviewId = reviewId;
    this.setState({
      items: [],
      pageInfo: null,
      status: 'loading',
      initialErrorStatus: null,
      loadMoreInFlight: false,
      loadMoreError: false,
    });
    if (!reviewId) {
      this.setState({ status: 'ready' });
      return;
    }
    void this.runInitial();
  }

  retryInitial(): void {
    if (this.activeRequest !== null) return;
    this.setState({
      status: 'loading',
      initialErrorStatus: null,
      loadMoreError: false,
    });
    void this.runInitial();
  }

  loadMore(): void {
    if (this.activeRequest !== null || this.reviewId === '') return;
    const pageInfo = this.state.pageInfo;
    if (this.state.status !== 'ready' || !pageInfo?.hasMore || pageInfo.nextOffset === null) {
      return;
    }
    this.activeRequest = 'load-more';
    this.setState({ loadMoreInFlight: true, loadMoreError: false });
    const requestId = this.guard.next();
    const offset = pageInfo.nextOffset;

    let requestPromise: Promise<TimelinePageFetchResult>;
    try {
      requestPromise = this.options.fetchPage({
        reviewId: this.reviewId,
        limit: 30,
        offset,
      });
    } catch {
      if (this.guard.isCurrent(requestId) && this.activeRequest === 'load-more') {
        this.activeRequest = null;
        this.setState({ loadMoreInFlight: false, loadMoreError: true });
      }
      return;
    }

    requestPromise
      .then(result => {
        if (!this.guard.isCurrent(requestId) || this.activeRequest !== 'load-more') return;
        if (result.ok && Array.isArray(result.items) && result.pageInfo) {
          this.setState({
            items: appendTimelinePage(this.state.items, result.items),
            pageInfo: result.pageInfo,
            loadMoreInFlight: false,
          });
        } else {
          this.setState({ loadMoreInFlight: false, loadMoreError: true });
        }
      })
      .catch(() => {
        if (!this.guard.isCurrent(requestId) || this.activeRequest !== 'load-more') return;
        this.setState({ loadMoreInFlight: false, loadMoreError: true });
      })
      .finally(() => {
        if (this.guard.isCurrent(requestId) && this.activeRequest === 'load-more') {
          this.activeRequest = null;
        }
      });
  }

  invalidate(): void {
    this.guard.invalidate();
    this.activeRequest = null;
  }

  private async runInitial(): Promise<void> {
    if (this.activeRequest !== null) return;
    this.activeRequest = 'initial';
    const requestId = this.guard.next();
    try {
      const result = await this.options.fetchPage({
        reviewId: this.reviewId,
        limit: 30,
        offset: 0,
      });
      if (!this.guard.isCurrent(requestId) || this.activeRequest !== 'initial') return;
      if (result.ok && Array.isArray(result.items) && result.pageInfo) {
        this.setState({
          items: result.items,
          pageInfo: result.pageInfo,
          status: 'ready',
          initialErrorStatus: null,
        });
      } else {
        this.setState({ status: 'error', initialErrorStatus: result.status || 500 });
      }
    } catch {
      if (!this.guard.isCurrent(requestId) || this.activeRequest !== 'initial') return;
      this.setState({ status: 'error', initialErrorStatus: 500 });
    } finally {
      if (this.guard.isCurrent(requestId) && this.activeRequest === 'initial') {
        this.activeRequest = null;
      }
    }
  }

  private setState(patch: Partial<TimelineSectionState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onStateChange(this.state);
  }
}
