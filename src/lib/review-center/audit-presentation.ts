import type { AuditLogDTO, AuditPageInfo } from './audit';
import {
  BASIC_FIELD_LABELS,
  TYPE_DETAIL_FIELD_LABELS,
  createTimelineRequestGuard,
  formatAuthRoleLabel,
  formatMemberRoleLabel,
  formatReviewTypeLabel,
  formatTimelineActorLabel,
  formatTimelineFieldLabels,
  formatTimelineTimestamp,
  reviewTypeClassName,
} from './timeline-presentation';
import {
  actionStatusLabel,
  actionTypeLabel,
  formatActionDueDate,
} from './action-presentation';
import { reviewStatusDisplayLabel, riskLevelLabel } from './formatters';

const AUDIT_ACTION_CHANGED_FIELD_LABELS: Record<string, string> = {
  title: '标题',
  description: '描述',
  action_type: '行动类型',
  owner_profile_id: '负责人',
  due_date: '截止日期',
};

const AUDIT_ASSIGNMENT_FIELD_LABELS: Record<string, string> = {
  owner_id: '负责人',
  pmo_id: 'PMO',
};

export interface AuditEventPresentation {
  title: string;
  summaryItems: string[];
  actorLabel: string;
  actorRoleLabel: string | null;
  actorStateLabel: string | null;
}

export function canViewManagementAudit(
  role: string | null | undefined,
): boolean {
  return role === 'admin' || role === 'manager';
}

export function formatAuditVersion(
  before: number | null | undefined,
  after: number,
): string {
  if (typeof after !== 'number' || !Number.isInteger(after) || after < 1) {
    return '版本未知';
  }
  if (before === null || before === undefined) return `版本 ${after}`;
  if (typeof before !== 'number' || !Number.isInteger(before) || before < 1) {
    return `版本 ${after}`;
  }
  if (before === after) return `版本 ${after}`;
  return `版本 ${before} → ${after}`;
}

export function formatAuditTimestamp(value: string): string {
  return formatTimelineTimestamp(value);
}

export function formatAuditActorLabel(value: string | null | undefined): string {
  return formatTimelineActorLabel(value);
}

export function auditErrorMessage(_status: number): string {
  return '管理日志加载失败，请稍后重试。';
}

function statusSummary(pair: unknown): string | null {
  if (!pair || typeof pair !== 'object') return null;
  const before = (pair as Record<string, unknown>).before;
  const after = (pair as Record<string, unknown>).after;
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  return `状态：${reviewStatusDisplayLabel(before as any)} → ${reviewStatusDisplayLabel(after as any)}`;
}

function safeChangesSummary(
  safeChanges: unknown,
  label: string,
  formatter: (value: unknown) => string,
): string | null {
  if (!safeChanges || typeof safeChanges !== 'object') return null;
  const pair = safeChanges as Record<string, unknown>;
  if (!('before' in pair) || !('after' in pair)) return null;
  return `${label}：${formatter(pair.before)} → ${formatter(pair.after)}`;
}

function booleanLabel(value: unknown): string {
  return value === true ? '是' : value === false ? '否' : '未知';
}

function numberPercentLabel(value: unknown): string {
  return typeof value === 'number' ? `${value}%` : '未知';
}

function safeReviewUpdatedSummaries(
  details: Record<string, unknown>,
): string[] {
  const summary: string[] = [];
  const labels = formatTimelineFieldLabels(
    details.changedFields,
    BASIC_FIELD_LABELS,
  );
  if (labels.length > 0) summary.push(`修改了：${labels.join('、')}`);

  const safeChanges = details.safeChanges;
  if (safeChanges && typeof safeChanges === 'object') {
    const changes = safeChanges as Record<string, unknown>;
    const risk = safeChangesSummary(changes.risk_level, '风险等级', value => riskLevelLabel(value as any));
    if (risk) summary.push(risk);
    const occurred = safeChangesSummary(
      changes.occurred_at,
      '发生时间',
      value => formatTimelineTimestamp(String(value)),
    );
    if (occurred) summary.push(occurred);
  }
  return summary;
}

