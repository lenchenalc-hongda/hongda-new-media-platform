import type { ReviewMemberItem } from './types';

export const MEMBER_ROLES = [
  'TECH_PROCESS',
  'DESIGN_PLATE',
  'PRODUCTION',
  'QUALITY',
  'EXPERT_REVIEWER',
  'OTHER',
] as const;

export type MemberRole = typeof MEMBER_ROLES[number];

export const MEMBER_ROLE_OPTIONS: Array<{ value: MemberRole; label: string }> = [
  { value: 'TECH_PROCESS', label: '技术 / 工艺' },
  { value: 'DESIGN_PLATE', label: '设计 / 制版' },
  { value: 'PRODUCTION', label: '生产' },
  { value: 'QUALITY', label: '品质' },
  { value: 'EXPERT_REVIEWER', label: '专家评审' },
  { value: 'OTHER', label: '其他' },
];

export interface MemberParticipantRef {
  profile_id: string;
  display_name: string;
  role: string;
  department: string | null;
  is_active: boolean;
}

export interface MemberDirectoryCandidate {
  profile_id: string;
  display_name: string;
  role: string;
  department: string | null;
  assignment_eligible?: boolean;
}

export interface MemberDisplayInfo {
  displayName: string;
  department: string | null;
  authRole: string | null;
  isActiveKnown: boolean;
  isActive: boolean;
  historicalState: 'ACTIVE' | 'INACTIVE' | 'ORPHAN';
}

export interface MemberAddValidation {
  valid: boolean;
  reason: string | null;
}

export interface MemberMutationErrorInfo {
  globalState: 'conflict' | 'non_editable' | 'reload_required' | 'forbidden' | null;
  globalMessage: string;
  scopedState: 'stale_candidate' | 'duplicate' | 'validation' | 'error' | null;
  scopedMessage: string;
}

export interface MemberDirectoryGuard {
  next(): number;
  isCurrent(requestId: number): boolean;
  invalidate(): void;
}

