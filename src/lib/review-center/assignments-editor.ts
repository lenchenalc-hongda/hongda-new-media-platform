import type { Role } from '@/lib/auth/types';
import type { ReviewStatus } from './types';

export interface AssignmentsState {
  ownerId: string;
  pmoId: string | null;
}

export interface AssignmentCandidate {
  profile_id: string;
  display_name: string;
  role: string;
  department: string | null;
  assignment_eligible?: boolean;
}

export interface AssignmentParticipantRef {
  profile_id: string;
  display_name: string;
  role: string;
  department: string | null;
  is_active: boolean;
}

export interface AssignmentDisplayInfo {
  displayName: string;
  meta: string;
  eligible: boolean;
}

export interface AssignmentsValidation {
  ownerValid: boolean;
  pmoValid: boolean;
  canSave: boolean;
  reason: string | null;
}

export type AssignmentsSaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'invalid_member'
  | 'validation'
  | 'error';

export interface AssignmentsMutationErrorInfo {
  globalState: 'conflict' | 'non_editable' | 'reload_required' | 'forbidden' | null;
  globalMessage: string;
  scopedState: 'invalid_member' | 'validation' | 'error' | null;
  scopedMessage: string;
}

export interface AssignmentsFallbackPlan {
  conflict: boolean;
  initial: AssignmentsState | null;
  draft: AssignmentsState | null;
}

export function canManageAssignments(input: {
  role: Role;
  status: ReviewStatus;
}): boolean {
  return input.status === 'draft' && (input.role === 'admin' || input.role === 'manager');
}

export function normalizeAssignments(input: {
  owner_id: string;
  pmo_id?: string | null;
}): AssignmentsState {
  return {
    ownerId: input.owner_id,
    pmoId: input.pmo_id ?? null,
  };
}

export function isAssignmentsDirty(
  initial: AssignmentsState,
  draft: AssignmentsState,
): boolean {
  return initial.ownerId !== draft.ownerId || initial.pmoId !== draft.pmoId;
}

export function eligibleAssignmentIds(
  candidates: AssignmentCandidate[],
): Set<string> {
  return new Set(
    candidates
      .filter(candidate => candidate.assignment_eligible !== false)
      .map(candidate => candidate.profile_id),
  );
}

export function validateAssignmentDraft(
  draft: AssignmentsState,
  eligibleIds: Iterable<string>,
): AssignmentsValidation {
  const ids = new Set(eligibleIds);
  const ownerValid = Boolean(draft.ownerId) && ids.has(draft.ownerId);
  const pmoValid = draft.pmoId === null || (Boolean(draft.pmoId) && ids.has(draft.pmoId));
  let reason: string | null = null;
  if (!ownerValid) {
    reason = '当前项目负责人已不可分配，请先选择新的项目负责人后再保存。';
  } else if (!pmoValid) {
    reason = '所选PMO当前已不可分配，请重新选择或设为未设置。';
  }
  return { ownerValid, pmoValid, canSave: ownerValid && pmoValid, reason };
}

export function resolveAssignmentDisplay(
  profileId: string | null,
  participants: AssignmentParticipantRef[],
  candidates: AssignmentCandidate[],
  fallbackLabel: string,
): AssignmentDisplayInfo {
  if (profileId === null) {
    return { displayName: '未设置', meta: '', eligible: true };
  }

  const participant = participants.find(item => item.profile_id === profileId);
  const candidate = candidates.find(item => item.profile_id === profileId);
  if (participant) {
    const meta: string[] = [];
    if (participant.department) meta.push(participant.department);
    meta.push(participant.role);
    if (!participant.is_active) meta.push('已停用');
    if (participant.role === 'viewer') meta.push('当前不可分配');
    return {
      displayName: participant.display_name,
      meta: meta.join(' · '),
      eligible: Boolean(candidate) && candidate?.assignment_eligible !== false,
    };
  }

  if (candidate) {
    const meta: string[] = [];
    if (candidate.department) meta.push(candidate.department);
    meta.push(candidate.role);
    return {
      displayName: candidate.display_name,
      meta: meta.join(' · '),
      eligible: candidate.assignment_eligible !== false,
    };
  }

  return {
    displayName: fallbackLabel,
    meta: '历史人员资料已不可用',
    eligible: false,
  };
}

export function buildAssignmentsRequest(
  expectedVersion: number,
  draft: AssignmentsState,
): {
  expectedVersion: number;
  ownerId: string;
  pmoId: string | null;
} {
  return {
    expectedVersion,
    ownerId: draft.ownerId,
    pmoId: draft.pmoId,
  };
}

export function planAssignmentsFallbackSync(
  initial: AssignmentsState | null,
  draft: AssignmentsState | null,
  latest: AssignmentsState,
): AssignmentsFallbackPlan {
  if (!initial || !draft) {
    return { conflict: false, initial: latest, draft: latest };
  }

  const dirty = isAssignmentsDirty(initial, draft);
  const remoteChanged =
    latest.ownerId !== initial.ownerId || latest.pmoId !== initial.pmoId;

  if (dirty && remoteChanged) {
    return { conflict: true, initial: null, draft: null };
  }

  if (dirty) {
    return { conflict: false, initial: null, draft: null };
  }

  return { conflict: false, initial: latest, draft: latest };
}

export function classifyAssignmentsMutationError(
  status: number,
  body: Record<string, unknown> | null | undefined,
): AssignmentsMutationErrorInfo {
  const code = typeof body?.code === 'string' ? body.code : '';

  if (status === 409 && code === 'VERSION_CONFLICT') {
    return {
      globalState: 'conflict',
      globalMessage: '此复盘已被其他人更新，请重新加载最新数据后再继续编辑。',
      scopedState: 'error',
      scopedMessage: '负责人设置保存失败，请稍后重试。',
    };
  }
  if (status === 409 && code === 'DRAFT_ONLY') {
    return {
      globalState: 'non_editable',
      globalMessage: '当前复盘已不是草稿状态，无法继续编辑。',
      scopedState: 'error',
      scopedMessage: '负责人设置保存失败，请稍后重试。',
    };
  }
  if (status === 403) {
    return {
      globalState: 'forbidden',
      globalMessage: '你没有编辑此复盘的权限。',
      scopedState: 'error',
      scopedMessage: '负责人设置保存失败，请稍后重试。',
    };
  }
  if (status === 404 || code === 'NOT_FOUND') {
    return {
      globalState: 'reload_required',
      globalMessage: '复盘状态已发生变化，请重新加载后继续。',
      scopedState: 'error',
      scopedMessage: '负责人设置保存失败，请稍后重试。',
    };
  }
  if (status === 400 && code === 'INVALID_MEMBER') {
    return {
      globalState: null,
      globalMessage: '',
      scopedState: 'invalid_member',
      scopedMessage: '所选负责人或PMO当前已不可分配，请重新加载候选人后重新选择。',
    };
  }
  if (status === 400) {
    return {
      globalState: null,
      globalMessage: '',
      scopedState: 'validation',
      scopedMessage: '请检查负责人和PMO设置后重试。',
    };
  }
  return {
    globalState: null,
    globalMessage: '',
    scopedState: 'error',
    scopedMessage: '负责人设置保存失败，请稍后重试。',
  };
}