function safeTypeDetailsSummaries(
  details: Record<string, unknown>,
): string[] {
  const summary: string[] = [];
  const labels = formatTimelineFieldLabels(
    details.changedFields,
    TYPE_DETAIL_FIELD_LABELS,
  );
  if (labels.length > 0) summary.push(`修改了：${labels.join('、')}`);

  const safeChanges = details.safeChanges;
  if (safeChanges && typeof safeChanges === 'object') {
    const changes = safeChanges as Record<string, unknown>;
    const notified = safeChangesSummary(
      changes.customer_notified,
      '客户是否已通知',
      booleanLabel,
    );
    if (notified) summary.push(notified);
    const defectRate = safeChangesSummary(
      changes.defect_rate,
      '不良率',
      numberPercentLabel,
    );
    if (defectRate) summary.push(defectRate);
  }
  return summary;
}

function safeActionUpdatedSummaries(
  details: Record<string, unknown>,
): string[] {
  const summary: string[] = [];
  const labels = formatTimelineFieldLabels(
    details.changedFields,
    AUDIT_ACTION_CHANGED_FIELD_LABELS,
  );
  if (labels.length > 0) summary.push(`修改了：${labels.join('、')}`);

  const safeChanges = details.safeChanges;
  if (safeChanges && typeof safeChanges === 'object') {
    const changes = safeChanges as Record<string, unknown>;
    const actionType = safeChangesSummary(
      changes.action_type,
      '行动类型',
      value => actionTypeLabel(String(value)),
    );
    if (actionType) summary.push(actionType);
    const dueDate = safeChangesSummary(
      changes.due_date,
      '截止日期',
      value => formatActionDueDate(String(value)),
    );
    if (dueDate) summary.push(dueDate);
  }
  return summary;
}

