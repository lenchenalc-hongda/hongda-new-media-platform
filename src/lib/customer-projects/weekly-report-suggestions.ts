import type {
  AiWorkItemProposal,
  AiWorkItemWeeklyBasis,
  AiSuggestionWorkItemType,
} from './ai-drafts';
import type {
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from './domain';
import {
  buildReportNarrativeBasis,
  type ReportNarrativeStaleReason,
} from './report-narrative';
import type { WeeklyReportListItem } from './reports';

export const WEEKLY_SUGGESTION_PROMPT_VERSION = 'cpc-weekly-work-item-v1';
export const WEEKLY_SUGGESTION_SCHEMA_VERSION = 1;

export type WeeklySuggestionAction =
  | 'CUSTOMER_COMMITMENT_OVERDUE'
  | 'FOLLOW_UP_DUE'
  | 'PROJECT_WAITING_CHECK_DUE'
  | 'WORK_ITEM_BLOCKED';

export interface WeeklySuggestionProjectFact {
  id: string;
  title: string;
  customerReferenceId: string;
  waitingOn: string;
  nextCheckAt: string | null;
  priority: WorkItemPriority;
  hasOpenNextAction: boolean;
}

export interface WeeklySuggestionWorkItemFact {
  id: string;
  customerReferenceId: string | null;
  projectId: string | null;
  workItemType: WorkItemType;
  title: string;
  dueAt: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  blockedReason: string | null;
}

export interface WeeklySuggestionCandidate {
  candidateId: string;
  action: WeeklySuggestionAction;
  workItemType: AiSuggestionWorkItemType;
  projectId: string | null;
  customerReferenceId: string | null;
  title: string;
  rationale: string;
  priority: WorkItemPriority;
  dueAt: string | null;
  evidence: {
    sourceWorkItemId?: string;
    sourceProjectId?: string;
    status?: WorkItemStatus;
    dueAt?: string | null;
    waitingOn?: string;
    nextCheckAt?: string | null;
    blockedReason?: string | null;
  };
}

export interface WeeklySuggestionModelItem {
  candidateId: string;
  title: string;
  description: string | null;
  rationale: string;
  priority: WorkItemPriority;
}

export interface WeeklySuggestionProposalView {
  id: string;
  status: 'draft' | 'accepted' | 'rejected' | 'expired';
  proposal: AiWorkItemProposal & {
    weeklyBasis: AiWorkItemWeeklyBasis;
    rationale: string;
    candidateId: string;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isStale: boolean;
  staleReasons: ReportNarrativeStaleReason[];
  canAccept: boolean;
  canReject: boolean;
}

const PRIORITIES = new Set<WorkItemPriority>([
  'low',
  'medium',
  'high',
  'critical',
]);

const OPEN_STATUSES = new Set<WorkItemStatus>([
  'pending',
  'in_progress',
  'blocked',
]);

const FORBIDDEN_SUGGESTION_PATTERNS = [
  /员工排名/,
  /业绩排名/,
  /绩效评分/,
  /态度评价/,
  /积极性/,
  /点击量/,
  /点击率/,
  /消息数/,
  /记录数/,
  /回款/,
  /收据/,
  /报价金额/,
  /订单金额/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function nullableText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed || null : undefined;
}

function safeSuggestionText(value: string): boolean {
  return !FORBIDDEN_SUGGESTION_PATTERNS.some(pattern => pattern.test(value));
}

function candidatePriority(priority: WorkItemPriority): WorkItemPriority {
  return PRIORITIES.has(priority) ? priority : 'medium';
}

export function buildWeeklySuggestionCandidates(input: {
  projects: WeeklySuggestionProjectFact[];
  workItems: WeeklySuggestionWorkItemFact[];
  periodEnd: string;
}): WeeklySuggestionCandidate[] {
  const candidates: WeeklySuggestionCandidate[] = [];
  const seen = new Set<string>();
  const projectMap = new Map(
    input.projects.map(project => [project.id, project]),
  );
  const openFollowUpCustomerIds = new Set(
    input.workItems
      .filter(item =>
        item.workItemType === 'FOLLOW_UP'
        && item.projectId === null
        && OPEN_STATUSES.has(item.status)
        && item.customerReferenceId
      )
      .map(item => item.customerReferenceId as string),
  );

  function add(candidate: WeeklySuggestionCandidate) {
    if (
      !safeSuggestionText(candidate.title)
      || !safeSuggestionText(candidate.rationale)
    ) {
      return;
    }
    if (
      candidate.workItemType === 'FOLLOW_UP'
      && candidate.customerReferenceId
      && openFollowUpCustomerIds.has(candidate.customerReferenceId)
    ) {
      return;
    }
    if (seen.has(candidate.candidateId) || candidates.length >= 10) return;
    seen.add(candidate.candidateId);
    candidates.push(candidate);
  }

  for (const item of input.workItems) {
    if (!OPEN_STATUSES.has(item.status)) continue;

    if (item.status === 'blocked') {
      const project = item.projectId ? projectMap.get(item.projectId) : null;
      const canCreateNextAction =
        item.workItemType !== 'NEXT_ACTION'
        && !!item.projectId
        && !!project
        && !project.hasOpenNextAction;
      const workItemType: AiSuggestionWorkItemType = canCreateNextAction
        ? 'NEXT_ACTION'
        : 'FOLLOW_UP';
      const customerReferenceId =
        item.customerReferenceId
        ?? project?.customerReferenceId
        ?? null;
      if (workItemType === 'FOLLOW_UP' && !customerReferenceId) continue;
      add({
        candidateId: `blocked:${item.id}`,
        action: 'WORK_ITEM_BLOCKED',
        workItemType,
        projectId: workItemType === 'NEXT_ACTION' ? item.projectId : null,
        customerReferenceId,
        title: `处理受阻事项：${item.title}`,
        rationale: item.blockedReason
          ? `已确认任务处于受阻状态，阻塞原因：${item.blockedReason}`
          : '已确认任务处于受阻状态，需要先解除阻塞。',
        priority: candidatePriority(item.priority),
        dueAt: null,
        evidence: {
          sourceWorkItemId: item.id,
          status: item.status,
          blockedReason: item.blockedReason,
        },
      });
      continue;
    }

    if (
      item.workItemType === 'CUSTOMER_COMMITMENT'
      && item.dueAt
      && item.dueAt.slice(0, 10) <= input.periodEnd
    ) {
      const project = item.projectId ? projectMap.get(item.projectId) : null;
      const customerReferenceId =
        item.customerReferenceId
        ?? project?.customerReferenceId
        ?? null;
      const workItemType: AiSuggestionWorkItemType =
        item.projectId && project && !project.hasOpenNextAction
          ? 'NEXT_ACTION'
          : 'FOLLOW_UP';
      if (workItemType === 'FOLLOW_UP' && !customerReferenceId) continue;
      add({
        candidateId: `commitment:${item.id}`,
        action: 'CUSTOMER_COMMITMENT_OVERDUE',
        workItemType,
        projectId: workItemType === 'NEXT_ACTION' ? item.projectId : null,
        customerReferenceId,
        title: `跟进客户承诺：${item.title}`,
        rationale: `已确认客户承诺到期时间为 ${item.dueAt}，当前仍未完成。`,
        priority: candidatePriority(item.priority),
        dueAt: null,
        evidence: {
          sourceWorkItemId: item.id,
          status: item.status,
          dueAt: item.dueAt,
        },
      });
      continue;
    }

    if (
      item.workItemType === 'FOLLOW_UP'
      && item.dueAt
      && item.dueAt.slice(0, 10) <= input.periodEnd
      && item.customerReferenceId
    ) {
      add({
        candidateId: `follow-up:${item.id}`,
        action: 'FOLLOW_UP_DUE',
        workItemType: 'FOLLOW_UP',
        projectId: null,
        customerReferenceId: item.customerReferenceId,
        title: `完成客户回访：${item.title}`,
        rationale: `已确认客户回访到期时间为 ${item.dueAt}，当前仍未完成。`,
        priority: candidatePriority(item.priority),
        dueAt: null,
        evidence: {
          sourceWorkItemId: item.id,
          status: item.status,
          dueAt: item.dueAt,
        },
      });
    }
  }

  for (const project of input.projects) {
    if (
      project.waitingOn === 'none'
      || project.hasOpenNextAction
      || !project.nextCheckAt
      || project.nextCheckAt.slice(0, 10) > input.periodEnd
    ) {
      continue;
    }
    add({
      candidateId: `waiting:${project.id}`,
      action: 'PROJECT_WAITING_CHECK_DUE',
      workItemType: 'NEXT_ACTION',
      projectId: project.id,
      customerReferenceId: project.customerReferenceId,
      title: `检查等待状态：${project.title}`,
      rationale: `已确认项目处于等待状态（${project.waitingOn}），检查时间为 ${project.nextCheckAt}。`,
      priority: candidatePriority(project.priority),
      dueAt: null,
      evidence: {
        sourceProjectId: project.id,
        waitingOn: project.waitingOn,
        nextCheckAt: project.nextCheckAt,
      },
    });
  }

  return candidates;
}

export function validateWeeklySuggestionModelOutput(
  value: unknown,
  candidates: WeeklySuggestionCandidate[],
): WeeklySuggestionModelItem[] {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) return [];

  const byCandidate = new Map(
    candidates.map(candidate => [candidate.candidateId, candidate]),
  );
  const seen = new Set<string>();
  const suggestions: WeeklySuggestionModelItem[] = [];

  for (const raw of value.suggestions) {
    if (!isRecord(raw)) continue;
    const candidateId = textValue(raw.candidateId, 100);
    if (!candidateId || seen.has(candidateId)) continue;
    const candidate = byCandidate.get(candidateId);
    if (!candidate) continue;

    const title = textValue(raw.title, 300);
    const description = nullableText(raw.description, 2000);
    const rationale = textValue(raw.rationale, 1000);
    const priority = raw.priority;
    if (
      !title
      || description === undefined
      || !rationale
      || typeof priority !== 'string'
      || !PRIORITIES.has(priority as WorkItemPriority)
      || !safeSuggestionText(title)
      || (description ? !safeSuggestionText(description) : false)
      || !safeSuggestionText(rationale)
    ) {
      continue;
    }

    seen.add(candidateId);
    suggestions.push({
      candidateId,
      title,
      description,
      rationale,
      priority: priority as WorkItemPriority,
    });
    if (suggestions.length >= 5) break;
  }

  return suggestions;
}

export function fallbackWeeklySuggestions(
  candidates: WeeklySuggestionCandidate[],
): WeeklySuggestionModelItem[] {
  return candidates.slice(0, 5).map(candidate => ({
    candidateId: candidate.candidateId,
    title: candidate.title,
    description: candidate.rationale,
    rationale: candidate.rationale,
    priority: candidate.priority,
  }));
}

export function buildWeeklySuggestionBasis(
  report: WeeklyReportListItem,
): AiWorkItemWeeklyBasis {
  const basis = buildReportNarrativeBasis(report);
  return {
    reportId: basis.reportId,
    reportVersion: basis.reportVersion,
    reportRevisionNo: basis.reportRevisionNo,
    periodType: 'weekly',
    periodStart: basis.periodStart,
    periodEnd: basis.periodEnd,
    metricsSchemaVersion: basis.metricsSchemaVersion,
    deterministicMetricsFingerprint: basis.deterministicMetricsFingerprint,
    sourceEventSeq: basis.sourceEventSeq,
    sourceAuditSeq: basis.sourceAuditSeq,
  };
}

export function evaluateWeeklySuggestionStaleness(
  proposal: AiWorkItemProposal,
  report: WeeklyReportListItem,
  proposalStatus: WeeklySuggestionProposalView['status'],
): ReportNarrativeStaleReason[] {
  const basis = proposal.weeklyBasis;
  if (!basis) return ['REPORT_BASIS_FINGERPRINT_CHANGED'];

  const reasons: ReportNarrativeStaleReason[] = [];
  if (report.id !== basis.reportId) reasons.push('REPORT_ID_CHANGED');
  if (report.revisionNo !== basis.reportRevisionNo) {
    reasons.push('REPORT_REVISION_CHANGED');
  }
  if (report.version !== basis.reportVersion) {
    reasons.push('REPORT_VERSION_CHANGED');
  }
  if (report.metricsSchemaVersion !== basis.metricsSchemaVersion) {
    reasons.push('METRICS_SCHEMA_CHANGED');
  }
  if (report.sourceEventSeq !== basis.sourceEventSeq) {
    reasons.push('SOURCE_EVENT_CURSOR_CHANGED');
  }
  if (report.sourceAuditSeq !== basis.sourceAuditSeq) {
    reasons.push('SOURCE_AUDIT_CURSOR_CHANGED');
  }
  if (
    buildWeeklySuggestionBasis(report).deterministicMetricsFingerprint
    !== basis.deterministicMetricsFingerprint
  ) {
    reasons.push('REPORT_BASIS_FINGERPRINT_CHANGED');
  }
  if (proposalStatus === 'draft' && report.status !== 'draft') {
    reasons.push('REPORT_NOT_DRAFT');
  }
  return Array.from(new Set(reasons));
}
