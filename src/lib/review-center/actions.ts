import type { ReviewParticipant } from './types';

export type ActionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type ActionType =
  | 'IMMEDIATE'
  | 'CORRECTIVE'
  | 'PREVENTIVE'
  | 'UNKNOWN';

export interface ActionSafeProfile {
  profileId: string;
  displayName: string;
  role: string | null;
  department: string | null;
  isActive: boolean;
}

export interface ActionReadDto {
  id: string;
  sequence: number;
  title: string;
  description: string | null;
  actionType: ActionType;
  status: ActionStatus;
  dueDate: string;
  isOverdue: boolean;
  version: number;
  owner: ActionSafeProfile;
  createdBy: ActionSafeProfile;
  completionNote: string | null;
  verificationNote: string | null;
  verifiedBy: ActionSafeProfile | null;
  completedAt: string | null;
  verifiedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ActionReadError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ActionReadError';
    this.status = status;
  }
}

export const ACTION_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'CANCELLED',
] as const;

export const ACTION_TYPES = [
  'IMMEDIATE',
  'CORRECTIVE',
  'PREVENTIVE',
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function getShanghaiBusinessDate(now: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const map = new Map(parts.map(part => [part.type, part.value]));
  const year = map.get('year') ?? '';
  const month = map.get('month') ?? '';
  const day = map.get('day') ?? '';
  if (!year || !month || !day) {
    throw new ActionReadError('无法计算业务日期', 500);
  }
  return `${year}-${month}-${day}`;
}

export function isActionOverdue(input: {
  dueDate: string;
  status: ActionStatus;
  now?: Date;
}): boolean {
  if (input.status === 'VERIFIED' || input.status === 'CANCELLED' || input.status === 'UNKNOWN') {
    return false;
  }
  if (!isValidDateOnly(input.dueDate)) return false;
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) return false;
  const businessDate = getShanghaiBusinessDate(now);
  return input.dueDate < businessDate;
}

function normalizeStatus(value: unknown): ActionStatus {
  return typeof value === 'string' && (ACTION_STATUSES as readonly string[]).includes(value)
    ? value as ActionStatus
    : 'UNKNOWN';
}

function normalizeActionType(value: unknown): ActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value)
    ? value as ActionType
    : 'UNKNOWN';
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isUuid(value)) {
    throw new ActionReadError(`${field} 结构无效`, 500);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ActionReadError(`${field} 结构无效`, 500);
  }
  return value;
}

function optionalTimestamp(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ActionReadError(`${field} 结构无效`, 500);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ActionReadError(`${field} 结构无效`, 500);
  }
  return value;
}

export function mapActionRowToDto(
  row: any,
  participants: ReviewParticipant[],
  now: Date = new Date(),
): ActionReadDto {
  if (!row || typeof row !== 'object') {
    throw new ActionReadError('Action 结构无效', 500);
  }

  const id = requireUuid(row.id, 'id');
  const ownerProfileId = requireUuid(row.owner_profile_id, 'owner_profile_id');
  const createdByProfileId = requireUuid(row.created_by_profile_id, 'created_by_profile_id');
  if (row.verified_by_profile_id !== null && row.verified_by_profile_id !== undefined) {
    requireUuid(row.verified_by_profile_id, 'verified_by_profile_id');
  }

  if (!Number.isInteger(row.sequence) || row.sequence < 1) {
    throw new ActionReadError('sequence 结构无效', 500);
  }
  if (typeof row.title !== 'string' || row.title.trim() === '') {
    throw new ActionReadError('title 结构无效', 500);
  }
  if (typeof row.due_date !== 'string' || !isValidDateOnly(row.due_date)) {
    throw new ActionReadError('due_date 结构无效', 500);
  }
  if (!Number.isInteger(row.version) || row.version < 1) {
    throw new ActionReadError('version 结构无效', 500);
  }

  const createdAt = requireTimestamp(row.created_at, 'created_at');
  const updatedAt = requireTimestamp(row.updated_at, 'updated_at');
  const completedAt = optionalTimestamp(row.completed_at, 'completed_at');
  const verifiedAt = optionalTimestamp(row.verified_at, 'verified_at');
  const cancelledAt = optionalTimestamp(row.cancelled_at, 'cancelled_at');

  const description = optionalText(row.description, 'description');
  const completionNote = optionalText(row.completion_note, 'completion_note');
  const verificationNote = optionalText(row.verification_note, 'verification_note');
  const cancelReason = optionalText(row.cancel_reason, 'cancel_reason');

  const status = normalizeStatus(row.status);
  const actionType = normalizeActionType(row.action_type);
  const participantMap = new Map(participants.map(item => [item.profile_id, item]));

  const resolveProfile = (profileId: string): ActionSafeProfile => {
    const participant = participantMap.get(profileId);
    if (participant) {
      return {
        profileId: participant.profile_id,
        displayName: participant.display_name,
        role: participant.role,
        department: participant.department,
        isActive: participant.is_active,
      };
    }
    return {
      profileId,
      displayName: '历史人员',
      role: null,
      department: null,
      isActive: false,
    };
  };

  const owner = resolveProfile(ownerProfileId);
  const createdBy = resolveProfile(createdByProfileId);
  const verifiedBy = status === 'VERIFIED' && row.verified_by_profile_id
    ? resolveProfile(row.verified_by_profile_id)
    : null;

  const safeCompletedAt = status === 'PENDING_VERIFICATION' || status === 'VERIFIED'
    ? completedAt
    : null;
  const safeVerifiedAt = status === 'VERIFIED' ? verifiedAt : null;
  const safeCancelledAt = status === 'CANCELLED' ? cancelledAt : null;
  const safeCancelReason = status === 'CANCELLED' ? cancelReason : null;

  return {
    id,
    sequence: row.sequence,
    title: row.title,
    description,
    actionType,
    status,
    dueDate: row.due_date,
    isOverdue: isActionOverdue({ dueDate: row.due_date, status, now }),
    version: row.version,
    owner,
    createdBy,
    completionNote,
    verificationNote,
    verifiedBy,
    completedAt: safeCompletedAt,
    verifiedAt: safeVerifiedAt,
    cancelledAt: safeCancelledAt,
    cancelReason: safeCancelReason,
    createdAt,
    updatedAt,
  };
}

export function mapActionRowsToDtos(
  rows: any[],
  participants: ReviewParticipant[],
  now: Date = new Date(),
): ActionReadDto[] {
  return rows.map(row => mapActionRowToDto(row, participants, now));
}