export function formatAuditEvent(item: AuditLogDTO): AuditEventPresentation {
  const base = {
    actorLabel: formatAuditActorLabel(item.actor.displayName),
    actorRoleLabel: formatAuthRoleLabel(item.actor.role),
    actorStateLabel: item.actor.isActive === false ? '已停用' : null,
  };
  const details = item.details;

  if (item.entityType === 'REVIEW' && item.action === 'REVIEW_CREATED') {
    const summary: string[] = [];
    if (typeof details.reviewNo === 'string' && details.reviewNo.trim()) {
      summary.push(`复盘编号：${details.reviewNo}`);
    }
    const reviewType = formatReviewTypeLabel(
      typeof details.reviewType === 'string' ? details.reviewType : null,
    );
    if (reviewType) summary.push(`复盘类型：${reviewType}`);
    if (typeof details.title === 'string' && details.title.trim()) {
      summary.push(`标题：${details.title}`);
    }
    return { ...base, title: '创建了复盘', summaryItems: summary };
  }

  if (item.entityType === 'REVIEW' && item.action === 'REVIEW_UPDATED') {
    return {
      ...base,
      title: '更新了复盘基本信息',
      summaryItems: safeReviewUpdatedSummaries(details),
    };
  }

  if (item.entityType === 'REVIEW' && item.action === 'REVIEW_SUBMITTED') {
    const summary: string[] = [];
    const status = statusSummary(details.status);
    if (status) summary.push(status);
    return { ...base, title: '提交了复盘', summaryItems: summary };
  }

  if (item.entityType === 'REVIEW' && item.action === 'REVIEW_CLOSED') {
    const summary: string[] = [];
    const status = statusSummary(details.status);
    if (status) summary.push(status);
    return { ...base, title: '关闭了复盘', summaryItems: summary };
  }

  if (item.entityType === 'REVIEW' && item.action === 'REVIEW_REOPENED') {
    const summary: string[] = [];
    const status = statusSummary(details.status);
    if (status) summary.push(status);
    if (details.fromStatus === 'submitted') {
      return { ...base, title: '退回了复盘修改', summaryItems: summary };
    }
    if (details.fromStatus === 'closed') {
      return { ...base, title: '重新打开了复盘', summaryItems: summary };
    }
    return { ...base, title: '更新了复盘状态', summaryItems: summary };
  }

  if (item.entityType === 'TYPE_DETAILS' && item.action === 'TYPE_DETAILS_SAVED') {
    const summary = safeTypeDetailsSummaries(details);
    const reviewTypeClass = reviewTypeClassName(
      typeof details.reviewType === 'string' ? details.reviewType : null,
    );
    if (reviewTypeClass) summary.unshift(`${reviewTypeClass}专项复盘`);
    return {
      ...base,
      title: details.created === true ? '填写了专项复盘内容' : '更新了专项复盘内容',
      summaryItems: summary,
    };
  }

  if (item.entityType === 'MEMBER' && item.action === 'MEMBER_ADDED') {
    const summary: string[] = [];
    const role = formatMemberRoleLabel(
      typeof details.memberRole === 'string' ? details.memberRole : null,
    );
    if (role) {
      summary.push(`角色：${role}${details.isPrimary === true ? ' · 主负责人' : ''}`);
    }
    return { ...base, title: '添加了项目成员', summaryItems: summary };
  }

  if (item.entityType === 'MEMBER' && item.action === 'MEMBER_REMOVED') {
    const summary: string[] = [];
    const role = formatMemberRoleLabel(
      typeof details.memberRole === 'string' ? details.memberRole : null,
    );
    if (role) {
      summary.push(`角色：${role}${details.isPrimary === true ? ' · 主负责人' : ''}`);
    }
    return { ...base, title: '移除了项目成员', summaryItems: summary };
  }

  if (item.entityType === 'MEMBER' && item.action === 'MEMBER_PRIMARY_SET') {
    const summary: string[] = [];
    const role = formatMemberRoleLabel(
      typeof details.memberRole === 'string' ? details.memberRole : null,
    );
    if (role) {
      summary.push(
        `${role}${details.hadPreviousPrimary === true ? ' · 更换主负责人' : ' · 设置主负责人'}`,
      );
    }
    return {
      ...base,
      title: details.hadPreviousPrimary === true ? '更换了角色主负责人' : '设置了角色主负责人',
      summaryItems: summary,
    };
  }

  if (item.entityType === 'ASSIGNMENT' && item.action === 'ASSIGNMENT_UPDATED') {
    const fields = Array.isArray(details.changedFields)
      ? (details.changedFields as string[])
      : [];
    const ownerChanged = fields.includes('owner_id');
    const pmoChanged = fields.includes('pmo_id');
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
    const labels = formatTimelineFieldLabels(fields, AUDIT_ASSIGNMENT_FIELD_LABELS);
    const summary = labels.length > 0 ? [`变更字段：${labels.join('、')}`] : [];
    return { ...base, title, summaryItems: summary };
  }

  if (item.entityType === 'ACTION' && item.action === 'ACTION_CREATED') {
    const sequence =
      typeof details.sequence === 'number'
      && Number.isInteger(details.sequence)
      && details.sequence >= 1
        ? details.sequence
        : null;
    const title =
      typeof details.title === 'string' && details.title.trim()
        ? details.title.trim()
        : null;
    const summary: string[] = [];
    if (typeof details.actionType === 'string') {
      summary.push(`行动类型：${actionTypeLabel(details.actionType)}`);
    }
    if (typeof details.dueDate === 'string') {
      summary.push(`截止日期：${formatActionDueDate(details.dueDate)}`);
    }
    return {
      ...base,
      title: sequence !== null && title
        ? `创建了改善行动 #${sequence}：${title}`
        : '创建了一项改善行动',
      summaryItems: summary,
    };
  }

  if (item.entityType === 'ACTION' && item.action === 'ACTION_UPDATED') {
    return {
      ...base,
      title: '更新了一项改善行动',
      summaryItems: safeActionUpdatedSummaries(details),
    };
  }

  if (item.entityType === 'ACTION' && item.action === 'ACTION_STARTED') {
    const summary: string[] = [];
    const status = actionStatusSummary(details.status);
    if (status) summary.push(status);
    return { ...base, title: '开始执行了一项改善行动', summaryItems: summary };
  }

  if (
    item.entityType === 'ACTION'
    && item.action === 'ACTION_SUBMITTED_FOR_VERIFICATION'
  ) {
    const summary: string[] = [];
    const status = actionStatusSummary(details.status);
    if (status) summary.push(status);
    return {
      ...base,
      title: '提交了一项改善行动等待验证',
      summaryItems: summary,
    };
  }

  if (item.entityType === 'ACTION' && item.action === 'ACTION_VERIFIED') {
    const summary: string[] = [];
    const status = actionStatusSummary(details.status);
    if (status) summary.push(status);
    return { ...base, title: '验证通过了一项改善行动', summaryItems: summary };
  }

  if (item.entityType === 'ACTION' && item.action === 'ACTION_RETURNED') {
    const summary: string[] = [];
    const status = actionStatusSummary(details.status);
    if (status) summary.push(status);
    return { ...base, title: '退回了一项改善行动', summaryItems: summary };
  }

  if (item.entityType === 'ACTION' && item.action === 'ACTION_CANCELLED') {
    const summary: string[] = [];
    const status = actionStatusSummary(details.status);
    if (status) summary.push(status);
    return { ...base, title: '取消了一项改善行动', summaryItems: summary };
  }

  if (item.entityType === 'REVIEW_METADATA' && item.action === 'REVIEW_METADATA_UPDATED') {
    return {
      ...base,
      title: '更新了项目分类',
      summaryItems: ['调整了项目的材质、工艺或问题分类信息'],
    };
  }

  return { ...base, title: '记录了一项管理操作', summaryItems: [] };
}

