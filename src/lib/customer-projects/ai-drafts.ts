import type {
  WorkItemPriority,
  WorkItemType,
} from './domain';

export type AiSuggestionWorkItemType = Extract<WorkItemType, 'NEXT_ACTION' | 'FOLLOW_UP'>;

export interface AiWorkItemProposal {
  schemaVersion: 1;
  action: 'CREATE_WORK_ITEM';
  workItemType: AiSuggestionWorkItemType;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: WorkItemPriority;
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

  if (!title || description === undefined || dueAt === undefined) return null;
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
  };
}