export function createMemberDirectoryGuard(): MemberDirectoryGuard {
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

export function isDuplicateMemberCombination(
  members: ReviewMemberItem[],
  profileId: string,
  memberRole: MemberRole | '',
): boolean {
  if (!profileId || !memberRole) return false;
  return members.some(
    member => member.profile_id === profileId && member.member_role === memberRole,
  );
}

export function canAddMemberCombination(input: {
  members: ReviewMemberItem[];
  selectedProfileId: string;
  selectedRole: MemberRole | '';
  candidateIds: Iterable<string>;
}): MemberAddValidation {
  if (!input.selectedProfileId || !input.selectedRole) {
    return { valid: false, reason: '请选择成员和角色。' };
  }
  const ids = new Set(input.candidateIds);
  if (!ids.has(input.selectedProfileId)) {
    return { valid: false, reason: '所选人员已不可用，请重新选择。' };
  }
  if (isDuplicateMemberCombination(input.members, input.selectedProfileId, input.selectedRole)) {
    return { valid: false, reason: '该成员已承担此角色。' };
  }
  return { valid: true, reason: null };
}

export function resolveMemberDisplay(
  member: ReviewMemberItem,
  participants: MemberParticipantRef[],
  directory: MemberDirectoryCandidate[],
): MemberDisplayInfo {
  const participant = participants.find(item => item.profile_id === member.profile_id);
  if (participant) {
    return {
      displayName: participant.display_name,
      department: participant.department,
      authRole: participant.role,
      isActiveKnown: true,
      isActive: participant.is_active,
      historicalState: participant.is_active ? 'ACTIVE' : 'INACTIVE',
    };
  }
  const candidate = directory.find(item => item.profile_id === member.profile_id);
  if (candidate) {
    return {
      displayName: candidate.display_name,
      department: candidate.department,
      authRole: candidate.role,
      isActiveKnown: true,
      isActive: true,
      historicalState: 'ACTIVE',
    };
  }
  return {
    displayName: '成员资料不可用',
    department: null,
    authRole: null,
    isActiveKnown: false,
    isActive: false,
    historicalState: 'ORPHAN',
  };
}

export function canSetMemberPrimary(
  member: ReviewMemberItem,
  participants: MemberParticipantRef[],
  directory: MemberDirectoryCandidate[],
): boolean {
  if (member.is_primary) return false;
  const participant = participants.find(item => item.profile_id === member.profile_id);
  if (participant) return participant.is_active === true;
  return directory.some(item => item.profile_id === member.profile_id);
}

export function appendMemberIfMissing(
  members: ReviewMemberItem[],
  member: ReviewMemberItem,
): ReviewMemberItem[] {
  if (!member?.id) return members;
  if (members.some(item => item.id === member.id)) return members;
  return [...members, member];
}

export function removeMemberFromList(
  members: ReviewMemberItem[],
  memberId: string,
): ReviewMemberItem[] {
  if (!memberId) return members;
  if (!members.some(item => item.id === memberId)) return members;
  return members.filter(item => item.id !== memberId);
}

export function reconcilePrimaryMember(
  members: ReviewMemberItem[],
  responseMember: ReviewMemberItem,
): ReviewMemberItem[] {
  if (!responseMember?.id || !responseMember.member_role) return members;
  let found = false;
  const next = members.map(item => {
    if (item.id === responseMember.id) {
      found = true;
      return responseMember;
    }
    if (item.member_role === responseMember.member_role && item.is_primary) {
      return { ...item, is_primary: false };
    }
    return item;
  });
  if (found) return next;
  const cleaned = next.map(item =>
    item.member_role === responseMember.member_role && item.is_primary
      ? { ...item, is_primary: false }
      : item,
  );
  return [...cleaned, responseMember];
}

export function groupMembersByRole(
  members: ReviewMemberItem[],
): Array<{ role: MemberRole; items: ReviewMemberItem[] }> {
  return MEMBER_ROLES
    .map(role => ({
      role,
      items: members.filter(member => member.member_role === role),
    }))
    .filter(group => group.items.length > 0);
}

export function classifyMemberMutationError(
  status: number,
  body: Record<string, unknown> | null | undefined,
): MemberMutationErrorInfo {
  const code = typeof body?.code === 'string' ? body.code : '';

  if (status === 409 && code === 'VERSION_CONFLICT') {
    return {
      globalState: 'conflict',
      globalMessage: '此复盘已被其他人更新，请重新加载最新数据后再继续编辑。',
      scopedState: 'error',
      scopedMessage: '成员操作失败，请稍后重试。',
    };
  }
  if (status === 409 && code === 'DRAFT_ONLY') {
    return {
      globalState: 'non_editable',
      globalMessage: '当前复盘已不是草稿状态，无法继续编辑。',
      scopedState: 'error',
      scopedMessage: '成员操作失败，请稍后重试。',
    };
  }
  if (status === 403) {
    return {
      globalState: 'forbidden',
      globalMessage: '你没有编辑此复盘的权限。',
      scopedState: 'error',
      scopedMessage: '成员操作失败，请稍后重试。',
    };
  }
  if (status === 404 || code === 'NOT_FOUND') {
    return {
      globalState: 'reload_required',
      globalMessage: '复盘成员状态已发生变化，请重新加载最新数据后继续。',
      scopedState: 'error',
      scopedMessage: '成员操作失败，请稍后重试。',
    };
  }
  if (status === 400 && code === 'INVALID_MEMBER') {
    return {
      globalState: null,
      globalMessage: '',
      scopedState: 'stale_candidate',
      scopedMessage: '所选成员当前已不可添加，请重新加载成员候选后重新选择。',
    };
  }
  if (status === 409 && code === 'UNIQUE_CONFLICT') {
    return {
      globalState: null,
      globalMessage: '',
      scopedState: 'duplicate',
      scopedMessage: '该成员已经承担此角色，请重新加载最新数据后确认。',
    };
  }
  if (status === 400) {
    return {
      globalState: null,
      globalMessage: '',
      scopedState: 'validation',
      scopedMessage: '请检查成员和角色设置后重试。',
    };
  }
  return {
    globalState: null,
    globalMessage: '',
    scopedState: 'error',
    scopedMessage: '成员操作失败，请稍后重试。',
  };
}