function actionStatusSummary(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const before = (value as Record<string, unknown>).before;
  const after = (value as Record<string, unknown>).after;
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  return `状态：${actionStatusLabel(before)} → ${actionStatusLabel(after)}`;
}

export type AuditSectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AuditSectionState {
  expanded: boolean;
  hasLoaded: boolean;
  items: AuditLogDTO[];
  pageInfo: AuditPageInfo | null;
  status: AuditSectionStatus;
  initialErrorStatus: number | null;
  loadMoreInFlight: boolean;
  loadMoreError: boolean;
}

export const INITIAL_AUDIT_SECTION_STATE: AuditSectionState = {
  expanded: false,
  hasLoaded: false,
  items: [],
  pageInfo: null,
  status: 'idle',
  initialErrorStatus: null,
  loadMoreInFlight: false,
  loadMoreError: false,
};

export interface AuditPageFetchResult {
  status: number;
  ok: boolean;
  items?: AuditLogDTO[];
  pageInfo?: AuditPageInfo;
}

export interface AuditSectionControllerOptions {
  fetchPage(input: {
    reviewId: string;
    limit: number;
    offset: number;
  }): Promise<AuditPageFetchResult>;
  onStateChange(state: AuditSectionState): void;
}

export function appendAuditPage(
  existing: AuditLogDTO[],
  next: AuditLogDTO[],
): AuditLogDTO[] {
  const seen = new Set(existing.map(item => item.id));
  return [...existing, ...next.filter(item => !seen.has(item.id))];
}

export class AuditSectionController {
  private readonly options: AuditSectionControllerOptions;
  private readonly guard = createTimelineRequestGuard();
  private state: AuditSectionState = { ...INITIAL_AUDIT_SECTION_STATE };
  private activeRequest: 'initial' | 'load-more' | null = null;
  private reviewId = '';

  constructor(options: AuditSectionControllerOptions) {
    this.options = options;
  }

  getState(): AuditSectionState {
    return this.state;
  }

  start(reviewId: string): void {
    this.guard.invalidate();
    this.activeRequest = null;
    this.reviewId = reviewId;
    this.setState({ ...INITIAL_AUDIT_SECTION_STATE });
    if (!reviewId) {
      this.setState({ status: 'ready', hasLoaded: true });
    }
  }

  toggleExpanded(): void {
    if (this.state.expanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  expand(): void {
    if (this.state.expanded) return;
    this.setState({ expanded: true });
    if (!this.reviewId) {
      this.setState({ status: 'ready', hasLoaded: true });
      return;
    }
    if (this.state.hasLoaded) return;
    void this.runInitial();
  }

  collapse(): void {
    this.setState({ expanded: false });
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

    let requestPromise: Promise<AuditPageFetchResult>;
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
            items: appendAuditPage(this.state.items, result.items),
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
    this.setState({ status: 'loading', initialErrorStatus: null });
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
          hasLoaded: true,
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

  private setState(patch: Partial<AuditSectionState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onStateChange(this.state);
  }
}
