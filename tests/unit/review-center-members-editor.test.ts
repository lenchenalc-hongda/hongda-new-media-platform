// ===== Review Center Members Editor Pure Helper Tests =====
import { canEditDraft } from '../../src/lib/review-center/editor';
import {
  appendMemberIfMissing,
  canAddMemberCombination,
  canSetMemberPrimary,
  classifyMemberMutationError,
  createMemberDirectoryGuard,
  groupMembersByRole,
  reconcilePrimaryMember,
  removeMemberFromList,
  resolveMemberDisplay,
  type MemberDirectoryCandidate,
  type MemberParticipantRef,
} from '../../src/lib/review-center/members-editor';
import type { ReviewMemberItem } from '../../src/lib/review-center/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const C = '00000000-0000-0000-0000-000000000003';

function member(overrides: Partial<ReviewMemberItem> = {}): ReviewMemberItem {
  return {
    id: 'member-' + (overrides.profile_id ?? A),
    profile_id: A,
    member_role: 'TECH_PROCESS',
    is_primary: false,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  } as ReviewMemberItem;
}

function participant(overrides: Partial<MemberParticipantRef> = {}): MemberParticipantRef {
  return {
    profile_id: A,
    display_name: '成员甲',
    role: 'sales',
    department: '销售部',
    is_active: true,
    ...overrides,
  };
}

function candidate(overrides: Partial<MemberDirectoryCandidate> = {}): MemberDirectoryCandidate {
  return {
    profile_id: A,
    display_name: '候选甲',
    role: 'viewer',
    department: '客服部',
    assignment_eligible: false,
    ...overrides,
  };
}

console.log('\n=== Review Center Members Editor Pure Helpers ===');

assert(canEditDraft({ role: 'admin', status: 'draft', currentProfileId: A, ownerId: A, pmoId: null }), 'admin draft can manage members');
assert(canEditDraft({ role: 'manager', status: 'draft', currentProfileId: A, ownerId: B, pmoId: null }), 'manager draft can manage members');
assert(canEditDraft({ role: 'sales', status: 'draft', currentProfileId: A, ownerId: A, pmoId: null }), 'sales owner can manage members');
assert(canEditDraft({ role: 'operator', status: 'draft', currentProfileId: A, ownerId: B, pmoId: A }), 'operator pmo can manage members');
assert(!canEditDraft({ role: 'sales', status: 'draft', currentProfileId: A, ownerId: B, pmoId: null }), 'ordinary sales member cannot manage members');
assert(!canEditDraft({ role: 'viewer', status: 'draft', currentProfileId: A, ownerId: A, pmoId: null }), 'viewer owner cannot manage members');
assert(!canEditDraft({ role: 'admin', status: 'submitted', currentProfileId: A, ownerId: A, pmoId: null }), 'non-draft admin cannot manage members');

const viewerCandidate = candidate({ profile_id: B, role: 'viewer', assignment_eligible: false });
const viewerAdd = canAddMemberCombination({
  members: [],
  selectedProfileId: B,
  selectedRole: 'EXPERT_REVIEWER',
  candidateIds: [viewerCandidate.profile_id],
});
assert(viewerAdd.valid, 'active viewer is a valid MEMBER candidate even when assignment_eligible=false');
const absentAdd = canAddMemberCombination({
  members: [],
  selectedProfileId: C,
  selectedRole: 'QUALITY',
  candidateIds: [viewerCandidate.profile_id],
});
assert(!absentAdd.valid && (absentAdd.reason ?? '').includes('不可用'), 'profile absent from MEMBER directory is invalid');

const tech = member({ profile_id: A, member_role: 'TECH_PROCESS' });
const duplicate = canAddMemberCombination({
  members: [tech],
  selectedProfileId: A,
  selectedRole: 'TECH_PROCESS',
  candidateIds: [A, B],
});
assert(!duplicate.valid && (duplicate.reason ?? '').includes('已承担此角色'), 'same profile + same role duplicate blocked');
assert(canAddMemberCombination({ members: [tech], selectedProfileId: A, selectedRole: 'QUALITY', candidateIds: [A, B] }).valid, 'same profile different role allowed');
assert(canAddMemberCombination({ members: [tech], selectedProfileId: B, selectedRole: 'TECH_PROCESS', candidateIds: [A, B] }).valid, 'different profile same role allowed');

const displayActive = resolveMemberDisplay(
  member({ profile_id: A, member_role: 'TECH_PROCESS' }),
  [participant({ profile_id: A, display_name: '张三' })],
  [candidate({ profile_id: A, display_name: '张三' })],
);
assert(displayActive.displayName === '张三' && displayActive.isActiveKnown && displayActive.isActive, 'active participant display resolves');

const displayInactive = resolveMemberDisplay(
  member({ profile_id: B, member_role: 'QUALITY' }),
  [participant({ profile_id: B, display_name: '李四', is_active: false })],
  [],
);
assert(displayInactive.historicalState === 'INACTIVE' && displayInactive.displayName === '李四', 'inactive historical member display preserved');

