import type {
  WorkItemPriority,
  WorkItemType,
} from './domain';

export type AiSuggestionWorkItemType = Extract<WorkItemType, 'NEXT_ACTION' | 'FOLLOW_UP'>;

export interface AiWorkItemWeeklyBasis {
  reportId: string;
  reportVersion: number;
  reportRevisionNo: number;
  periodType: 'weekly';
  periodStart: string;
  periodEnd: string;
  metricsSchemaVersion: number;
  deterministicMetricsFingerprint: string;
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
}

export interface AiWorkItemProposal {
  schemaVersion: 1;
  action: 'CREATE_WORK_ITEM';
  workItemType: AiSuggestionWorkItemType;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: WorkItemPriority;
  weeklyBasis?: AiWorkItemWeeklyBasis;
  rationale?: string;
  candidateId?: string;
}

export interface AiSuggestionListItem {
  id: string;
  proposalType: 'WORK_ITEM';
  rawInput: string;
  proposal: AiWorkItemProposal;
  customerReferenceId: string | null;
  customerDisplayName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  version: number;
  createdAt: string;
  expiresAt: string | null;
  canReview: boolean;
}

const PRIORITIES = new Set<WorkItemPriority>([
  'low',
  'medium',
  'high',
  'critical',
]);

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function optionalString(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed || null;
}

function optionalIso(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    return undefined;
  }
  return value;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    ? value
    : null;
}

function nullableNonNegativeInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
  ) {
    return undefined;
  }
  return value;
}

function validIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) ? value : null;
}

function parseWeeklyBasis(value: unknown): AiWorkItemWeeklyBasis | null | undefined {
  if (value === undefined || value === null) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const basis = value as Record<string, unknown>;
  const reportId = nonEmptyString(basis.reportId, 100);
  const reportVersion = positiveInteger(basis.reportVersion);
  const reportRevisionNo = positiveInteger(basis.reportRevisionNo);
  const periodStart = validIsoDate(basis.periodStart);
  const periodEnd = validIsoDate(basis.periodEnd);
  const metricsSchemaVersion = positiveInteger(basis.metricsSchemaVersion);
  const deterministicMetricsFingerprint =
    nonEmptyString(basis.deterministicMetricsFingerprint, 200);
  const sourceEventSeq = nullableNonNegativeInteger(basis.sourceEventSeq);
  const sourceAuditSeq = nullableNonNegativeInteger(basis.sourceAuditSeq);

  if (
    !reportId
    || !reportVersion
    || !reportRevisionNo
    || basis.periodType !== 'weekly'
    || !periodStart
    || !periodEnd
    || periodStart > periodEnd
    || !metricsSchemaVersion
    || !deterministicMetricsFingerprint
    || sourceEventSeq === undefined
    || sourceAuditSeq === undefined
  ) {
    return undefined;
  }

  return {
    reportId,
    reportVersion,
    reportRevisionNo,
    periodType: 'weekly',
    periodStart,
    periodEnd,
    metricsSchemaVersion,
    deterministicMetricsFingerprint,
    sourceEventSeq,
    sourceAuditSeq,
  };
}

export function parseAiWorkItemProposal(value: unknown): AiWorkItemProposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const proposal = value as Record<string, unknown>;

  if (proposal.schemaVersion !== 1) return null;
  if (proposal.action !== 'CREATE_WORK_ITEM') return null;
  if (
    proposal.workItemType !== 'NEXT_ACTION'
    && proposal.workItemType !== 'FOLLOW_UP'
  ) return null;

  const title = nonEmptyString(proposal.title, 300);
  const description = optionalString(proposal.description, 2000);
  const dueAt = optionalIso(proposal.dueAt);
  const priority = proposal.priority;
  const hasWeeklyBasis = Object.prototype.hasOwnProperty.call(proposal, 'weeklyBasis');
  const weeklyBasis = hasWeeklyBasis
    ? parseWeeklyBasis(proposal.weeklyBasis)
    : null;
  const rationale = proposal.rationale === undefined
    ? undefined
    : nonEmptyString(proposal.rationale, 1000) ?? undefined;
  const candidateId = proposal.candidateId === undefined
    ? undefined
    : nonEmptyString(proposal.candidateId, 100) ?? undefined;

  if (!title || description === undefined || dueAt === undefined) return null;
  if (hasWeeklyBasis && !weeklyBasis) return null;
  if (proposal.rationale !== undefined && !rationale) return null;
  if (proposal.candidateId !== undefined && !candidateId) return null;
  if (typeof priority !== 'string' || !PRIORITIES.has(priority as WorkItemPriority)) {
    return null;
  }

  return {
    schemaVersion: 1,
    action: 'CREATE_WORK_ITEM',
    workItemType: proposal.workItemType,
    title,
    description,
    dueAt,
    priority: priority as WorkItemPriority,
    ...(weeklyBasis ? { weeklyBasis } : {}),
    ...(rationale ? { rationale } : {}),
    ...(candidateId ? { candidateId } : {}),
  };
}
