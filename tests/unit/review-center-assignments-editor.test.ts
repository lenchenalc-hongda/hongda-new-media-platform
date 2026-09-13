// ===== Review Center Assignments Editor Pure Helper Tests =====
import {
  buildAssignmentsRequest,
  canManageAssignments,
  classifyAssignmentsMutationError,
  eligibleAssignmentIds,
  isAssignmentsDirty,
  normalizeAssignments,
  planAssignmentsFallbackSync,
  resolveAssignmentDisplay,
  validateAssignmentDraft,
  type AssignmentCandidate,
  type AssignmentParticipantRef,
  type AssignmentsState,
} from '../../src/lib/review-center/assignments-editor';

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

function state(ownerId: string, pmoId: string | null = null): AssignmentsState {
  return { ownerId, pmoId };
}

function candidate(profileId: string, overrides: Partial<AssignmentCandidate> = {}): AssignmentCandidate {
  return {
    profile_id: profileId,
    display_name: '候选人',
    role: 'sales',
    department: null,
    assignment_eligible: true,
    ...overrides,
  };
}

function participant(profileId: string, overrides: Partial<AssignmentParticipantRef> = {}): AssignmentParticipantRef {
  return {
    profile_id: profileId,
    display_name: '历史人员',
    role: 'sales',
    department: null,
    is_active: true,
    ...overrides,
  };
}

console.log('\n=== Review Center Assignments Editor Pure Helpers ===');

assert(canManageAssignments({ role: 'admin', status: 'draft' }), 'admin + draft can manage assignments');
assert(canManageAssignments({ role: 'manager', status: 'draft' }), 'manager + draft can manage assignments');
assert(!canManageAssignments({ role: 'sales', status: 'draft' }), 'sales cannot manage assignments');
assert(!canManageAssignments({ role: 'operator', status: 'draft' }), 'operator cannot manage assignments');
assert(!canManageAssignments({ role: 'viewer', status: 'draft' }), 'viewer cannot manage assignments');
assert(!canManageAssignments({ role: 'admin', status: 'submitted' }), 'admin non-draft cannot manage assignments');

const normalized = normalizeAssignments({ owner_id: A, pmo_id: null });
assert(normalized.ownerId === A && normalized.pmoId === null, 'normalizeAssignments maps owner and null pmo');
assert(normalizeAssignments({ owner_id: A }).pmoId === null, 'missing pmo normalizes to null');

const baseline = state(A);
assert(!isAssignmentsDirty(baseline, state(A)), 'same assignments are clean');
assert(isAssignmentsDirty(baseline, state(B)), 'owner change is dirty');
assert(isAssignmentsDirty(baseline, state(A, C)), 'pmo change is dirty');
const versionDraft = { ...state(A), version: 99 } as AssignmentsState & { version: number };
assert(!isAssignmentsDirty(baseline, versionDraft), 'version-only change is not assignments dirty');

const candidateIds = eligibleAssignmentIds([
  candidate(A),
  candidate(B, { assignment_eligible: false }),
  candidate(C),
]);
assert(candidateIds.has(A) && candidateIds.has(C) && !candidateIds.has(B), 'eligible ids only include assignment_eligible candidates');

const candidates = [candidate(A), candidate(B), candidate(C)];
const valid = validateAssignmentDraft(state(A), candidates.map(c => c.profile_id));
assert(valid.ownerValid && valid.pmoValid && valid.canSave, 'owner A + pmo null is valid');
assert(validateAssignmentDraft(state(A, B), candidates.map(c => c.profile_id)).canSave, 'owner A + pmo B is valid');
assert(validateAssignmentDraft(state(A, A), candidates.map(c => c.profile_id)).canSave, 'owner and pmo same profile is valid');
const invalidOwner = validateAssignmentDraft(state('history-invalid', B), candidates.map(c => c.profile_id));
assert(!invalidOwner.canSave && (invalidOwner.reason ?? '').includes('项目负责人'), 'ineligible owner blocks save');
const invalidPmo = validateAssignmentDraft(state(A, 'history-invalid'), candidates.map(c => c.profile_id));
assert(!invalidPmo.canSave && (invalidPmo.reason ?? '').includes('PMO'), 'ineligible pmo blocks save');
assert(!validateAssignmentDraft(state('', null), candidates.map(c => c.profile_id)).ownerValid, 'empty owner is invalid');