const displayOrphan = resolveMemberDisplay(
  member({ profile_id: C, member_role: 'OTHER' }),
  [],
  [],
);
assert(displayOrphan.displayName === '成员资料不可用' && displayOrphan.historicalState === 'ORPHAN', 'orphan member uses safe fallback');

assert(canSetMemberPrimary(member({ profile_id: A }), [participant({ profile_id: A, is_active: true })], []), 'active participant can set primary');
assert(!canSetMemberPrimary(member({ profile_id: A }), [participant({ profile_id: A, is_active: false })], []), 'inactive participant cannot set primary');
assert(!canSetMemberPrimary(member({ profile_id: C }), [], []), 'orphan cannot set primary');
assert(canSetMemberPrimary(member({ profile_id: C }), [], [candidate({ profile_id: C })]), 'orphan present in active directory can set primary');
assert(!canSetMemberPrimary(member({ profile_id: A, is_primary: true }), [participant({ profile_id: A })], []), 'already primary member has no set-primary action');

const existingTechA = member({ id: 'm-a', profile_id: A, member_role: 'TECH_PROCESS', is_primary: true });
const existingTechB = member({ id: 'm-b', profile_id: B, member_role: 'TECH_PROCESS', is_primary: false });
const existingQualityC = member({ id: 'm-c', profile_id: C, member_role: 'QUALITY', is_primary: true });
const primaryReconciled = reconcilePrimaryMember(
  [existingTechA, existingTechB, existingQualityC],
  member({ id: 'm-b', profile_id: B, member_role: 'TECH_PROCESS', is_primary: true }),
);
const techA = primaryReconciled.find(item => item.id === 'm-a');
const techB = primaryReconciled.find(item => item.id === 'm-b');
const qualityC = primaryReconciled.find(item => item.id === 'm-c');
assert(techA?.is_primary === false, 'set primary clears previous primary in same role');
assert(techB?.is_primary === true, 'target becomes primary');
assert(qualityC?.is_primary === true, 'other role primary preserved');

const appended = appendMemberIfMissing([existingTechA], member({ id: 'm-new', profile_id: B, member_role: 'QUALITY' }));
assert(appended.length === 2, 'add reconciliation appends new member');
const appendedTwice = appendMemberIfMissing(appended, member({ id: 'm-new', profile_id: B, member_role: 'QUALITY' }));
assert(appendedTwice.length === 2, 'add reconciliation is idempotent by member id');

const sameProfileOtherRole = member({ id: 'm-other', profile_id: A, member_role: 'QUALITY' });
const removed = removeMemberFromList([existingTechA, sameProfileOtherRole], 'm-a');
assert(removed.length === 1 && removed[0].id === 'm-other', 'remove only removes target review_members row');

const afterRemovePrimary = removeMemberFromList([existingTechA, existingTechB], 'm-a');
assert(afterRemovePrimary.length === 1 && afterRemovePrimary[0].is_primary === false, 'removing primary does not auto-promote another member');

const groups = groupMembersByRole([existingTechA, existingTechB, existingQualityC]);
assert(groups.length === 2 && groups[0].role === 'TECH_PROCESS' && groups[1].role === 'QUALITY', 'members grouped by member_role');

const conflict = classifyMemberMutationError(409, { code: 'VERSION_CONFLICT' });
assert(conflict.globalState === 'conflict', 'VERSION_CONFLICT maps to global conflict');
const draftOnly = classifyMemberMutationError(409, { code: 'DRAFT_ONLY' });
assert(draftOnly.globalState === 'non_editable', 'DRAFT_ONLY maps to global non-editable');
const forbidden = classifyMemberMutationError(403, { code: 'FORBIDDEN' });
assert(forbidden.globalState === 'forbidden', 'FORBIDDEN maps to global forbidden');
const notFound = classifyMemberMutationError(404, { code: 'NOT_FOUND' });
assert(notFound.globalState === 'reload_required', 'NOT_FOUND maps to global reload required');
const invalidMember = classifyMemberMutationError(400, { code: 'INVALID_MEMBER' });
assert(invalidMember.globalState === null && invalidMember.scopedState === 'stale_candidate', 'INVALID_MEMBER is scoped stale candidate');
const unique = classifyMemberMutationError(409, { code: 'UNIQUE_CONFLICT' });
assert(unique.globalState === null && unique.scopedState === 'duplicate', 'UNIQUE_CONFLICT is scoped duplicate');
const validation = classifyMemberMutationError(400, {});
assert(validation.scopedState === 'validation', 'generic 400 maps to scoped validation');
const generic = classifyMemberMutationError(500, { code: 'RAW_DB_CODE', message: 'secret db detail' });
assert(generic.scopedState === 'error' && !generic.scopedMessage.includes('secret'), 'generic 500 is scoped and does not leak raw error');

const guard = createMemberDirectoryGuard();
const request1 = guard.next();
assert(guard.isCurrent(request1), 'request 1 is current after next');
const request2 = guard.next();
assert(!guard.isCurrent(request1) && guard.isCurrent(request2), 'request 2 starts -> request 1 stale');
guard.invalidate();
assert(!guard.isCurrent(request2), 'invalidate makes request 2 stale without new request');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