const activeParticipant = participant(A, { display_name: '张三', department: '销售部' });
const activeDisplay = resolveAssignmentDisplay(A, [activeParticipant], [candidate(A)], '负责人资料不可用');
assert(activeDisplay.displayName === '张三' && activeDisplay.meta.includes('销售部') && activeDisplay.eligible, 'active participant display uses participant');

const inactiveDisplay = resolveAssignmentDisplay(B, [participant(B, { display_name: '李四', is_active: false })], [], '负责人资料不可用');
assert(inactiveDisplay.displayName === '李四' && inactiveDisplay.meta.includes('已停用') && !inactiveDisplay.eligible, 'inactive historical participant displayed with inactive marker');

const viewerDisplay = resolveAssignmentDisplay(C, [participant(C, { display_name: '王五', role: 'viewer' })], [], '负责人资料不可用');
assert(viewerDisplay.meta.includes('当前不可分配') && !viewerDisplay.eligible, 'viewer historical assignment marked unavailable');

const orphanDisplay = resolveAssignmentDisplay('orphan-uuid', [], [], '负责人资料不可用');
assert(orphanDisplay.displayName === '负责人资料不可用' && orphanDisplay.meta.includes('历史人员资料已不可用') && !orphanDisplay.eligible, 'orphan assignment uses safe fallback');

const noPmoDisplay = resolveAssignmentDisplay(null, [], [], 'PMO资料不可用');
assert(noPmoDisplay.displayName === '未设置' && noPmoDisplay.eligible, 'null pmo displays unset');

const candidateFallback = resolveAssignmentDisplay(B, [], [candidate(B, { display_name: '赵六', department: '品质部' })], 'PMO资料不可用');
assert(candidateFallback.displayName === '赵六' && candidateFallback.meta.includes('品质部') && candidateFallback.eligible, 'candidate directory fallback resolves display');

const requestWithNull = buildAssignmentsRequest(5, state(B));
assert(Object.prototype.hasOwnProperty.call(requestWithNull, 'pmoId'), 'pmoId key is always sent');
assert(requestWithNull.expectedVersion === 5 && requestWithNull.ownerId === B && requestWithNull.pmoId === null, 'payload sends expectedVersion, ownerId, explicit null pmo');
assert(buildAssignmentsRequest(6, state(A, C)).pmoId === C, 'payload sends uuid pmo when set');

const versionConflict = classifyAssignmentsMutationError(409, { code: 'VERSION_CONFLICT' });
assert(versionConflict.globalState === 'conflict', 'VERSION_CONFLICT maps to global conflict');
const draftOnly = classifyAssignmentsMutationError(409, { code: 'DRAFT_ONLY' });
assert(draftOnly.globalState === 'non_editable', 'DRAFT_ONLY maps to global non-editable');
const forbidden = classifyAssignmentsMutationError(403, { code: 'FORBIDDEN' });
assert(forbidden.globalState === 'forbidden', 'FORBIDDEN maps to global forbidden');
const notFound = classifyAssignmentsMutationError(404, { code: 'NOT_FOUND' });
assert(notFound.globalState === 'reload_required', 'NOT_FOUND maps to global reload required');
const invalidMember = classifyAssignmentsMutationError(400, { code: 'INVALID_MEMBER' });
assert(invalidMember.globalState === null && invalidMember.scopedState === 'invalid_member', 'INVALID_MEMBER is assignments scoped');
const validation400 = classifyAssignmentsMutationError(400, {});
assert(validation400.scopedState === 'validation', 'generic 400 maps to scoped validation');
const generic500 = classifyAssignmentsMutationError(500, { code: 'RAW_DB_CODE' });
assert(generic500.scopedState === 'error' && generic500.scopedMessage.includes('稍后重试'), 'generic 500 is scoped and does not leak raw code');

const fallbackConflict = planAssignmentsFallbackSync(state(A), state(B), state(C));
assert(fallbackConflict.conflict === true && fallbackConflict.initial === null, 'dirty assignments + remote assignment change fails closed');
const fallbackClean = planAssignmentsFallbackSync(state(A), state(A), state(C, B));
assert(fallbackClean.conflict === false && fallbackClean.initial?.ownerId === C && fallbackClean.draft?.pmoId === B, 'clean assignments sync to latest remote assignments');
const fallbackDirtyNoRemote = planAssignmentsFallbackSync(state(A), state(B), state(A));
assert(fallbackDirtyNoRemote.conflict === false && fallbackDirtyNoRemote.initial === null && fallbackDirtyNoRemote.draft === null, 'dirty assignments with unchanged remote values keep local draft');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
